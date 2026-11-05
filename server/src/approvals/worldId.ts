/**
 * @file World ID 4.0 through IDKit, entirely server-side: sign the RP request,
 * open an IDKit bridge request, poll it once per call, check the proof against
 * what this approval expects, then verify it with the World developer portal.
 *
 * Verified against `@worldcoin/idkit-core` 4.6 typings and the docs at
 * https://docs.world.org/world-id/idkit/integrate, /session-proofs, /credentials
 * and https://docs.world.org/api-reference/developer-portal/verify:
 * - Credential: `proof_of_human` (Beam), requested with `.constraints()` and
 *   `allow_legacy_proofs: false`. The `proofOfHuman` preset would force a v3
 *   fallback whose nullifiers cannot carry a session.
 * - Identity: World ID 4.0 nullifiers are one-time per action, so they cannot
 *   identify a returning human. Linking is a uniqueness proof that also creates a
 *   session (`session_id: 'create'`); every later approval proves that session
 *   (`IDKit.proveSession`). The `session_id` is the stable identifier.
 * - The signal is hashed into the proof; IDKit fills `signal_hash` from the
 *   request and the portal verifies the proof against it.
 */
import { CredentialRequest, IDKit, type IDKitRequest, type IDKitResult } from '@worldcoin/idkit-core';
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { signRequest } from '@worldcoin/idkit-core/signing';
import type { Address } from 'viem';
import { z } from 'zod';
import { APP_RETURN_TO, type WorldIdConfig } from '../config';
import { proofInvalid, worldUnavailable } from './errors';
import type { ApprovalFields } from './store';

/** The action registered in the developer portal (production and staging). */
export const WORLD_ACTION = 'beam-approve';
/** Portal verify endpoint; the body's `environment` selects production or staging. */
export const VERIFY_URL = 'https://developer.world.org/api/v4/verify';
const HTTP_TIMEOUT_MS = 8_000;
/** World App error codes that mean the human said no. */
const CANCEL_CODES = new Set(['user_rejected', 'verification_rejected', 'cancelled']);

/** One poll of a proof request. */
export type ProofStatus = { status: 'pending' } | { status: 'cancelled' } | { status: 'failed'; error: string } | { status: 'confirmed'; result: IDKitResult };

/** A live proof request: the URL the human opens and a non-blocking status check. */
export type ProofRequest = {
  connectUrl: string;
  /** Checks the bridge once. Throws WORLD_UNAVAILABLE when the bridge is unreachable. */
  poll: () => Promise<ProofStatus>;
};

/** What a proof request asks for. */
export type ProofParams = {
  signal: string;
  /** Prove this session, or null to enroll: a uniqueness proof that creates a session. */
  sessionId: `session_${string}` | null;
  /** Shown to the human in World App (session proofs only). */
  description: string;
};

/** The World ID side of approvals; injected so tests never touch the network. */
export type WorldId = {
  environment: WorldIdConfig['environment'];
  request: (p: ProofParams) => Promise<ProofRequest>;
  /** Verifies a checked proof with the developer portal. Throws PROOF_INVALID or WORLD_UNAVAILABLE. */
  verify: (result: IDKitResult) => Promise<void>;
};

/**
 * Creates the live World ID client.
 * @param config App, RP, signing key and environment.
 * @param doFetch Fetch for the portal verify call; injectable for tests.
 * @returns A `WorldId`.
 */
export function createWorldId(config: WorldIdConfig, doFetch: typeof fetch = fetch): WorldId {
  return {
    environment: config.environment,
    request: async ({ signal, sessionId, description }) => {
      // IDKit's default RP signature TTL (300 s) matches the approval TTL.
      const sig = signRequest({ signingKeyHex: config.signingKey, ...(sessionId === null ? { action: WORLD_ACTION } : {}) });
      const common = {
        app_id: config.appId,
        rp_context: { rp_id: config.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig },
        environment: config.environment,
        return_to: APP_RETURN_TO,
      };
      const builder =
        sessionId === null
          ? IDKit.request({ ...common, action: WORLD_ACTION, session_id: 'create', allow_legacy_proofs: false })
          : IDKit.proveSession(sessionId, { ...common, action_description: description });
      let request: IDKitRequest;
      try {
        request = await builder.constraints(CredentialRequest('proof_of_human', { signal }), { timeout: HTTP_TIMEOUT_MS });
      } catch {
        throw worldUnavailable('could not open the request');
      }
      if (!request.connectorURI.startsWith('https://')) throw worldUnavailable('unexpected connect URL');
      return { connectUrl: request.connectorURI, poll: () => pollOnce(request) };
    },
    verify: (result) => verifyProof(result, config, doFetch),
  };
}

/**
 * Checks an IDKit request once, without waiting.
 * @param request The live request.
 * @returns Its status.
 */
async function pollOnce(request: IDKitRequest): Promise<ProofStatus> {
  let s: Awaited<ReturnType<IDKitRequest['pollOnce']>>;
  try {
    s = await request.pollOnce({ timeout: HTTP_TIMEOUT_MS });
  } catch {
    throw worldUnavailable('bridge unreachable');
  }
  if (s.type === 'confirmed' && s.result) return { status: 'confirmed', result: s.result };
  if (s.type === 'failed') return CANCEL_CODES.has(s.error ?? '') ? { status: 'cancelled' } : { status: 'failed', error: s.error ?? 'generic_error' };
  return { status: 'pending' };
}

/**
 * The signal for an approval: its id, kind, wallet and the one value it signs.
 * A proof is valid only for this exact string, so it can never approve another
 * approval, wallet, payment or cap.
 * @param id Approval id.
 * @param wallet Wallet being approved for.
 * @param fields What will be signed.
 * @returns `beam:<id>:<kind>:<wallet>:<intentHash|capWei|"">`.
 */
export function approvalSignal(id: string, wallet: Address, fields: ApprovalFields): string {
  const value = fields.kind === 'pay' ? fields.intentHash : fields.kind === 'cap' ? fields.capWei.toString() : '';
  return `beam:${id}:${fields.kind}:${wallet}:${value}`;
}

/** What `checkProof` expects of a result. */
export type ProofExpectations = { environment: WorldId['environment']; signal: string; sessionId: `session_${string}` | null };

/** The identity a checked proof carries. `nullifier` is set only for enrollment (uniqueness) proofs. */
export type ProvenHuman = { sessionId: `session_${string}`; nullifier: string | null };

/**
 * Checks a proof against its approval before it is sent for verification:
 * environment, World ID 4.0, Proof of Human, action and session, and the signal
 * hash of every response. Never trusts anything it was not asked for.
 * @param result IDKit result from the bridge.
 * @param expect Environment, signal and session this approval requires.
 * @returns The session and (for enrollment) the decimal nullifier.
 * @throws ApprovalError 401 PROOF_INVALID on any mismatch.
 */
export function checkProof(result: IDKitResult, expect: ProofExpectations): ProvenHuman {
  if (result.environment !== expect.environment) throw proofInvalid('the proof is from another World ID environment');
  if (result.protocol_version !== '4.0') throw proofInvalid('not a World ID 4.0 proof');
  // Lowercased so the same session always hashes to the same human.
  const sessionId = 'session_id' in result ? (result.session_id?.toLowerCase() as `session_${string}` | undefined) : undefined;
  if (!sessionId || !/^session_[0-9a-f]{128}$/.test(sessionId)) throw proofInvalid('no World ID session');
  const signalHash = BigInt(hashSignal(expect.signal));
  const responses = result.responses as Array<{ identifier: string; signal_hash?: string; nullifier?: string }>;
  const bound = (r: (typeof responses)[number]) => r.identifier === 'proof_of_human' && r.signal_hash !== undefined && BigInt(r.signal_hash) === signalHash;
  if (responses.length === 0 || !responses.every(bound)) throw proofInvalid("the proof doesn't belong to this approval");

  if (expect.sessionId !== null) {
    if (sessionId !== expect.sessionId) throw proofInvalid('a different World ID session');
    return { sessionId, nullifier: null };
  }
  const nullifier = responses[0]?.nullifier;
  if (!('action' in result) || result.action !== WORLD_ACTION || !nullifier) throw proofInvalid('not an Beam enrollment proof');
  return { sessionId, nullifier: BigInt(nullifier).toString() };
}

const VerifyOk = z.object({ success: z.literal(true), environment: z.string() });
const VerifyError = z.object({ code: z.string().regex(/^[a-z_]{1,64}$/) });

/**
 * Verifies a proof with the developer portal, forwarding the IDKit result as-is
 * with the expected environment. No retries.
 * @param result IDKit result (already checked).
 * @param config RP id and environment.
 * @param doFetch Fetch implementation.
 * @throws ApprovalError 503 WORLD_UNAVAILABLE when the portal is unreachable or failing; 401 PROOF_INVALID when it rejects the proof.
 */
export async function verifyProof(result: IDKitResult, config: Pick<WorldIdConfig, 'rpId' | 'environment'>, doFetch: typeof fetch): Promise<void> {
  let res: Response;
  try {
    res = await doFetch(`${VERIFY_URL}/${config.rpId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...result, environment: config.environment }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw worldUnavailable('verifier unreachable');
  }
  if (res.status >= 500 || res.status === 429) throw worldUnavailable(`verifier HTTP ${res.status}`);
  const body: unknown = await res.json().catch(() => null);
  const ok = VerifyOk.safeParse(body);
  if (res.ok && ok.success && ok.data.environment === config.environment) return;
  const code = VerifyError.safeParse(body);
  throw proofInvalid(`World rejected the proof (${code.success ? code.data.code : `HTTP ${res.status}`})`);
}
