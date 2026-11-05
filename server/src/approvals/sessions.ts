/**
 * @file Which World ID session each linked wallet proves on later approvals,
 * plus the enrollment nullifier that keeps it to one link per human.
 * A tiny JSON file keyed by wallet (atomic writes via `jsonFile.ts`); the chain
 * stays the source of truth for the link itself (`BeamPay.humanOf`).
 *
 * ponytail: single-instance file store held in memory. Ceiling: one server
 * process; losing the file strands linked wallets (BeamPay has no unlink), so back
 * it up. Upgrade path: a DB table with UNIQUE (nullifier) if the server scales out.
 */
import { getAddress, type Address } from 'viem';
import { readJsonFile, writeJsonFile } from '../jsonFile';

/** A linked human: the session to prove and the nullifier of the uniqueness proof that created it. */
export type HumanSession = {
  sessionId: `session_${string}`;
  /** Decimal string of the RP and action scoped nullifier from enrollment. */
  nullifier: string;
  linkedAt: number;
};

/** Read and write access to linked sessions. */
export type SessionStore = {
  byWallet: (wallet: Address) => HumanSession | undefined;
  /** The enrollment (and its wallet) that used this nullifier, if any. */
  byNullifier: (nullifier: string) => (HumanSession & { wallet: Address }) | undefined;
  save: (wallet: Address, session: HumanSession) => void;
};

type FileShape = { v: 1; sessions: Record<string, HumanSession> };

/**
 * Opens (or starts) the store at `path`.
 * @param path JSON file path, e.g. "data/world-sessions.json".
 * @returns The store.
 */
export function createSessionStore(path: string): SessionStore {
  const parsed = readJsonFile(path) as Partial<FileShape> | undefined;
  let sessions: Record<string, HumanSession> = parsed?.v === 1 && parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {};
  const key = (wallet: Address) => wallet.toLowerCase();

  return {
    byWallet: (wallet) => sessions[key(wallet)],
    byNullifier: (nullifier) => {
      const hit = Object.entries(sessions).find(([, s]) => s.nullifier === nullifier);
      return hit && { ...hit[1], wallet: getAddress(hit[0]) };
    },
    save: (wallet, session) => {
      const next = { ...sessions, [key(wallet)]: session };
      writeJsonFile(path, { v: 1, sessions: next } satisfies FileShape);
      sessions = next;
    },
  };
}
