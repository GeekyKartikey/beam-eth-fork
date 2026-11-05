/**
 * @file Beam server client for everything except the agent: the `/health`
 * handshake (network, BeamPay and feature flags) and a typed JSON request
 * helper used by approvals and handles.
 *
 * Server responses are untrusted: each one passes a shape guard before use,
 * and error copy shown to the user is chosen on the device from the code.
 */
import { isAddressEqual, type Address } from 'viem';
import type { ApiErrorCode } from './api';
import { config, NETWORK } from './config';
import { isRecord } from './storage';

const REQUEST_TIMEOUT_MS = 20_000;

/** Failure of a server call. `OFFLINE` covers network errors, timeouts and missing config. */
export class ApiError extends Error {
  /**
   * @param code Server error code, or `OFFLINE`.
   * @param message Developer detail (never shown verbatim, never contains user data).
   */
  constructor(
    readonly code: ApiErrorCode | 'OFFLINE',
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Options for `apiRequest`. */
export type RequestOptions = {
  /** JSON body for POST. */
  body?: unknown;
  /** Abort after this long (default 20 s). */
  timeoutMs?: number;
  /** Aborts the request early, e.g. when the screen that asked for it closes. */
  signal?: AbortSignal;
};

/**
 * Calls an authenticated server endpoint and validates the JSON response.
 * @param method HTTP method.
 * @param path Path starting with "/".
 * @param guard Shape check the response body must pass.
 * @param options Body, timeout and abort signal.
 * @returns The validated body (any 2xx status).
 * @throws ApiError with the server's code, `OFFLINE` (also when aborted), or `INTERNAL` for a bad shape.
 */
export async function apiRequest<T>(
  method: 'GET' | 'POST',
  path: string,
  guard: (v: unknown) => v is T,
  { body, timeoutMs = REQUEST_TIMEOUT_MS, signal }: RequestOptions = {},
): Promise<T> {
  if (!config.agentUrl) throw new ApiError('OFFLINE', 'EXPO_PUBLIC_AGENT_URL is not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort);
  try {
    let res: Response;
    try {
      res = await fetch(`${config.agentUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.agentToken}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('OFFLINE', 'Network error, timeout or abort');
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // A body without a code (proxy or tunnel error page) means the server itself wasn't reached.
      const code = isRecord(json) && typeof json.error === 'string' ? (json.error as ApiErrorCode) : res.status >= 500 ? 'OFFLINE' : 'INTERNAL';
      throw new ApiError(code, `HTTP ${res.status}`);
    }
    if (!guard(json)) throw new ApiError('INTERNAL', 'Unexpected response shape');
    return json;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Which World ID environment the server verifies against: World App (production), the simulator (staging), or not configured. */
export type WorldMode = 'production' | 'staging' | 'off';

/** What the app learned from `/health`. */
export type ServerStatus =
  | { kind: 'loading' }
  /** No answer; the agent falls back to the offline parser and approvals fail as offline. */
  | { kind: 'unreachable' }
  /** `mismatch`: the server pays on another chain, BeamPay or ENS chain; the agent is disabled. */
  | { kind: 'ok' | 'mismatch'; world: WorldMode; handles: boolean };

/**
 * World ID mode from a server status.
 * @param s Server status.
 * @returns The mode, or null while loading or unreachable.
 */
export const worldOf = (s: ServerStatus): WorldMode | null => (s.kind === 'ok' || s.kind === 'mismatch' ? s.world : null);

type Health = { chainId: number; beamPay: string | null; world: WorldMode; handles: boolean; ensChainId: number | null };

const isHealth = (v: unknown): v is Health =>
  isRecord(v) &&
  typeof v.chainId === 'number' &&
  (v.beamPay === null || typeof v.beamPay === 'string') &&
  (v.world === 'production' || v.world === 'staging' || v.world === 'off') &&
  typeof v.handles === 'boolean' &&
  (v.ensChainId === null || v.ensChainId === undefined || typeof v.ensChainId === 'number');

/**
 * Whether two optional addresses name the same contract (both unset counts as equal).
 * @param a First address or null.
 * @param b Second address or null.
 * @returns True when equal.
 */
function sameContract(a: string | null, b: Address | null): boolean {
  if (!a || !b) return !a && !b;
  try {
    return isAddressEqual(a as Address, b);
  } catch {
    return false;
  }
}

/**
 * Compares the server's health with this build.
 * @param h Validated health body.
 * @returns `ok` or `mismatch`, with the feature flags.
 */
function compareHealth(h: Health): ServerStatus {
  const sameEns = typeof h.ensChainId !== 'number' || h.ensChainId === config.ensChain.id;
  const same = h.chainId === NETWORK.chainId && sameContract(h.beamPay, config.beamPay) && sameEns;
  return { kind: same ? 'ok' : 'mismatch', world: h.world, handles: h.handles };
}

let cached: Promise<ServerStatus> | null = null;

/**
 * Reads `/health` once per app process (an unreachable result is retried on the next call).
 * @returns The server status.
 */
export function loadServerStatus(): Promise<ServerStatus> {
  if (cached) return cached;
  const attempt = (async (): Promise<ServerStatus> => {
    if (!config.agentUrl) return { kind: 'unreachable' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${config.agentUrl}/health`, { signal: controller.signal });
      const body: unknown = await res.json();
      return res.ok && isHealth(body) ? compareHealth(body) : { kind: 'unreachable' };
    } catch {
      return { kind: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  })();
  cached = attempt;
  void attempt.then((s) => {
    if (s.kind === 'unreachable' && cached === attempt) cached = null;
  });
  return attempt;
}
