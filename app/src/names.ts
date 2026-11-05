/**
 * @file Device-side ENS checks around a payment: re-resolving the name right
 * before Confirm and before signing, and the avatar URL for the review card.
 */
import { resolveName } from './chain';
import { config } from './config';
import type { Address } from 'viem';

/** Result of re-resolving an intent's name on the device. */
export type NameCheck = 'match' | 'mismatch' | 'unavailable';

/**
 * Re-resolves a name and compares it with the address about to be paid.
 * @param name Normalized ENS name.
 * @param expected Checksummed address in the intent.
 * @returns `match`, `mismatch` (the name now points elsewhere or nowhere), or `unavailable` (lookup failed).
 */
export async function recheckName(name: string, expected: Address): Promise<NameCheck> {
  try {
    const resolved = await resolveName(name);
    return resolved?.address === expected ? 'match' : 'mismatch';
  } catch {
    return 'unavailable';
  }
}

/**
 * ENS metadata service avatar for a name (serves the `avatar` text record as an image).
 * @param name Normalized ENS name.
 * @returns Image URL; it 404s when the name has no avatar.
 */
export const ensAvatarUrl = (name: string): string =>
  `https://metadata.ens.domains/${config.ensChain.id === 1 ? 'mainnet' : 'sepolia'}/avatar/${encodeURIComponent(name)}`;
