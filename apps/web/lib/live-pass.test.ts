import { afterEach, describe, expect, it, vi } from 'vitest';
import { livePassFor } from './live-pass';

afterEach(() => vi.unstubAllGlobals());

describe('livePassFor', () => {
  it('is missing on a site without live rooms', () => {
    expect(livePassFor('ABCD', false, false)).toBeUndefined();
  });

  it('is the same function for the same lobby and role (so screens keep their socket)', () => {
    expect(livePassFor('ABCD', false, true)).toBe(livePassFor('ABCD', false, true));
    expect(livePassFor('ABCD', true, true)).not.toBe(livePassFor('ABCD', false, true));
  });

  it("asks for the phone's pass with its token, and the TV's with ?tv=1", async () => {
    const fetch = vi.fn(async () => Response.json({ pass: 'p.s', path: '/live/ABCD/s1' }));
    vi.stubGlobal('fetch', fetch);
    expect(await livePassFor('WXYZ', false, true)!()).toEqual({
      pass: 'p.s',
      path: '/live/ABCD/s1',
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/lobby/WXYZ/live');
    expect(new Headers(init.headers).has('x-player-token')).toBe(true);
    await livePassFor('WXYZ', true, true)!();
    expect((fetch.mock.calls[1] as unknown as [string])[0]).toBe('/api/lobby/WXYZ/live?tv=1');
  });

  it('gives null when the room is refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    expect(await livePassFor('NOPE', false, true)!()).toBeNull();
  });
});
