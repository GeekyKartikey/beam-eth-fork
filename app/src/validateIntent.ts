/**
 * @file Local intent checks run before Confirm is enabled and again right
 * before signing, plus the device-only approval reasons (`NEW_RECIPIENT`,
 * `NAME_CHANGED`).
 *
 * Pure: the caller fetches balance, limits, the BeamPay account, the name
 * re-resolution and the executed flag. The wallet's live chain check needs
 * the provider, so it lives in `execute.ts`.
 */
import { zeroAddress, type Address } from 'viem';
import { NETWORK } from './config';
import { formatAmount, parseAmount, toChecksumAddress, withApprovalReasons, type ApprovalReason, type Intent, type IntentWarning } from './intent';
import type { NameCheck } from './names';
import type { WorldMode } from './serverApi';

/** Fresh device state the checks run against. */
type CheckInput = {
  balanceWei: bigint;
  /** Daily limit minus today's confirmed spend. */
  remainingWei: bigint;
  /** BeamPay `capFor(wallet)` now. */
  capWei: bigint;
  /** A World ID human is bound to the wallet onchain. */
  linked: boolean;
  /** World ID on the server; null when the server is unreachable. */
  world: WorldMode | null;
  /** Re-resolution of `intent.toName`; null when paid by address. */
  name: NameCheck | null;
  /** Deadline (unix seconds) of the approval held for this intent, if any. */
  approvalDeadline: number | null;
  /** The intent ID is in the executed set. */
  executed: boolean;
  /** Another payment is still pending (single pending slot). */
  otherPending: boolean;
  now: number;
};

/**
 * Outcome of the checks. `reason` is user-facing copy; `fix` tells the card
 * which action to offer: retry a transient failure, link World ID in
 * Profile, or approve again after the approval lapsed.
 */
export type IntentCheck = { ok: true } | { ok: false; reason: string; fix?: 'retry' | 'linkWorld' | 'reapprove' };

/** Wei amounts derived from an intent. */
type IntentCost = { amount: bigint; fee: bigint; total: bigint };

/** Copy for a blocked approval-required payment while World ID is off on the server. */
export const WORLD_OFF = "World ID isn't set up on this server.";

/**
 * Parses an intent's wei fields.
 * @param intent The intent.
 * @returns Amount, max fee and total, or null if any field is malformed.
 */
export function intentCost(intent: Intent): IntentCost | null {
  try {
    const amount = BigInt(intent.amountWei);
    const fee = BigInt(intent.gasLimit) * BigInt(intent.maxFeePerGasWei);
    return { amount, fee, total: amount + fee };
  } catch {
    return null;
  }
}

const fail = (reason: string, fix?: 'retry' | 'linkWorld' | 'reapprove'): IntentCheck => ({ ok: false, reason, ...(fix ? { fix } : {}) });

/**
 * Runs the local checks in order: network, address, amount, daily limit,
 * balance, expiry, replay, pending slot, name, cap, then World ID approval.
 * @param intent Intent to check.
 * @param input Fresh device and chain state.
 * @returns ok, or the first failing reason.
 */
export function validateIntent(intent: Intent, input: CheckInput): IntentCheck {
  if (intent.chainId !== NETWORK.chainId || intent.network !== NETWORK.key) {
    return fail(`Wrong network. Beam only sends on ${NETWORK.name}.`);
  }

  const to = toChecksumAddress(intent.to);
  if (!to || to !== intent.to) return fail('That is not a valid 0x address.');
  if (to === zeroAddress) return fail('That is the zero address. Funds sent there are lost.');

  const cost = intentCost(intent);
  if (!cost || cost.amount <= 0n || cost.fee <= 0n) return fail('This payment is malformed. Ask again.');
  if (cost.amount > input.remainingWei) {
    return fail(`That would exceed today's limit (${formatAmount(input.remainingWei, NETWORK)} left).`);
  }
  if (input.balanceWei < cost.total) {
    return fail(
      `Not enough ${NETWORK.symbol} (balance ${formatAmount(input.balanceWei, NETWORK)}, needed ${formatAmount(cost.total, NETWORK, 6)} incl. fee).`,
    );
  }
  if (input.now >= intent.expiresAt) return fail('Expired, ask again.');
  if (input.executed) return fail('Already sent. Ask again to make a new payment.');
  if (input.otherPending) return fail('Your last payment is still pending. Try again once it settles.');

  if (input.name === 'mismatch') return fail('Name resolution mismatch. Try again.');
  if (input.name === 'unavailable') return fail("Couldn't look up that name. Use the 0x address.", 'retry');

  if (intent.route === 'pay') {
    return cost.amount > input.capWei ? fail('Your per-payment cap changed. Ask again.') : { ok: true };
  }
  if (input.world === 'off') return fail(WORLD_OFF);
  if (!input.linked) return fail('Link World ID in Profile to approve this.', 'linkWorld');
  if (input.approvalDeadline !== null && input.now >= input.approvalDeadline * 1000) {
    return fail('Approval expired. Try again.', 'reapprove');
  }
  return { ok: true };
}

/** What the device knows that the server can't. */
type DeviceKnowledge = {
  /** Lowercased addresses paid successfully before (`recipients:v1`). */
  knownRecipients: Set<string>;
  /** Name to address at the last confirmed payment (`names:v1`). */
  names: Record<string, Address>;
};

/**
 * Adds the device-only approval reasons and warnings:
 * - `NEW_RECIPIENT` as an approval reason at or above `NETWORK.newRecipientFloor`, as a warning below it;
 * - `NAME_CHANGED` plus the `NAME_ADDRESS_CHANGED` warning when a name now points elsewhere.
 * @param intent Locally prepared intent.
 * @param known Recipients and names from storage.
 * @returns The intent with merged reasons, warnings and route.
 */
export function withDeviceReasons(intent: Intent, known: DeviceKnowledge): Intent {
  const reasons: ApprovalReason[] = [];
  const warnings: IntentWarning[] = [...intent.warnings];
  if (!known.knownRecipients.has(intent.to.toLowerCase())) {
    const floor = parseAmount(NETWORK.newRecipientFloor, NETWORK) ?? 0n;
    if (BigInt(intent.amountWei) >= floor) reasons.push('NEW_RECIPIENT');
    else if (!warnings.includes('NEW_RECIPIENT')) warnings.unshift('NEW_RECIPIENT');
  }
  const previous = intent.toName ? known.names[intent.toName] : undefined;
  if (previous && previous !== intent.to) {
    reasons.push('NAME_CHANGED');
    if (!warnings.includes('NAME_ADDRESS_CHANGED')) warnings.push('NAME_ADDRESS_CHANGED');
  }
  return withApprovalReasons({ ...intent, warnings }, reasons);
}
