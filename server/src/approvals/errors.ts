/**
 * @file The one error type the approvals module throws. Routes turn it into
 * `{ error, message }` with its HTTP status; anything else becomes a 500.
 */
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode } from '../api';

/** A typed, user-presentable approval failure. `message` is UX copy and never contains secrets. */
export class ApprovalError extends Error {
  /**
   * @param status HTTP status to answer with.
   * @param code Machine-readable code from `api.ts`.
   * @param message One plain sentence.
   */
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

/**
 * World (bridge or developer portal) could not be reached; the caller may retry.
 * @param what Short, non-secret reason for the message and logs.
 * @returns A 503 WORLD_UNAVAILABLE error.
 */
export const worldUnavailable = (what: string): ApprovalError =>
  new ApprovalError(503, 'WORLD_UNAVAILABLE', `World ID is unavailable (${what}). Try again.`);

/**
 * The World ID proof failed a check; nothing is signed.
 * @param why Short, non-secret reason.
 * @returns A 401 PROOF_INVALID error.
 */
export const proofInvalid = (why: string): ApprovalError => new ApprovalError(401, 'PROOF_INVALID', `World ID approval failed: ${why}.`);
