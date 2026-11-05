/**
 * @file In-memory store for pending World ID approvals and completed handle
 * approvals. Entries expire after their TTL and are swept lazily on access,
 * so there are no timers to leak.
 *
 * ponytail: in-memory approvals, single server instance. Ceiling: one process,
 * lost on restart (users just approve again). Upgrade path: Redis with TTL keys
 * and an atomic GETDEL for `consume` if the server scales out.
 */
import type { Address, Hex } from 'viem';
import type { ProofRequest } from './worldId';

/** What exactly an approval will sign, fixed at creation. */
export type ApprovalFields =
  | { kind: 'link' }
  | { kind: 'handle' }
  | { kind: 'cap'; capWei: bigint }
  | {
      kind: 'pay';
      intentId: string;
      to: Address;
      amountWei: bigint;
      intentHash: Hex;
      /** Intent expiry (epoch ms) when the app sent it; the signed deadline never exceeds it. */
      intentExpiresAt: number | null;
    };

/** A started approval waiting for its World ID proof. */
export type PendingApproval = {
  id: string;
  wallet: Address;
  fields: ApprovalFields;
  /** The proof's signal; binds it to this approval and exactly what will be signed. */
  signal: string;
  /** The session the proof must be for, or null when this approval enrolls (link) a new human. */
  sessionId: `session_${string}` | null;
  /** The live IDKit request (holds the bridge key; never leaves the server). */
  request: ProofRequest;
  expiresAt: number;
};

/** The approval store. All methods sweep expired entries first. */
export type ApprovalStore = {
  add: (approval: PendingApproval) => void;
  /** A pending approval, including recently expired ones (callers check `expiresAt`). */
  get: (id: string) => PendingApproval | undefined;
  /** Removes a pending approval for good and remembers its id as used until it would have expired. */
  consume: (id: string) => void;
  /** Whether `consume` already ran for this id (a replay). */
  wasUsed: (id: string) => boolean;
  /** Records a completed `handle` approval that `takeHandle` may redeem once before `until`. */
  completeHandle: (id: string, wallet: Address, humanHash: Hex, until: number) => void;
  /** Redeems a completed handle approval once; null when unknown, expired, used, or for another wallet. */
  takeHandle: (id: string, wallet: Address) => { humanHash: Hex } | null;
};

/** Expired approvals are kept this long so a late `complete` gets 410 APPROVAL_EXPIRED rather than 404. */
const EXPIRED_GRACE_MS = 10 * 60_000;

/**
 * Creates an empty store.
 * @param now Clock (epoch ms); injectable for tests.
 * @returns The store.
 */
export function createApprovalStore(now: () => number = Date.now): ApprovalStore {
  const pending = new Map<string, PendingApproval>();
  const used = new Map<string, number>();
  const handles = new Map<string, { wallet: Address; humanHash: Hex; until: number }>();

  const sweep = () => {
    const t = now();
    for (const [id, p] of pending) {
      if (p.expiresAt + EXPIRED_GRACE_MS <= t) pending.delete(id);
    }
    for (const [id, until] of used) if (until <= t) used.delete(id);
    for (const [id, h] of handles) if (h.until <= t) handles.delete(id);
  };

  return {
    add: (approval) => {
      sweep();
      pending.set(approval.id, approval);
    },
    get: (id) => {
      sweep();
      return pending.get(id);
    },
    consume: (id) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      used.set(id, Math.max(p.expiresAt, now() + 60_000));
      sweep();
    },
    wasUsed: (id) => {
      const until = used.get(id);
      return until !== undefined && until > now();
    },
    completeHandle: (id, wallet, humanHash, until) => {
      sweep();
      handles.set(id, { wallet, humanHash, until });
    },
    takeHandle: (id, wallet) => {
      sweep();
      const h = handles.get(id);
      if (!h || h.wallet !== wallet) return null;
      handles.delete(id);
      return { humanHash: h.humanHash };
    },
  };
}
