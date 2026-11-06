/**
 * @file Profile avatar upload and serving.
 *
 * POST /profile/avatar (bearer auth): a multipart image for one wallet, saved to
 * the uploads folder. GET /profile/avatar/:wallet (public): serves it back.
 *
 * Mounted outside `/v1`, so the 32 KB agent body limit and the agent rate limit
 * do not apply; this route brings its own auth and size cap. Demo-grade: the
 * shared token gates writes and the wallet in the form is the key, so any holder
 * of the token can set any wallet's avatar.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Hono } from 'hono';

/** Largest avatar accepted. */
const MAX_BYTES = 4 * 1024 * 1024;
/** Accepted content types to their file extension. */
const TYPE_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** File extension back to content type for serving. */
const EXT_TYPE: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const sha256 = (s: string): Buffer => createHash('sha256').update(s).digest();
const isWallet = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

/**
 * Avatar upload and serving routes.
 * @param deps.agentToken Bearer token required to upload.
 * @param deps.uploadsDir Folder (cwd-relative or absolute) where avatars are saved.
 * @returns A Hono app to mount at `/profile`.
 */
export function createProfileRoutes(deps: { agentToken: string; uploadsDir: string }): Hono {
  const expected = sha256(deps.agentToken);
  const app = new Hono();

  /** The saved file name for a wallet (any accepted extension), or null. */
  const find = async (wallet: string): Promise<string | null> => {
    const key = wallet.toLowerCase();
    const files = await readdir(deps.uploadsDir).catch(() => [] as string[]);
    return files.find((f) => f.startsWith(`${key}.`)) ?? null;
  };

  app.post('/avatar', async (c) => {
    const token = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token || !timingSafeEqual(sha256(token), expected)) return c.json({ error: 'UNAUTHORIZED', message: 'Missing or bad token.' }, 401);
    if (Number(c.req.header('content-length') ?? 0) > MAX_BYTES + 4096) return c.json({ error: 'PAYLOAD_TOO_LARGE', message: 'Max 4 MB.' }, 413);

    const body = await c.req.parseBody().catch(() => null);
    const wallet = body?.wallet;
    const image = body?.image;
    if (!isWallet(wallet)) return c.json({ error: 'BAD_REQUEST', message: 'Missing or bad wallet.' }, 400);
    if (!(image instanceof File)) return c.json({ error: 'BAD_REQUEST', message: 'Missing image.' }, 400);
    const ext = TYPE_EXT[image.type];
    if (!ext) return c.json({ error: 'UNSUPPORTED_MEDIA_TYPE', message: 'Image must be PNG, JPEG or WebP.' }, 415);
    if (image.size > MAX_BYTES) return c.json({ error: 'PAYLOAD_TOO_LARGE', message: 'Max 4 MB.' }, 413);

    const key = wallet.toLowerCase();
    await mkdir(deps.uploadsDir, { recursive: true });
    const old = await find(key);
    if (old && old !== `${key}.${ext}`) await rm(join(deps.uploadsDir, old)).catch(() => {});
    await writeFile(join(deps.uploadsDir, `${key}.${ext}`), Buffer.from(await image.arrayBuffer()));
    return c.json({ ok: true });
  });

  app.get('/avatar/:wallet', async (c) => {
    const wallet = c.req.param('wallet');
    if (!isWallet(wallet)) return c.json({ error: 'BAD_REQUEST', message: 'Bad wallet.' }, 400);
    const file = await find(wallet);
    const bytes = file ? await readFile(join(deps.uploadsDir, file)).catch(() => null) : null;
    if (!bytes) return c.json({ error: 'NOT_FOUND', message: 'No avatar.' }, 404);
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': EXT_TYPE[file!.split('.').pop() ?? ''] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' },
    });
  });

  return app;
}
