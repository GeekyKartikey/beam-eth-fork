/**
 * @file World ID approvals end to end through the real HTTP app, with the IDKit
 * bridge and the developer portal faked (no network): start → pending → proof →
 * checks → portal verify → EIP-712 signature that recovers to the approver.
 * Also enrollment rules, cancellation, expiry, replay, signal/environment/session
 * binding, verifier failures, the poll rate limit and log hygiene.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import type { IDKitResult } from '@worldcoin/idkit-core';
import { encodePacked, keccak256, parseEther, recoverTypedDataAddress, stringToHex, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it, vi } from 'vitest';
import type { ApprovalStart } from '../src/api';
import { worldUnavailable } from '../src/approvals/errors';
import { createApprovals } from '../src/approvals/routes';
import { createSessionStore } from '../src/approvals/sessions';
import { createApprover } from '../src/approvals/signer';
import { VERIFY_URL, verifyProof, WORLD_ACTION, type ProofParams, type ProofStatus, type WorldId } from '../src/approvals/worldId';
import { createApp } from '../src/index';
import { APPROVAL_TYPES, computeIntentHash, beamPayDomain } from '../src/beamPay';
import { ARC, mockChain, mockEns, BEAM_PAY, OTHER, RECIPIENT, WALLET, type ChainOpts } from './helpers';

const TOKEN = 'test-token';
const SALT = keccak256(stringToHex('test-salt'));
const RP_ID = 'rp_346985f8929bb5cf';
const APPROVER_KEY = generatePrivateKey();
const APPROVER = privateKeyToAccount(APPROVER_KEY).address;
const T0 = 1_800_000_000_000;
const SESSION = `session_${'0a'.repeat(32)}01${'0b'.repeat(31)}` as const;
const OTHER_SESSION = `session_${'0c'.repeat(32)}01${'0d'.repeat(31)}` as const;
const NULLIFIER = '123456789012345678901234567890';
const HUMAN = keccak256(encodePacked(['bytes32', 'string'], [SALT, SESSION]));
const OTHER_HUMAN = keccak256(encodePacked(['bytes32', 'string'], [SALT, OTHER_SESSION]));

type Started = ProofParams & { next: ProofStatus | Error };

/**
 * A confirmed IDKit result for a proof request, as the bridge would return it.
 * @param p The request's params (signal and session).
 * @param over Field overrides (environment, session, signal hash...).
 * @returns A 4.0 uniqueness+session result (enrollment) or session result.
 */
function proofFor(p: ProofParams, over: { environment?: string; sessionId?: string; signal?: string; nullifier?: string } = {}): IDKitResult {
  const response = { identifier: 'proof_of_human', signal_hash: hashSignal(over.signal ?? p.signal), proof: ['1', '2', '3', '4', '5'], issuer_schema_id: 1, expires_at_min: 0 };
  const common = { protocol_version: '4.0', nonce: '0x01', environment: over.environment ?? 'staging', session_id: over.sessionId ?? p.sessionId ?? SESSION };
  return (
    p.sessionId === null
      ? { ...common, action: WORLD_ACTION, responses: [{ ...response, nullifier: over.nullifier ?? NULLIFIER }] }
      : { ...common, responses: [{ ...response, session_nullifier: ['7', '8'] }] }
  ) as IDKitResult;
}

function setup(chainOpts: ChainOpts = {}) {
  let clock = T0;
  const now = () => clock;
  const logs: string[] = [];
  const chain = mockChain({ nonce: 7n, ...chainOpts });
  const sessions = createSessionStore(join(mkdtempSync(join(tmpdir(), 'beam-sessions-')), 'world-sessions.json'));
  const started: Started[] = [];
  const portal = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ success: true, environment: 'staging' }));
  const world: WorldId = {
    environment: 'staging',
    request: vi.fn(async (p: ProofParams) => {
      const entry: Started = { ...p, next: { status: 'pending' } };
      started.push(entry);
      return {
        connectUrl: `https://staging.world.org/verify?t=wld&i=${started.length}`,
        poll: async () => {
          if (entry.next instanceof Error) throw entry.next;
          return entry.next;
        },
      };
    }),
    verify: (result) => verifyProof(result, { rpId: RP_ID, environment: 'staging' }, portal as unknown as typeof fetch),
  };
  const approvals = createApprovals({
    world,
    approver: createApprover(APPROVER_KEY, ARC.chainId, BEAM_PAY),
    sessions,
    chain,
    network: ARC,
    beamPay: BEAM_PAY,
    humanHashSalt: SALT,
    now,
  });
  const app = createApp({
    agentToken: TOKEN,
    model: 'm',
    chain,
    ens: mockEns(),
    network: ARC,
    beamPay: BEAM_PAY,
    createMessage: null,
    approvals,
    handleRoutes: null,
    handlesEnabled: false,
    ensChainId: 1,
    now,
    log: (l) => logs.push(l),
  });
  const auth = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

  const start = async (body: Record<string, unknown>) => {
    const res = await app.request('/v1/approvals', { method: 'POST', headers: auth, body: JSON.stringify({ wallet: WALLET, ...body }) });
    return { status: res.status, json: (await res.json()) as ApprovalStart & { error?: string; message?: string } };
  };
  const complete = async (id: string) => {
    const res = await app.request(`/v1/approvals/${id}/complete`, { method: 'POST', headers: { authorization: auth.authorization } });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  };
  const last = () => started.at(-1) as Started;
  /** Starts an approval, lets World App answer, and completes it. */
  const approve = async (body: Record<string, unknown>, answer: (p: ProofParams) => ProofStatus = (p) => ({ status: 'confirmed', result: proofFor(p) })) => {
    const s = await start(body);
    expect(s.status).toBe(201);
    last().next = answer(last());
    return { ...(await complete(s.json.approvalId)), approvalId: s.json.approvalId };
  };
  /** Links WALLET to SESSION in the session store, as a prior enrollment would. */
  const enroll = (wallet = WALLET) => sessions.save(wallet, { sessionId: SESSION, nullifier: NULLIFIER, linkedAt: T0 });
  return { app, approvals, sessions, world, portal, started, start, complete, approve, enroll, last, logs, chain, auth, advance: (ms: number) => (clock += ms) };
}

const payFields = (over: Record<string, unknown> = {}) => {
  const amountWei = parseEther('40');
  return { intentId: 'intent-1', to: RECIPIENT, amountWei: amountWei.toString(), intentHash: computeIntentHash('intent-1', RECIPIENT, amountWei, ARC.chainId), ...over };
};

const recover = (primaryType: keyof typeof APPROVAL_TYPES, message: Record<string, unknown>, signature: Hex) =>
  recoverTypedDataAddress({ domain: beamPayDomain(ARC.chainId, BEAM_PAY), types: APPROVAL_TYPES, primaryType, message, signature } as Parameters<
    typeof recoverTypedDataAddress
  >[0]);

describe('approvals: start', () => {
  it('link returns an https connectUrl and expiry; the proof is an enrollment bound to this approval', async () => {
    const { start, last } = setup();
    const { status, json } = await start({ kind: 'link' });
    expect(status).toBe(201);
    expect(json).toEqual({ approvalId: expect.any(String), connectUrl: expect.stringMatching(/^https:\/\//), expiresAt: T0 + 5 * 60_000 });
    expect(last()).toMatchObject({ sessionId: null, signal: `beam:${json.approvalId}:link:${WALLET}:` });
  });

  it('pay and cap signals carry the exact intent hash and cap; pay proves the saved session with a description', async () => {
    const { start, last, enroll } = setup({ humanOf: HUMAN });
    enroll();
    const pay = await start({ kind: 'pay', pay: payFields() });
    expect(last()).toMatchObject({ sessionId: SESSION, signal: `beam:${pay.json.approvalId}:pay:${WALLET}:${payFields().intentHash}`, description: expect.stringContaining('Pay 40') });
    const cap = await start({ kind: 'cap', cap: { capWei: parseEther('50').toString() } });
    expect(last().signal).toBe(`beam:${cap.json.approvalId}:cap:${WALLET}:${parseEther('50')}`);
  });

  it('WORLD_MODE=off → 503 WORLD_NOT_CONFIGURED on both routes', async () => {
    const approvals = createApprovals({ world: null, approver: null, sessions: createSessionStore('/nonexistent.json'), chain: mockChain(), network: ARC, beamPay: BEAM_PAY, humanHashSalt: SALT });
    const res = await approvals.routes.request('/', { method: 'POST', body: '{}' });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'WORLD_NOT_CONFIGURED' });
    expect((await approvals.routes.request('/x/complete', { method: 'POST' })).status).toBe(503);
    expect(approvals.mode).toBe('off');
  });

  it.each([
    ['unknown kind', { kind: 'relink' }],
    ['bad wallet', { kind: 'link', wallet: '0x12' }],
    ['cap without cap', { kind: 'cap' }],
    ['non-decimal wei', { kind: 'cap', cap: { capWei: '1e18' } }],
  ])('%s → 400 BAD_REQUEST', async (_, body) => {
    const { start } = setup();
    const { status, json } = await start(body);
    expect(status).toBe(400);
    expect(json.error).toBe('BAD_REQUEST');
  });

  it.each([
    ['tampered intent hash', payFields({ intentHash: `0x${'00'.repeat(32)}` })],
    ['zero recipient', payFields({ to: `0x${'0'.repeat(40)}` })],
    ['zero amount', payFields({ amountWei: '0' })],
    ['expired intent', payFields({ expiresAt: T0 - 1 })],
  ])('pay with %s → 422 INTENT_INVALID, nothing requested from World', async (_, pay) => {
    const { start, world, enroll } = setup({ humanOf: HUMAN });
    enroll();
    const { status, json } = await start({ kind: 'pay', pay });
    expect(status).toBe(422);
    expect(json.error).toBe('INTENT_INVALID');
    expect(world.request).not.toHaveBeenCalled();
  });

  it.each(['0', (parseEther('1000') + 1n).toString()])('cap %s outside (0, MAX_CAP] → 422', async (capWei) => {
    const { start, enroll } = setup({ humanOf: HUMAN });
    enroll();
    expect((await start({ kind: 'cap', cap: { capWei } })).status).toBe(422);
  });

  it.each([
    ['pay', { pay: payFields() }],
    ['cap', { cap: { capWei: '1' } }],
    ['handle', {}],
  ])('%s on an unlinked wallet → 403 NOT_LINKED', async (kind, extra) => {
    const { start } = setup();
    const { status, json } = await start({ kind, ...extra });
    expect(status).toBe(403);
    expect(json.error).toBe('NOT_LINKED');
  });

  it('linked onchain but no session on this server → 403 NOT_LINKED', async () => {
    const { start } = setup({ humanOf: HUMAN });
    expect((await start({ kind: 'handle' })).json.error).toBe('NOT_LINKED');
  });

  it('bridge unreachable on start → 503 WORLD_UNAVAILABLE; RPC down → 503', async () => {
    const s = setup();
    vi.mocked(s.world.request).mockRejectedValueOnce(worldUnavailable('bridge unreachable'));
    expect(await s.start({ kind: 'link' })).toMatchObject({ status: 503, json: { error: 'WORLD_UNAVAILABLE' } });
    const down = setup({ fail: true });
    expect((await down.start({ kind: 'handle' })).status).toBe(503);
  });
});

describe('approvals: complete', () => {
  it('pending → 202 until World App answers; link → HumanLink that recovers to the approver; the session is saved', async () => {
    const { start, complete, last, sessions, portal } = setup();
    const s = await start({ kind: 'link' });
    expect(await complete(s.json.approvalId)).toEqual({ status: 202, json: { status: 'pending' } });
    last().next = { status: 'confirmed', result: proofFor(last()) };
    const { status, json } = await complete(s.json.approvalId);
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: 'approved', kind: 'link', humanHash: HUMAN, deadline: Math.floor(T0 / 1000) + 300 });
    const signer = await recover('HumanLink', { account: WALLET, humanHash: HUMAN, nonce: 7n, deadline: BigInt(json.deadline as number) }, json.signature as Hex);
    expect(signer).toBe(APPROVER);
    expect(sessions.byWallet(WALLET)).toMatchObject({ sessionId: SESSION, nullifier: NULLIFIER });
    const [url, init] = portal.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${VERIFY_URL}/${RP_ID}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ protocol_version: '4.0', action: WORLD_ACTION, session_id: SESSION, environment: 'staging' });
  });

  it('link again with a saved session proves that session; already bound → alreadyLinked, no signature', async () => {
    const { approve, enroll, last } = setup({ humanOf: HUMAN });
    enroll();
    const { status, json } = await approve({ kind: 'link' });
    expect(last().sessionId).toBe(SESSION);
    expect(status).toBe(200);
    expect(json).toEqual({ status: 'approved', kind: 'link', humanHash: HUMAN, alreadyLinked: true });
  });

  it('link: the wallet is bound to another human → 403 HUMAN_MISMATCH and nothing is saved', async () => {
    const { approve, sessions } = setup({ humanOf: OTHER_HUMAN });
    expect(await approve({ kind: 'link' })).toMatchObject({ status: 403, json: { error: 'HUMAN_MISMATCH' } });
    expect(sessions.byWallet(WALLET)).toBeUndefined();
  });

  it('link: one link per human; the same enrollment nullifier for another wallet → 403 HUMAN_MISMATCH', async () => {
    const { approve, enroll } = setup();
    enroll(OTHER);
    const { status, json } = await approve({ kind: 'link' }, (p) => ({ status: 'confirmed', result: proofFor(p, { sessionId: OTHER_SESSION }) }));
    expect(status).toBe(403);
    expect(json).toMatchObject({ error: 'HUMAN_MISMATCH', message: 'This World ID is already linked to another wallet.' });
  });

  it('pay: PayApproval for the exact fields, deadline capped by the intent expiry', async () => {
    const { approve, enroll } = setup({ humanOf: HUMAN });
    enroll();
    const expiresAt = T0 + 60_000;
    const pay = payFields({ expiresAt });
    const { status, json } = await approve({ kind: 'pay', pay });
    expect(status).toBe(200);
    expect(json).toMatchObject({ status: 'approved', kind: 'pay', humanHash: HUMAN, deadline: Math.floor(expiresAt / 1000) });
    const message = { payer: WALLET, to: RECIPIENT, amount: BigInt(pay.amountWei), intentHash: pay.intentHash, nonce: 7n, deadline: BigInt(json.deadline as number) };
    expect(await recover('PayApproval', message, json.signature as Hex)).toBe(APPROVER);
  });

  it('cap: CapApproval that recovers to the approver', async () => {
    const { approve, enroll } = setup({ humanOf: HUMAN });
    enroll();
    const cap = parseEther('50');
    const { json } = await approve({ kind: 'cap', cap: { capWei: cap.toString() } });
    expect(json).toMatchObject({ status: 'approved', kind: 'cap', humanHash: HUMAN });
    expect(await recover('CapApproval', { account: WALLET, cap, nonce: 7n, deadline: BigInt(json.deadline as number) }, json.signature as Hex)).toBe(APPROVER);
  });

  it('pay/cap: the saved session no longer matches the onchain human → 403 HUMAN_MISMATCH, no signature', async () => {
    const { approve, enroll } = setup({ humanOf: OTHER_HUMAN });
    enroll();
    const { status, json } = await approve({ kind: 'cap', cap: { capWei: '1' } });
    expect(status).toBe(403);
    expect(json).toMatchObject({ error: 'HUMAN_MISMATCH' });
    expect(json.signature).toBeUndefined();
  });

  it('handle: a completed approval can be taken once, only for its wallet', async () => {
    const { approve, enroll, approvals } = setup({ humanOf: HUMAN });
    enroll();
    const { json, approvalId } = await approve({ kind: 'handle' });
    expect(json).toEqual({ status: 'approved', kind: 'handle', humanHash: HUMAN });
    expect(approvals.takeHandleApproval(approvalId, OTHER)).toBeNull();
    expect(approvals.takeHandleApproval(approvalId, WALLET)).toEqual({ humanHash: HUMAN });
    expect(approvals.takeHandleApproval(approvalId, WALLET)).toBeNull();
  });

  it('cancelled in World App → 400 APPROVAL_CANCELLED, then 409', async () => {
    const { approve, complete } = setup();
    const { status, json, approvalId } = await approve({ kind: 'link' }, () => ({ status: 'cancelled' }));
    expect(status).toBe(400);
    expect(json).toMatchObject({ error: 'APPROVAL_CANCELLED', message: 'Approval cancelled. Nothing was sent.' });
    expect((await complete(approvalId)).status).toBe(409);
  });

  it('World App error → 401 PROOF_INVALID naming the code', async () => {
    const { approve } = setup();
    const { status, json } = await approve({ kind: 'link' }, () => ({ status: 'failed', error: 'credential_unavailable' }));
    expect(status).toBe(401);
    expect(json).toMatchObject({ error: 'PROOF_INVALID', message: expect.stringContaining('credential_unavailable') });
  });

  it('expired after 5 minutes → 410 APPROVAL_EXPIRED, then 409; unknown → 404', async () => {
    const { start, complete, advance } = setup();
    const s = await start({ kind: 'link' });
    advance(5 * 60_000);
    expect((await complete(s.json.approvalId)).json).toMatchObject({ error: 'APPROVAL_EXPIRED' });
    expect((await complete(s.json.approvalId)).status).toBe(409);
    expect((await complete('nope')).json).toMatchObject({ error: 'APPROVAL_NOT_FOUND' });
  });

  it('single use: polling again after approval → 409 APPROVAL_USED', async () => {
    const { approve, complete } = setup();
    const { status, approvalId } = await approve({ kind: 'link' });
    expect(status).toBe(200);
    expect(await complete(approvalId)).toMatchObject({ status: 409, json: { error: 'APPROVAL_USED' } });
  });

  it.each([
    ['a proof for another signal (approval, wallet or payment)', { signal: 'beam:other-approval:link:0x0:' }],
    ['a proof from another environment', { environment: 'production' }],
  ])('%s → 401 PROOF_INVALID before the portal is called', async (_, over) => {
    const { approve, portal } = setup();
    const { status, json } = await approve({ kind: 'link' }, (p) => ({ status: 'confirmed', result: proofFor(p, over) }));
    expect(status).toBe(401);
    expect(json.error).toBe('PROOF_INVALID');
    expect(portal).not.toHaveBeenCalled();
  });

  it('a session proof for another session → 401 PROOF_INVALID', async () => {
    const { approve, enroll } = setup({ humanOf: HUMAN });
    enroll();
    const { json } = await approve({ kind: 'handle' }, (p) => ({ status: 'confirmed', result: proofFor(p, { sessionId: OTHER_SESSION }) }));
    expect(json.error).toBe('PROOF_INVALID');
  });

  it('a World ID 3.0 or wrong-action proof is refused', async () => {
    const { approve } = setup();
    const v3 = await approve({ kind: 'link' }, (p) => ({ status: 'confirmed', result: { ...proofFor(p), protocol_version: '3.0' } as IDKitResult }));
    expect(v3.json.error).toBe('PROOF_INVALID');
    const action = await approve({ kind: 'link' }, (p) => ({ status: 'confirmed', result: { ...proofFor(p), action: 'other' } as IDKitResult }));
    expect(action.json.error).toBe('PROOF_INVALID');
  });

  it.each([
    ['rejects the proof', () => Response.json({ success: false, code: 'invalid_proof', detail: 'x' }, { status: 400 }), 401, 'PROOF_INVALID'],
    ['answers for another environment', () => Response.json({ success: true, environment: 'production' }), 401, 'PROOF_INVALID'],
    ['returns garbage', () => new Response('<html>', { status: 200 }), 401, 'PROOF_INVALID'],
    ['is down (HTTP 500)', () => new Response('', { status: 500 }), 503, 'WORLD_UNAVAILABLE'],
    ['is unreachable', () => Promise.reject(new TypeError('fetch failed')), 503, 'WORLD_UNAVAILABLE'],
  ])('portal %s → %i %s, nothing signed, approval consumed', async (_, respond, status, error) => {
    const { approve, portal, complete } = setup();
    portal.mockImplementationOnce(respond as never);
    const res = await approve({ kind: 'link' });
    expect(res.status).toBe(status);
    expect(res.json).toMatchObject({ error });
    expect(res.json.signature).toBeUndefined();
    expect((await complete(res.approvalId)).status).toBe(409);
  });

  it('bridge unreachable on poll → 503 and the approval stays pending', async () => {
    const { start, complete, last } = setup();
    const s = await start({ kind: 'link' });
    last().next = worldUnavailable('bridge unreachable');
    expect((await complete(s.json.approvalId)).json).toMatchObject({ error: 'WORLD_UNAVAILABLE' });
    last().next = { status: 'confirmed', result: proofFor(last()) };
    expect((await complete(s.json.approvalId)).status).toBe(200);
  });
});

describe('approvals: polling and logs', () => {
  it('polls get their own per-approval limit (2/s): polling never starves /v1/agent', async () => {
    const { start, complete, app, auth, advance } = setup();
    const s = await start({ kind: 'link' });
    // 40 polls over 20 s at the app's cadence: all answered, none throttled.
    for (let i = 0; i < 40; i++) {
      expect((await complete(s.json.approvalId)).status).toBe(202);
      advance(500);
    }
    // A burst on one approval is throttled...
    expect((await complete(s.json.approvalId)).status).toBe(202);
    expect((await complete(s.json.approvalId)).status).toBe(202);
    expect((await complete(s.json.approvalId)).status).toBe(429);
    // ...while the agent endpoint still has its full window.
    const agent = await app.request('/v1/agent', { method: 'POST', headers: auth, body: '{}' });
    expect(agent.status).toBe(400);
    advance(1_000);
    expect((await complete(s.json.approvalId)).status).toBe(202);
  });

  it('logs only ids, kinds, masked wallets and outcomes: no signal, session, nullifier or full wallet', async () => {
    const { approve, logs } = setup();
    await approve({ kind: 'link' });
    const text = logs.join('\n');
    expect(text).toContain('"outcome":"approved"');
    for (const secret of [WALLET, WALLET.toLowerCase(), SESSION, NULLIFIER, 'beam:']) expect(text).not.toContain(secret);
  });
});
