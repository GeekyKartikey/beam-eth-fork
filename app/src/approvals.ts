/**
 * @file World ID approvals (IDKit): start one on the server, hand the user its
 * connect link (World App on this phone, or the World ID simulator in
 * staging), then poll the server until the proof arrives and it signs.
 *
 * The device never sees or judges the proof: World App sends it to the IDKit
 * bridge, the server fetches and verifies it, and only then signs. The device
 * only asks "is it done yet?".
 */
import type { ApprovalPoll, ApprovalRequest, ApprovalResult, ApprovalStart } from './api';
import { ApiError, apiRequest } from './serverApi';
import { isRecord } from './storage';
import { WORLD_OFF } from './validateIntent';

/** Where an approval ended. `approved` carries the server result and the approval id (handles need it). */
export type ApprovalOutcome =
  | { kind: 'approved'; approvalId: string; result: ApprovalResult }
  | { kind: 'cancelled' }
  | { kind: 'expired' }
  | { kind: 'mismatch' }
  | { kind: 'error'; message: string };

/** Time between polls while waiting for the proof. */
const POLL_MS = 1500;
/** Network failures in a row tolerated while polling; a phone back from World App may need a moment to reconnect. */
const MAX_MISSES = 3;

const isHex = (v: unknown): boolean => typeof v === 'string' && /^0x[0-9a-fA-F]*$/.test(v);

const isApprovalStart = (v: unknown): v is ApprovalStart =>
  isRecord(v) &&
  typeof v.approvalId === 'string' &&
  typeof v.connectUrl === 'string' &&
  /^https:\/\//.test(v.connectUrl) &&
  typeof v.expiresAt === 'number';

const isApprovalPoll = (v: unknown): v is ApprovalPoll =>
  isRecord(v) &&
  (v.status === 'pending' ||
    (v.status === 'approved' &&
      (v.kind === 'link' || v.kind === 'pay' || v.kind === 'cap' || v.kind === 'handle') &&
      (v.signature === undefined || isHex(v.signature)) &&
      (v.humanHash === undefined || isHex(v.humanHash)) &&
      (v.deadline === undefined || typeof v.deadline === 'number') &&
      (v.alreadyLinked === undefined || typeof v.alreadyLinked === 'boolean')));

/**
 * Whether a completed approval carries what its kind needs onchain.
 * @param kind The kind that was requested.
 * @param r Server result.
 * @returns True when usable: pay/cap need a signature and deadline; link also a human hash unless already linked.
 */
function isComplete(kind: ApprovalRequest['kind'], r: ApprovalResult): boolean {
  if (r.kind !== kind) return false;
  if (kind === 'handle' || (kind === 'link' && r.alreadyLinked)) return true;
  const signed = !!r.signature && typeof r.deadline === 'number';
  return kind === 'link' ? signed && !!r.humanHash : signed;
}

/** Copy for server error codes that end an approval. */
const ERROR_COPY: Partial<Record<ApiError['code'], string>> = {
  OFFLINE: "Couldn't reach the Beam server. Check your connection.",
  RATE_LIMITED: 'Too many tries. Wait a minute and try again.',
  WORLD_NOT_CONFIGURED: WORLD_OFF,
  WORLD_UNAVAILABLE: 'World ID is unavailable right now. Try again.',
  PROOF_INVALID: "World ID couldn't verify that proof. Try again.",
  APPROVAL_USED: 'This approval was already used. Try again.',
  NOT_LINKED: 'Link World ID in Profile to approve this.',
  INTENT_INVALID: "The server couldn't verify this payment. Ask again.",
  INTERNAL: 'The Beam server had a problem. Try again.',
};

const GENERIC = 'Something went wrong. Try again.';

/**
 * Maps a failed server call to an outcome.
 * @param e Anything thrown by `apiRequest`.
 * @returns The outcome.
 */
function failure(e: unknown): ApprovalOutcome {
  if (!(e instanceof ApiError)) return { kind: 'error', message: GENERIC };
  if (e.code === 'APPROVAL_CANCELLED') return { kind: 'cancelled' };
  if (e.code === 'APPROVAL_EXPIRED' || e.code === 'APPROVAL_NOT_FOUND') return { kind: 'expired' };
  if (e.code === 'HUMAN_MISMATCH') return { kind: 'mismatch' };
  return { kind: 'error', message: ERROR_COPY[e.code] ?? GENERIC };
}

/**
 * Whether a poll failure is worth another poll rather than ending the approval.
 * @param e Anything thrown by `apiRequest`.
 * @returns True for network blips and rate limiting.
 */
const isTransient = (e: unknown): boolean => e instanceof ApiError && (e.code === 'OFFLINE' || e.code === 'RATE_LIMITED');

/** Callbacks of a running approval. Neither fires after `stop()`. */
export type ApprovalHandlers = {
  /** The server created the approval; show `connectUrl` to the user. */
  onWaiting: (start: ApprovalStart) => void;
  /** Called once with how it ended. */
  onDone: (outcome: ApprovalOutcome) => void;
  /** Whether polling may run now (false while the app is in the background). */
  canPoll: () => boolean;
};

/** Handle on a running approval. */
export type ApprovalRun = {
  /** Polls now (e.g. back from World App); no-op while a poll is in flight or before the approval exists. */
  poll: () => void;
  /** Stops polling and aborts any request in flight. */
  stop: () => void;
};

/**
 * Starts one approval and polls it every 1.5 s until it is approved, fails or
 * expires. One request at a time; polls skipped by `canPoll` resume on the next `poll()`.
 * @param req What to approve.
 * @param handlers Progress callbacks and the foreground check.
 * @returns Controls to poll now or stop.
 */
export function runApproval(req: ApprovalRequest, { onWaiting, onDone, canPoll }: ApprovalHandlers): ApprovalRun {
  const controller = new AbortController();
  const { signal } = controller;
  let start: ApprovalStart | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;
  let misses = 0;

  const stop = () => {
    clearTimeout(timer);
    controller.abort();
  };
  const finish = (outcome: ApprovalOutcome) => {
    if (signal.aborted) return;
    stop();
    onDone(outcome);
  };
  const schedule = () => {
    if (!signal.aborted) timer = setTimeout(() => void poll(), POLL_MS);
  };

  const poll = async (): Promise<void> => {
    clearTimeout(timer);
    if (!start || inFlight || signal.aborted) return;
    if (Date.now() >= start.expiresAt) return finish({ kind: 'expired' });
    if (!canPoll()) return;
    const { approvalId } = start;
    inFlight = true;
    let res: ApprovalPoll;
    try {
      res = await apiRequest('POST', `/v1/approvals/${encodeURIComponent(approvalId)}/complete`, isApprovalPoll, { signal });
    } catch (e) {
      inFlight = false;
      if (isTransient(e) && ++misses <= MAX_MISSES) return schedule();
      return finish(failure(e));
    }
    inFlight = false;
    misses = 0;
    if (res.status === 'pending') return schedule();
    finish(isComplete(req.kind, res) ? { kind: 'approved', approvalId, result: res } : { kind: 'error', message: GENERIC });
  };

  void (async () => {
    try {
      start = await apiRequest('POST', '/v1/approvals', isApprovalStart, { body: req, signal });
    } catch (e) {
      return finish(failure(e));
    }
    if (signal.aborted) return;
    onWaiting(start);
    schedule();
  })();

  return { poll: () => void poll(), stop };
}
