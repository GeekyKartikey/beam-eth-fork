/**
 * @file Profile avatar routes: auth, validation and a save/serve round trip.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProfileRoutes } from '../src/profile/routes';

const TOKEN = 'test-token';
const WALLET = '0x1111111111111111111111111111111111111111';
const auth = { authorization: `Bearer ${TOKEN}` };

let dir: string;
let app: ReturnType<typeof createProfileRoutes>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'beam-uploads-'));
  app = createProfileRoutes({ agentToken: TOKEN, uploadsDir: dir });
});
afterAll(async () => void (await rm(dir, { recursive: true, force: true })));

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
const form = (parts: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(parts)) f.append(k, v);
  return f;
};
const post = (body: FormData, headers: Record<string, string> = auth) => app.request('/avatar', { method: 'POST', headers, body });

describe('POST /avatar', () => {
  it('rejects a missing or bad token', async () => {
    expect((await post(form({ wallet: WALLET, image: png() }), {})).status).toBe(401);
    expect((await post(form({ wallet: WALLET, image: png() }), { authorization: 'Bearer nope' })).status).toBe(401);
  });

  it('rejects a bad wallet and a missing image', async () => {
    expect((await post(form({ wallet: '0xnope', image: png() }))).status).toBe(400);
    expect((await post(form({ wallet: WALLET }))).status).toBe(400);
  });

  it('rejects an unsupported type', async () => {
    const txt = new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' });
    expect((await post(form({ wallet: WALLET, image: txt }))).status).toBe(415);
  });

  it('saves a valid image and serves it back with its content type', async () => {
    expect((await post(form({ wallet: WALLET, image: png() }))).status).toBe(200);
    const res = await app.request(`/avatar/${WALLET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it('serves 404 for a wallet with no avatar', async () => {
    expect((await app.request('/avatar/0x2222222222222222222222222222222222222222')).status).toBe(404);
  });
});
