/**
 * @file Small HTTP helpers shared by every route module: the Hono env type,
 * log masking and the typed `{ error, message }` response.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode } from './api';

/** Hono context variables: safe fields for the one request log line. */
export type Env = { Variables: { log: Record<string, unknown> } };

/**
 * Shortens an address for logs: first and last 4 characters only.
 * @param address Any address string.
 * @returns e.g. "0xAb…12cd".
 */
export const maskAddress = (address: string): string => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Sends a typed API error.
 * @param c Hono context.
 * @param status HTTP status.
 * @param error Machine-readable code from `api.ts`.
 * @param message One plain sentence for the user.
 * @returns The JSON response.
 */
export function apiError(c: Context, status: ContentfulStatusCode, error: ApiErrorCode, message: string): Response {
  return c.json({ error, message }, status);
}
