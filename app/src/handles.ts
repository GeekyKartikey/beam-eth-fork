/**
 * @file Beam handle (`<label>.<parent>`, parent chosen by the server) calls: look up the wallet's
 * handle, check a label's availability, and claim one with a completed
 * World ID `handle` approval.
 */
import type { Address } from 'viem';
import type { HandleAvailability, HandleClaim, HandleClaimRequest, HandleLookup } from './api';
import { apiRequest } from './serverApi';
import { isRecord } from './storage';

const isLookup = (v: unknown): v is HandleLookup => isRecord(v) && (v.name === null || typeof v.name === 'string');

const isAvailability = (v: unknown): v is HandleAvailability =>
  isRecord(v) &&
  typeof v.label === 'string' &&
  typeof v.name === 'string' &&
  typeof v.available === 'boolean' &&
  (v.reason === undefined || typeof v.reason === 'string');

const isClaim = (v: unknown): v is HandleClaim =>
  isRecord(v) && typeof v.name === 'string' && (v.txHash === undefined || typeof v.txHash === 'string');

/**
 * The handle registered to a wallet.
 * @param wallet Wallet address.
 * @returns The full name, or null when the wallet has none.
 * @throws ApiError (`HANDLES_NOT_CONFIGURED` when the server has no registrar).
 */
export async function lookupHandle(wallet: Address): Promise<string | null> {
  return (await apiRequest('GET', `/v1/handles?wallet=${wallet}`, isLookup)).name;
}

/**
 * Whether a label can be claimed.
 * @param label Label that passed `validateHandleLabel`.
 * @returns Availability with the full name.
 * @throws ApiError.
 */
export function checkHandle(label: string): Promise<HandleAvailability> {
  return apiRequest('GET', `/v1/handles/${encodeURIComponent(label)}`, isAvailability);
}

/** A claim waits for two mainnet blocks (about 25 to 40 s); allow well over that. */
const CLAIM_TIMEOUT_MS = 90_000;

/**
 * Claims a handle. Idempotent on the server: a second claim by the same human returns their existing handle.
 * @param req Label, wallet and the completed `handle` approval id.
 * @returns The registered name.
 * @throws ApiError.
 */
export function claimHandle(req: HandleClaimRequest): Promise<HandleClaim> {
  return apiRequest('POST', '/v1/handles', isClaim, { body: req, timeoutMs: CLAIM_TIMEOUT_MS });
}
