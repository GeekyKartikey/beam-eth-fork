/**
 * @file Beam handle endpoints. The server mounts them at `/v1/handles` behind
 * auth and rate limiting:
 * - `GET /:label` → `HandleAvailability`
 * - `GET /?wallet=0x…` → `HandleLookup`
 * - `POST /` (`HandleClaimRequest`) → `HandleClaim`, after a completed World ID `handle` approval.
 * Errors are `{ error: ApiErrorCode, message }`; 503 `HANDLES_NOT_CONFIGURED` when the env is not set.
 */
import { Hono, type Context } from 'hono';
import type { Address, Hex, PublicClient } from 'viem';
import { z } from 'zod';
import { validateHandleLabel, type ApiErrorCode, type HandleClaimRequest } from '../api';
import { WalletAddress } from '../schemas';
import type { HandlesConfig } from './config';
import { createHandleRegistrar, createHandleWriter, HandleError, type HandleRegistrar, type HandleWriter } from './registrar';
import { createHandleStore, type HandleStore } from './store';

/** What the routes need from the server. */
export type HandleRouteDeps = {
  /** ENS chain client (Ethereum mainnet or Sepolia, matching `config.chain`). */
  ensClient: PublicClient;
  /**
   * Consumes a completed `handle` approval for `wallet` (single use).
   * Returns null when there is none; may instead throw an error whose `code` is one of
   * APPROVAL_NOT_FOUND, APPROVAL_EXPIRED, APPROVAL_USED, NOT_LINKED, HUMAN_MISMATCH.
   */
  takeHandleApproval: (approvalId: string, wallet: Address) => { humanHash: Hex } | null | Promise<{ humanHash: Hex } | null>;
  /** From `loadHandlesConfig(process.env)`; null turns every endpoint into a 503. */
  config: HandlesConfig | null;
  /** Tests only: registrar signer (default: `ENS_REGISTRAR_PRIVATE_KEY` over `ensClient`'s transport). */
  writer?: HandleWriter;
  /** Tests only: per-human store (default: JSON file at `config.storePath`). */
  store?: HandleStore;
};

const APPROVAL_STATUS: Partial<Record<ApiErrorCode, 403 | 404 | 409 | 410>> = {
  APPROVAL_NOT_FOUND: 404,
  APPROVAL_EXPIRED: 410,
  APPROVAL_USED: 409,
  NOT_LINKED: 403,
  HUMAN_MISMATCH: 403,
};

const ClaimSchema = z.object({
  label: z.string().max(64),
  wallet: WalletAddress,
  approvalId: z.string().min(1).max(128),
}) satisfies z.ZodType<HandleClaimRequest, unknown>;

/**
 * Sends an API error.
 * @param c Hono context.
 * @param err Error with code, status and user-facing message.
 * @returns JSON response.
 */
const fail = (c: Context, err: HandleError) => c.json({ error: err.code, message: err.message }, err.status);

/**
 * Maps whatever `takeHandleApproval` threw to a HandleError, or null if it is not an approval error.
 * @param err Thrown value.
 * @returns The mapped error or null.
 */
function approvalError(err: unknown): HandleError | null {
  const code = (err as { code?: unknown } | null)?.code;
  const status = typeof code === 'string' ? APPROVAL_STATUS[code as ApiErrorCode] : undefined;
  if (!status) return null;
  const message = err instanceof Error && err.message ? err.message : 'World ID approval failed.';
  return new HandleError(code as ApiErrorCode, status, message);
}

/**
 * Builds the handle routes.
 * @param deps ENS client, approval hook, config and optional test doubles.
 * @returns A Hono sub-app to mount at `/v1/handles`.
 */
export function createHandleRoutes(deps: HandleRouteDeps): Hono {
  const app = new Hono();
  const { config } = deps;
  const registrar: HandleRegistrar | null = config
    ? createHandleRegistrar({
        reader: deps.ensClient,
        writer: deps.writer ?? createHandleWriter(deps.ensClient, config),
        config,
        store: deps.store ?? createHandleStore(config.storePath),
      })
    : null;

  app.use('*', async (c, next) => {
    if (!registrar) return fail(c, new HandleError('HANDLES_NOT_CONFIGURED', 503, 'Handles are not set up on this server.'));
    return next();
  });

  app.get('/', async (c) => {
    const wallet = WalletAddress.safeParse(c.req.query('wallet') ?? '');
    if (!wallet.success) return c.json({ error: 'BAD_REQUEST' satisfies ApiErrorCode, message: 'Pass ?wallet=0x…' }, 400);
    return c.json(await registrar!.lookupByWallet(wallet.data));
  });

  app.get('/:label', async (c) => c.json(await registrar!.availability(c.req.param('label').slice(0, 64))));

  app.post('/', async (c) => {
    const parsed = ClaimSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return c.json({ error: 'BAD_REQUEST' satisfies ApiErrorCode, message: z.prettifyError(parsed.error).slice(0, 300) }, 400);
    }
    const { label, wallet, approvalId } = parsed.data;
    // Reject a bad label before spending the single-use approval.
    const valid = validateHandleLabel(label);
    if ('error' in valid) return fail(c, new HandleError('HANDLE_INVALID', 400, valid.error));

    let approval: { humanHash: Hex } | null;
    try {
      approval = await deps.takeHandleApproval(approvalId, wallet);
    } catch (err) {
      const mapped = approvalError(err);
      if (mapped) return fail(c, mapped);
      throw err;
    }
    if (!approval) return fail(c, new HandleError('NOT_LINKED', 403, 'Verify with World ID to claim a handle.'));

    return c.json(await registrar!.claim({ label: valid.label, wallet, humanHash: approval.humanHash }));
  });

  app.onError((err, c) => {
    if (err instanceof HandleError) return fail(c, err);
    return c.json({ error: 'INTERNAL' satisfies ApiErrorCode, message: 'Something went wrong.' }, 500);
  });

  return app;
}
