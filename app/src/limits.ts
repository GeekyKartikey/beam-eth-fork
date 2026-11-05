/**
 * @file Daily spending limit, stored on the device, plus the onchain
 * per-payment cap rules the app checks before sending a cap change.
 *
 * The per-payment cap lives in BeamPay (`capFor`); only the daily limit is
 * local. The limit is a decimal string in `NETWORK.symbol` (`limits:v2`);
 * today's spend is a wei string under `spend:YYYY-MM-DD` (local date).
 */
import { formatUnits, parseUnits } from 'viem';
import { NETWORK } from './config';
import { parseAmount } from './intent';
import type { NetworkKey } from './network';
import { isRecord, isWeiString, KEYS, readJson, writeJson } from './storage';

/** Default and hard-maximum daily limits per network, in the network's token. */
const DAILY: Record<NetworkKey, { default: string; max: string }> = {
  arc: { default: '100', max: '1000' },
};
const { default: DEFAULT_DAILY, max: MAX_DAILY } = DAILY[NETWORK.key];

/** BeamPay's `MAX_CAP` (1,000 USDC on Arc); `raiseCap` reverts `InvalidCap` above it. */
const MAX_CAP_WEI = parseUnits('1000', 18);

/** Daily limit plus today's spend, ready for validation. */
export type LimitState = {
  /** Canonical decimal string, e.g. "100". */
  daily: string;
  dailyWei: bigint;
  spentWei: bigint;
  /** `max(0, daily - spent)`. */
  remainingWei: bigint;
};

/**
 * Validates an amount the user typed for a limit or cap.
 * @param value Raw input, e.g. "25" or "0.5".
 * @param maxWei Largest allowed value.
 * @returns A short error message, or null when valid.
 */
function amountError(value: string, maxWei: bigint): string | null {
  const wei = parseAmount(value, NETWORK);
  if (wei === null) return 'Enter a number like 25 or 0.5.';
  if (wei <= 0n) return 'Must be more than 0.';
  if (wei > maxWei) return `Max ${formatUnits(maxWei, 18)} ${NETWORK.symbol}.`;
  return null;
}

/**
 * Validates a daily limit typed by the user.
 * @param value Raw input.
 * @returns A short error message, or null when valid.
 */
export const dailyLimitError = (value: string): string | null => amountError(value, parseUnits(MAX_DAILY, 18));

/**
 * Validates a per-payment cap typed by the user.
 * @param value Raw input.
 * @returns A short error message, or null when valid.
 */
export const capError = (value: string): string | null => amountError(value, MAX_CAP_WEI);

/**
 * Loads the daily limit, replacing a missing or invalid value with the default.
 * @returns Canonical decimal string.
 */
async function loadDaily(): Promise<string> {
  const stored = await readJson(KEYS.limits, isRecord);
  const v = stored?.daily;
  return typeof v === 'string' && dailyLimitError(v) === null ? formatUnits(parseUnits(v.trim(), 18), 18) : DEFAULT_DAILY;
}

/**
 * Saves the daily limit (validate with `dailyLimitError` first; invalid values are never stored).
 * @param value Limit as typed.
 * @returns Resolves once stored.
 */
export async function saveDailyLimit(value: string): Promise<void> {
  if (dailyLimitError(value) !== null) return;
  await writeJson(KEYS.limits, { daily: formatUnits(parseUnits(value.trim(), 18), 18) });
}

/**
 * Storage key for a day's spend, by local date.
 * @param date Day to key (default now).
 * @returns e.g. "spend:2026-11-04".
 */
function spendKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `spend:${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Total confirmed spend today.
 * @returns Wei.
 */
async function getSpentToday(): Promise<bigint> {
  return BigInt((await readJson(spendKey(), isWeiString)) ?? '0');
}

/**
 * Adds a confirmed payment to today's spend.
 * @param wei Amount sent (fees excluded, matching how limits are checked).
 * @returns Resolves once stored.
 */
export async function addSpend(wei: bigint): Promise<void> {
  // ponytail: one key per day, never pruned (a few bytes/day); add cleanup if this ships beyond a demo.
  await writeJson(spendKey(), ((await getSpentToday()) + wei).toString());
}

/**
 * Daily limit and today's spend in one read.
 * @returns Current limit state.
 */
export async function getLimitState(): Promise<LimitState> {
  const [daily, spentWei] = await Promise.all([loadDaily(), getSpentToday()]);
  const dailyWei = parseUnits(daily, 18);
  return { daily, dailyWei, spentWei, remainingWei: spentWei >= dailyWei ? 0n : dailyWei - spentWei };
}
