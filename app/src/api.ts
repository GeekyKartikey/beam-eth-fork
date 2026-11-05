/**
 * @file Wire types for the approval (World ID) and handle (ENS) endpoints,
 * plus the handle label rules both sides enforce.
 *
 * SHARED FILE: byte-identical copies live at `app/src/api.ts` and
 * `server/src/api.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 */
import type { Address, Hex } from 'viem';

/** What a World ID approval authorizes. */
export type ApprovalKind = 'link' | 'pay' | 'cap' | 'handle';

/** `POST /v1/approvals` body. Exactly the field matching `kind` is set for pay/cap. */
export type ApprovalRequest = {
  kind: ApprovalKind;
  wallet: Address;
  /** `expiresAt` is the intent's expiry (epoch ms); when sent, the signed deadline never exceeds it. */
  pay?: { intentId: string; to: Address; amountWei: string; intentHash: Hex; expiresAt?: number };
  cap?: { capWei: string };
};

/**
 * `POST /v1/approvals` response. Open `connectUrl` (World App on this phone,
 * or the World ID simulator in staging), then poll `POST /v1/approvals/:id/complete`.
 */
export type ApprovalStart = {
  approvalId: string;
  /** IDKit connector URL for this approval's proof request. */
  connectUrl: string;
  /** Epoch ms after which the approval can no longer be completed. */
  expiresAt: number;
};

/**
 * What an approval yields once its World ID proof is verified.
 * - link: `HumanLink` signature for `BeamPay.linkHuman(humanHash, deadline, signature)`;
 *   `alreadyLinked` when this human is already bound (no signature).
 * - pay / cap: `PayApproval` / `CapApproval` signature for the matching BeamPay call.
 * - handle: no signature; the approval id may now be used once to claim a handle.
 */
export type ApprovalResult = {
  kind: ApprovalKind;
  signature?: Hex;
  humanHash?: Hex;
  /** Unix seconds; pass to the contract unchanged. */
  deadline?: number;
  alreadyLinked?: boolean;
};

/**
 * `POST /v1/approvals/:id/complete` response (no body). `pending` (HTTP 202)
 * until the proof arrives; then `approved` (HTTP 200) exactly once, or an error.
 */
export type ApprovalPoll = { status: 'pending' } | ({ status: 'approved' } & ApprovalResult);

/** Error codes the approval and handle endpoints return as `{ error, message }`. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'WORLD_NOT_CONFIGURED'
  | 'WORLD_UNAVAILABLE'
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_USED'
  | 'APPROVAL_CANCELLED'
  | 'PROOF_INVALID'
  | 'NOT_LINKED'
  | 'HUMAN_MISMATCH'
  | 'INTENT_INVALID'
  | 'HANDLES_NOT_CONFIGURED'
  | 'HANDLE_INVALID'
  | 'HANDLE_TAKEN'
  | 'HANDLE_CHAIN_ERROR'
  | 'INTERNAL';

/** `GET /v1/handles/:label` response. */
export type HandleAvailability = { label: string; name: string; available: boolean; reason?: string };

/** `GET /v1/handles?wallet=0x…` response. */
export type HandleLookup = { name: string | null };

/** `POST /v1/handles` body: claim `<label>.<parent>` for `wallet` with a completed `handle` approval. */
export type HandleClaimRequest = { label: string; wallet: Address; approvalId: string };

/** `POST /v1/handles` response. `txHash` is absent when the human already had this handle. */
export type HandleClaim = { name: string; txHash?: Hex };

/** Labels nobody can claim. */
export const RESERVED_LABELS: readonly string[] = ['admin', 'beam', 'support', 'pay', 'wallet', 'team', 'help', 'root', 'www'];

/**
 * Checks a handle label: 3 to 20 chars of a to z, 0 to 9 and inner hyphens.
 * Kept ASCII on purpose so handles are easy to read aloud and immune to homoglyphs.
 * @param raw Label as typed.
 * @returns `{ label }` (lowercased, trimmed) or `{ error }` with user-facing copy.
 */
export function validateHandleLabel(raw: string): { label: string } | { error: string } {
  const label = raw.trim().toLowerCase();
  if (label.length < 3 || label.length > 20) return { error: 'Use 3 to 20 characters.' };
  if (!/^[a-z0-9-]+$/.test(label)) return { error: 'Use letters, numbers and hyphens only.' };
  if (label.startsWith('-') || label.endsWith('-')) return { error: "Handles can't start or end with a hyphen." };
  if (label.includes('--')) return { error: "Handles can't contain two hyphens in a row." };
  if (RESERVED_LABELS.includes(label)) return { error: 'That handle is reserved.' };
  return { label };
}

/**
 * What an external agent (MCP) hands the phone to review. The phone treats it
 * as untrusted: it re-runs `prepareTransfer` with `context` as the provenance
 * source and always requires World ID approval (`EXTERNAL_AGENT`).
 */
export type ReviewLinkPayload = {
  v: 1;
  intentId: string;
  /** 0x address or ENS name, as found in `context`. */
  to: string;
  /** Decimal amount in the network's token. */
  amount: string;
  /** The text the external agent based the payment on (max 2000 chars). */
  context: string;
};

/** Deep link prefix the app routes to the review sheet. */
export const REVIEW_LINK_PREFIX = 'bubbleagent://review?p=';
const REVIEW_CONTEXT_MAX = 2000;

/**
 * Encodes a review payload as a deep link (UTF-8 JSON, base64url).
 * @param payload Payload to send.
 * @returns `bubbleagent://review?p=<base64url>`.
 */
export function encodeReviewLink(payload: ReviewLinkPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const b64 = btoa(String.fromCharCode(...bytes));
  return REVIEW_LINK_PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes and validates a review payload from its `p` query value.
 * @param p The base64url `p` parameter.
 * @returns The payload, or null when malformed.
 */
export function decodeReviewLink(p: string): ReviewLinkPayload | null {
  try {
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const v: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    const ok =
      o.v === 1 &&
      typeof o.intentId === 'string' && o.intentId.length > 0 && o.intentId.length <= 100 &&
      typeof o.to === 'string' && o.to.length > 0 && o.to.length <= 255 &&
      typeof o.amount === 'string' && /^\d+(\.\d+)?$/.test(o.amount) &&
      typeof o.context === 'string' && o.context.length <= REVIEW_CONTEXT_MAX;
    return ok ? { v: 1, intentId: o.intentId as string, to: o.to as string, amount: o.amount as string, context: o.context as string } : null;
  } catch {
    return null;
  }
}
