/**
 * @file `/v1/approvals`: World ID approvals that end in an EIP-712 signature
 * from the approver key (PLAN section 7). Both routes sit behind the bearer token.
 * - `POST /v1/approvals` validates what will be signed, opens an IDKit proof
 *   request bound to it and returns its `connectUrl`.
 * - `POST /v1/approvals/:id/complete` (no body) checks the proof request once:
 *   202 while pending; otherwise the approval is consumed and the proof is checked,
 *   verified with World, compared to the human bound onchain, and signed.
 */
import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { encodePacked, keccak256, zeroHash, type Address, type Hex } from 'viem';
import { z } from 'zod';
import type { ApprovalPoll, ApprovalResult, ApprovalStart } from '../api';
import type { WorldMode } from '../config';
import { apiError, maskAddress, type Env } from '../http';
import { formatAmount, toChecksumAddress } from '../intent';
import type { Network } from '../network';
import { computeIntentHash, BEAM_PAY_ABI } from '../beamPay';
import { WalletAddress } from '../schemas';
import { ApprovalError, proofInvalid } from './errors';
import type { SessionStore } from './sessions';
import type { Approver } from './signer';
import { createApprovalStore, type ApprovalFields, type ApprovalStore, type PendingApproval } from './store';
import { approvalSignal, checkProof, type ProvenHuman, type WorldId } from './worldId';

/** Approvals expire five minutes after they start. */
export const APPROVAL_TTL_MS = 5 * 60_000;
/** BeamPay's `MAX_CAP` (1000 tokens). ponytail: mirrored constant, saves an RPC per cap approval; the contract enforces it anyway. */
export const MAX_CAP_WEI = 1_000n * 10n ** 18n;
/** Signed approvals are valid onchain for at most this long. */
const SIGNATURE_TTL_S = 300;
const UINT256_MAX = 2n ** 256n - 1n;

/** Everything the approval routes need; all I/O injected. */
export type ApprovalDeps = {
  /** Null when `WORLD_MODE=off` (both routes answer 503). */
  world: WorldId | null;
  /** Null only when `world` is null. */
  approver: Approver | null;
  sessions: SessionStore;
  /** BeamPay reads (`humanOf`, `nonces`). */
  chain: { readContract: (args: { address: Address; abi: typeof BEAM_PAY_ABI; functionName: 'humanOf' | 'nonces'; args: [Address] }) => Promise<unknown> };
  network: Network;
  beamPay: Address;
  humanHashSalt: Hex;
  now?: () => number;
  store?: ApprovalStore;
};

/** The routes plus the hooks the app and handle routes use. */
export type Approvals = {
  /** Mount at `/v1/approvals` behind auth. */
  routes: Hono<Env>;
  /** Whether an approval id is pending or recently used (polls of known ids get their own rate limit). */
  isKnown: (approvalId: string) => boolean;
  /** Redeems a completed `handle` approval once (see `HandleRouteDeps`). */
  takeHandleApproval: (approvalId: string, wallet: Address) => { humanHash: Hex } | null;
  mode: WorldMode;
};

const WeiString = z
  .string()
  .regex(/^\d{1,78}$/, 'must be a decimal wei string')
  .transform((v) => BigInt(v))
  .refine((v) => v <= UINT256_MAX, 'out of range');
const Bytes32 = z.templateLiteral(['0x', z.string().regex(/^[0-9a-fA-F]{64}$/)]);

const StartSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('link'), wallet: WalletAddress }),
  z.object({ kind: z.literal('handle'), wallet: WalletAddress }),
  z.object({ kind: z.literal('cap'), wallet: WalletAddress, cap: z.object({ capWei: WeiString }) }),
  z.object({
    kind: z.literal('pay'),
    wallet: WalletAddress,
    pay: z.object({
      intentId: z.string().min(1).max(100),
      to: z.string().max(100),
      amountWei: WeiString,
      intentHash: Bytes32,
      expiresAt: z.number().int().positive().optional(),
    }),
  }),
]);

/**
 * Builds the approval routes.
 * @param deps World ID client, approver, session store, chain reads, network and config.
 * @returns Routes and hooks.
 */
export function createApprovals(deps: ApprovalDeps): Approvals {
  const now = deps.now ?? Date.now;
  const store = deps.store ?? createApprovalStore(now);
  const { network, beamPay, sessions } = deps;
  const routes = new Hono<Env>();
  const notConfigured = (c: Context<Env>) => apiError(c, 503, 'WORLD_NOT_CONFIGURED', 'World ID approvals are not set up on this server.');
  const notLinked = () => new ApprovalError(403, 'NOT_LINKED', 'Link World ID in Profile to approve this.');
  const mismatch = (message = "This World ID isn't linked to this wallet.") => new ApprovalError(403, 'HUMAN_MISMATCH', message);
  const humanHashOf = (sessionId: string) => keccak256(encodePacked(['bytes32', 'string'], [deps.humanHashSalt, sessionId]));

  /** Reads one BeamPay mapping for a wallet; RPC failure is a 503. */
  const read = async <T>(functionName: 'humanOf' | 'nonces', wallet: Address): Promise<T> => {
    try {
      return (await deps.chain.readContract({ address: beamPay, abi: BEAM_PAY_ABI, functionName, args: [wallet] })) as T;
    } catch {
      throw new ApprovalError(503, 'INTERNAL', `Couldn't reach ${network.name}. Try again.`);
    }
  };

  /** Turns an `ApprovalError` (or anything else) into the JSON error response and logs the outcome. */
  const fail = (c: Context<Env>, e: unknown, log: Record<string, unknown>) => {
    const err = e instanceof ApprovalError ? e : new ApprovalError(500, 'INTERNAL', 'Something went wrong. Try again.');
    c.set('log', { ...log, outcome: err.code });
    return apiError(c, err.status, err.code, err.message);
  };

  routes.post('/', async (c) => {
    const { world } = deps;
    if (!world || !deps.approver) return notConfigured(c);
    const parsed = StartSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return apiError(c, 400, 'BAD_REQUEST', z.prettifyError(parsed.error).slice(0, 300));
    const req = parsed.data;
    const log = { kind: req.kind, wallet: maskAddress(req.wallet) };
    try {
      const fields = toFields(req, network, now());
      // Linking proves the saved session when there is one (a retry), else enrolls a new human.
      const session = sessions.byWallet(req.wallet);
      if (fields.kind !== 'link' && ((await read<Hex>('humanOf', req.wallet)) === zeroHash || !session)) throw notLinked();
      const id = randomUUID();
      const signal = approvalSignal(id, req.wallet, fields);
      const sessionId = session?.sessionId ?? null;
      const request = await world.request({ signal, sessionId, description: describe(fields, network) });
      const approval: PendingApproval = { id, wallet: req.wallet, fields, signal, sessionId, request, expiresAt: now() + APPROVAL_TTL_MS };
      store.add(approval);
      c.set('log', { ...log, approvalId: id, outcome: 'started' });
      const body: ApprovalStart = { approvalId: id, connectUrl: request.connectUrl, expiresAt: approval.expiresAt };
      return c.json(body, 201);
    } catch (e) {
      return fail(c, e, log);
    }
  });

  routes.post('/:id/complete', async (c) => {
    if (!deps.world || !deps.approver) return notConfigured(c);
    const id = c.req.param('id').slice(0, 64);
    let log: Record<string, unknown> = { approvalId: id };
    try {
      const approval = pendingApproval(id);
      log = { ...log, kind: approval.fields.kind, wallet: maskAddress(approval.wallet) };
      if (approval.expiresAt <= now()) {
        store.consume(id);
        throw new ApprovalError(410, 'APPROVAL_EXPIRED', 'Approval expired. Try again.');
      }
      const status = await approval.request.poll();
      // Re-check after the await: a concurrent poll may have consumed it meanwhile.
      pendingApproval(id);
      if (status.status === 'pending') {
        c.set('log', { ...log, outcome: 'pending' });
        return c.json({ status: 'pending' } satisfies ApprovalPoll, 202);
      }
      // Single use from here on: whatever happens next, this approval cannot be completed again.
      // ponytail: a verifier outage after this point loses the proof (the user approves again). Ceiling: rare 503s.
      // Upgrade path: keep the confirmed result on the approval and re-verify on the next poll.
      store.consume(id);
      if (status.status === 'cancelled') throw new ApprovalError(400, 'APPROVAL_CANCELLED', 'Approval cancelled. Nothing was sent.');
      if (status.status === 'failed') throw proofInvalid(`World App returned ${status.error}`);
      const proof = checkProof(status.result, { environment: deps.world.environment, signal: approval.signal, sessionId: approval.sessionId });
      await deps.world.verify(status.result);
      const result = await sign(approval, proof, deps.approver);
      c.set('log', { ...log, outcome: result.alreadyLinked ? 'already_linked' : 'approved' });
      return c.json({ status: 'approved', ...result } satisfies ApprovalPoll);
    } catch (e) {
      return fail(c, e, log);
    }
  });

  /**
   * A pending approval by id.
   * @param id Approval id.
   * @returns The approval.
   * @throws ApprovalError 409 when already used, 404 when unknown.
   */
  function pendingApproval(id: string): PendingApproval {
    if (store.wasUsed(id)) throw new ApprovalError(409, 'APPROVAL_USED', 'This approval was already used. Start again.');
    const approval = store.get(id);
    if (!approval) throw new ApprovalError(404, 'APPROVAL_NOT_FOUND', 'Approval not found. Start again.');
    return approval;
  }

  /**
   * After verification: binds the human (link) or requires the bound one, then signs.
   * @param approval The consumed approval.
   * @param proof Session (and enrollment nullifier) the verified proof carries.
   * @param signer The approver.
   * @returns The approval result for the app.
   */
  async function sign(approval: PendingApproval, proof: ProvenHuman, signer: Approver): Promise<ApprovalResult> {
    const { fields, wallet } = approval;
    // One link per human: an enrollment nullifier seen before keeps its first session.
    const enrolled = proof.nullifier === null ? undefined : sessions.byNullifier(proof.nullifier);
    if (enrolled && enrolled.wallet !== wallet) throw mismatch('This World ID is already linked to another wallet.');
    const sessionId = enrolled?.sessionId ?? proof.sessionId;
    const humanHash = humanHashOf(sessionId);
    const [linked, nonce] = await Promise.all([read<Hex>('humanOf', wallet), read<bigint>('nonces', wallet)]);
    const t = now();
    const deadlineS = (cap: number | null) => {
      const s = Math.floor(t / 1000) + SIGNATURE_TTL_S;
      return cap === null ? s : Math.min(s, Math.floor(cap / 1000));
    };

    if (fields.kind === 'link') {
      if (linked !== zeroHash && linked !== humanHash) throw mismatch();
      if (proof.nullifier !== null && !enrolled) sessions.save(wallet, { sessionId, nullifier: proof.nullifier, linkedAt: t });
      if (linked === humanHash) return { kind: 'link', humanHash, alreadyLinked: true };
      const deadline = deadlineS(null);
      const signature = await signer.signLink({ account: wallet, humanHash, nonce, deadline: BigInt(deadline) });
      return { kind: 'link', signature, humanHash, deadline };
    }
    if (linked === zeroHash) throw notLinked();
    if (linked !== humanHash) throw mismatch();
    if (fields.kind === 'handle') {
      store.completeHandle(approval.id, wallet, humanHash, t + APPROVAL_TTL_MS);
      return { kind: 'handle', humanHash };
    }
    if (fields.kind === 'cap') {
      const deadline = deadlineS(null);
      const signature = await signer.signCap({ account: wallet, cap: fields.capWei, nonce, deadline: BigInt(deadline) });
      return { kind: 'cap', signature, humanHash, deadline };
    }
    if (fields.intentExpiresAt !== null && fields.intentExpiresAt <= t) throw new ApprovalError(410, 'APPROVAL_EXPIRED', 'This payment expired. Ask again.');
    const deadline = deadlineS(fields.intentExpiresAt);
    const signature = await signer.signPay({ payer: wallet, to: fields.to, amount: fields.amountWei, intentHash: fields.intentHash, nonce, deadline: BigInt(deadline) });
    return { kind: 'pay', signature, humanHash, deadline };
  }

  return {
    routes,
    isKnown: (approvalId) => store.wasUsed(approvalId) || store.get(approvalId) !== undefined,
    takeHandleApproval: (approvalId, wallet) => store.takeHandle(approvalId, wallet),
    mode: deps.world?.environment ?? 'off',
  };
}

/**
 * Validates a start request's fields and fixes what will be signed.
 * @param req Parsed start request.
 * @param network The server's network.
 * @param now Current time (epoch ms).
 * @returns Approval fields.
 * @throws ApprovalError 422 INTENT_INVALID when the payment or cap is unsafe to sign.
 */
function toFields(req: z.infer<typeof StartSchema>, network: Network, now: number): ApprovalFields {
  const bad = (message: string) => new ApprovalError(422, 'INTENT_INVALID', message);
  if (req.kind === 'link' || req.kind === 'handle') return { kind: req.kind };
  if (req.kind === 'cap') {
    if (req.cap.capWei <= 0n || req.cap.capWei > MAX_CAP_WEI) {
      throw bad(`The cap must be above 0 and at most ${formatAmount(MAX_CAP_WEI, network)}.`);
    }
    return { kind: 'cap', capWei: req.cap.capWei };
  }
  const { pay } = req;
  const to = toChecksumAddress(pay.to);
  if (!to || /^0x0{40}$/.test(to)) throw bad('That payment has an invalid recipient.');
  if (pay.amountWei <= 0n) throw bad('That payment has no amount.');
  if (pay.expiresAt !== undefined && pay.expiresAt <= now) throw bad('This payment expired. Ask again.');
  const intentHash = computeIntentHash(pay.intentId, to, pay.amountWei, network.chainId);
  if (intentHash !== pay.intentHash.toLowerCase()) throw bad("That payment doesn't match its intent hash.");
  return { kind: 'pay', intentId: pay.intentId, to, amountWei: pay.amountWei, intentHash, intentExpiresAt: pay.expiresAt ?? null };
}

/**
 * What World App shows the human for a session proof.
 * @param fields Approval fields.
 * @param network Network for amount formatting.
 * @returns One line of copy.
 */
function describe(fields: ApprovalFields, network: Network): string {
  switch (fields.kind) {
    case 'link':
      return 'Link your World ID to your Beam wallet';
    case 'handle':
      return 'Claim an Beam handle';
    case 'cap':
      return `Raise your Beam per-payment cap to ${formatAmount(fields.capWei, network)}`;
    case 'pay':
      return `Pay ${formatAmount(fields.amountWei, network, network.amountDecimals)} to ${maskAddress(fields.to)} from Beam`;
  }
}
