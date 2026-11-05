/**
 * @file The real IDKit wiring against a fake bridge (IDKit's runtime `fetch`
 * hook, no network): the connect URL, World App's return to Beam, the RP context
 * and credential sent, and how one poll maps to a status.
 */
import { configureIDKitRuntime } from '@worldcoin/idkit-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldId, WORLD_ACTION } from '../src/approvals/worldId';

const CONFIG = { appId: 'app_434e1889762005d1f29faa899ef8762a', rpId: 'rp_346985f8929bb5cf', signingKey: `0x${'11'.repeat(32)}`, environment: 'staging' } as const;

/**
 * Installs a fake bridge: creation returns a request id; polls answer with `poll`.
 * @param poll Response for `GET /response/:id`.
 * @returns The fetch spy.
 */
function fakeBridge(poll: () => Response | Promise<Response>) {
  const bridge = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/request') && init?.method === 'POST') return Response.json({ request_id: 'b1f6a9d2-0000-4000-8000-000000000001' });
    return poll();
  });
  configureIDKitRuntime({ fetch: bridge as unknown as typeof fetch });
  return bridge;
}

afterEach(() => configureIDKitRuntime({}));

describe('worldId: IDKit wiring', () => {
  it('enrollment: staging https connect URL that returns to bubbleagent://approval; poll maps initialized → pending', async () => {
    const bridge = fakeBridge(() => Response.json({ status: 'initialized' }));
    const request = await createWorldId(CONFIG).request({ signal: 'beam:1:link:0x1:', sessionId: null, description: 'x' });
    const url = new URL(request.connectUrl);
    expect(url.origin + url.pathname).toBe('https://staging.world.org/verify');
    expect(url.searchParams.get('return_to')).toBe('bubbleagent://approval');
    expect(String(bridge.mock.calls[0]?.[0])).toBe('https://bridge.worldcoin.org/request');
    expect(await request.poll()).toEqual({ status: 'pending' });
  });

  it('session proofs and enrollments both open a request; a failing bridge poll → 503 WORLD_UNAVAILABLE', async () => {
    fakeBridge(() => new Response('', { status: 502 }));
    const world = createWorldId(CONFIG);
    const request = await world.request({ signal: 'beam:2:pay:0x1:0xab', sessionId: `session_${'0a'.repeat(32)}01${'0b'.repeat(31)}`, description: 'Pay 1 USDC' });
    await expect(request.poll()).rejects.toMatchObject({ status: 503, code: 'WORLD_UNAVAILABLE' });
    expect(WORLD_ACTION).toBe('beam-approve');
  });

  it('bridge down on creation → 503 WORLD_UNAVAILABLE', async () => {
    configureIDKitRuntime({ fetch: (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch });
    await expect(createWorldId(CONFIG).request({ signal: 's', sessionId: null, description: 'x' })).rejects.toMatchObject({ code: 'WORLD_UNAVAILABLE' });
  });
});
