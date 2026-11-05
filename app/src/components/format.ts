/**
 * @file Display formatters shared by the components: network-aware money and
 * relative time.
 *
 * On a dollar-pegged network (Arc USDC) amounts read as dollars ("$124.50"
 * with "USDC" beside it).
 */
import { formatUnits } from 'viem';
import { NETWORK } from '../config';
import { formatAmount } from '../intent';

/**
 * Decimal string truncated to `max` fractional digits and padded to `min`.
 * @param wei Amount in wei.
 * @param min Fractional digits always shown.
 * @param max Fractional digits kept at most.
 * @returns e.g. "124.50".
 */
function decimals(wei: bigint, min: number, max: number): string {
  const [int, frac = ''] = formatUnits(wei, 18).split('.');
  const cut = frac.slice(0, max).replace(/0+$/, '').padEnd(min, '0');
  return cut ? `${int}.${cut}` : int;
}

/**
 * An amount split into value and unit, for layouts that style the unit separately.
 * @param wei Amount in wei.
 * @param exact Keep every digit the network allows (review card) instead of the display precision (balances).
 * @returns e.g. `{ value: '$124.50', unit: 'USDC' }` on Arc.
 */
export function moneyParts(wei: bigint, exact = false): { value: string; unit: string } {
  const unit = NETWORK.symbol;
  if (!NETWORK.dollarPrefix) {
    const max = exact ? NETWORK.amountDecimals : NETWORK.displayDecimals;
    return { value: formatAmount(wei, NETWORK, max).replace(` ${unit}`, ''), unit };
  }
  const max = exact ? NETWORK.amountDecimals : 2;
  const value = decimals(wei, 2, max);
  return { value: wei > 0n && /^0\.0+$/.test(value) ? '<$0.01' : `$${value}`, unit };
}

/**
 * Short amount for running text: "$25" or "$12.50".
 * @param wei Amount in wei.
 * @returns The amount; dollar networks drop the unit and a ".00".
 */
export function money(wei: bigint): string {
  if (!NETWORK.dollarPrefix) return formatAmount(wei, NETWORK);
  const value = decimals(wei, 0, NETWORK.amountDecimals);
  return `$${value.includes('.') ? decimals(wei, 2, NETWORK.amountDecimals) : value}`;
}

/**
 * Coarse relative time.
 * @param at Epoch ms.
 * @param now Clock (ms), default now.
 * @returns e.g. "Just now", "5 min ago", "3 h ago", "Yesterday", or a date.
 */
export function timeAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 48 * 60) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
