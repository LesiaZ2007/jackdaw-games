import type { LobbySnapshot } from '@jackdaw/engine';
import { rps } from '@jackdaw/game-rps';
import { describe, expect, it } from 'vitest';
import { toErrorBody, RoomError } from './errors';
import { createHttpHandlers, MAX_BODY_BYTES } from './http';
import { createRoomRuntime, type UnchangedSnapshot } from './runtime';
import { MemoryStorage } from './storage';

const TOKENS = {
  ana: 'token-ana-0123456789',
  ben: 'token-ben-0123456789',
  cy: 'token-cy-01234567890',
  dee: 'token-dee-0123456789',
};
const rotating = (i: number) => `rotating-token-${String(i).padStart(8, '0')}`;

function setup(opts: Partial<Parameters<typeof createRoomRuntime>[0]> = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const storage = new MemoryStorage(clock.now);
  const runtime = createRoomRuntime({
    storage,
    games: { rps },
    now: clock.now,
    readCacheMs: 0,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
    ...opts,
  });
  return { runtime, storage, clock };
}

async function snap(p: Promise<LobbySnapshot | UnchangedSnapshot>): Promise<LobbySnapshot> {
  const s = await p;
  if ('unchanged' in s) throw new Error('expected a full snapshot');
  return s;
}

async function lobbyOf(opts: Parameters<typeof setup>[0] = {}) {
  const env = setup(opts);
  const { code } = await env.runtime.create({ token: TOKENS.ana, name: 'Wren', gameId: 'rps' });
  await env.runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' });
  await env.runtime.post(code, TOKENS.cy, { type: 'join', name: 'Magpie' });
  return { ...env, code };
}

describe('address limits', () => {
  it('rotating tokens from one address still hit the address bucket', async () => {
    const { runtime, code } = await lobbyOf({ addressLimit: { polls: 5, posts: 5 } });
    for (let i = 0; i < 5; i++) await runtime.poll(code, { token: rotating(i), ip: '10.0.0.1' });
    await expect(runtime.poll(code, { token: rotating(99), ip: '10.0.0.1' })).rejects.toMatchObject(
      { code: 'RATE_LIMITED' },
    );
    await expect(
      runtime.poll(code, { token: rotating(100), ip: '10.0.0.2' }),
    ).resolves.toBeDefined();
    // Posts share a bucket across tokens as well.
    for (let i = 0; i < 5; i++)
      await runtime.post(code, TOKENS.ana, { type: 'chat', text: `hi ${i}` }, { ip: '10.0.0.3' });
    await expect(
      runtime.post(code, TOKENS.ben, { type: 'chat', text: 'more' }, { ip: '10.0.0.3' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('lets a household of 15 phones and a TV poll from one address by default', async () => {
    const { runtime, code } = await lobbyOf();
    for (let i = 0; i < 300; i++)
      await runtime.poll(code, { displayId: `tv-${i % 16}-xx`, ip: '10.0.0.1' });
  });

  it('limits new joins per address per minute, but not a seated device coming back', async () => {
    const { runtime, code, clock } = await lobbyOf({ addressLimit: { joins: 2 } });
    const join = (token: string, name: string) =>
      runtime.post(code, token, { type: 'join', name }, { ip: '10.0.0.4' });
    await join(rotating(1), 'Finch');
    await join(rotating(2), 'Heron');
    // Seated devices re-joining (a refresh) are free.
    await join(rotating(1), 'Finch');
    await expect(join(rotating(3), 'Lark')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    clock.advance(60_001);
    await expect(join(rotating(3), 'Lark')).resolves.toBeDefined();
  });

  it('never clears the guess counters when a flood of other keys fills the table', async () => {
    const { runtime, code } = await lobbyOf({ addressLimit: { misses: 2 } });
    runtime.noteMiss('10.9.9.9');
    runtime.noteMiss('10.9.9.9');
    expect(() => runtime.checkAddress('10.9.9.9')).toThrow(/Too many wrong codes/);
    for (let i = 0; i < 10_100; i++) await runtime.poll(code, { displayId: `flood-${i}-xx` });
    expect(() => runtime.checkAddress('10.9.9.9')).toThrow(/Too many wrong codes/);
  }, 30_000);

  it('drops expired counters before evicting live ones', async () => {
    const { runtime, code, clock } = await lobbyOf({ addressLimit: { misses: 2 } });
    runtime.noteMiss('10.9.9.8');
    runtime.noteMiss('10.9.9.8');
    for (let i = 0; i < 10_050; i++) await runtime.poll(code, { displayId: `old-${i}-xxx` });
    clock.advance(10_001);
    // Everything above has expired; adding keys now prunes it and the guess window has passed too.
    for (let i = 0; i < 10; i++) await runtime.poll(code, { displayId: `new-${i}-xxx` });
    expect(() => runtime.checkAddress('10.9.9.8')).not.toThrow();
  }, 30_000);

  it('keys stats by caller, not by lobby', async () => {
    const { runtime, code } = await lobbyOf({
      rateLimit: { posts: 30, polls: 2, windowMs: 10_000 },
    });
    await runtime.stats(code, { token: TOKENS.ana });
    await runtime.stats(code, { token: TOKENS.ana });
    await expect(runtime.stats(code, { token: TOKENS.ana })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(runtime.stats(code, { token: TOKENS.ben })).resolves.toBeDefined();
    await expect(runtime.stats(code, { ip: '10.0.0.7' })).resolves.toBeDefined();
  });

  it('puts requests with no address header in one shared bucket', async () => {
    const { runtime, code } = await lobbyOf({ addressLimit: { polls: 2 } });
    const http = createHttpHandlers(runtime);
    const get = (headers: Record<string, string> = {}) =>
      http.getLobby(new Request(`http://x/api/lobby/${code}`, { headers }), code);
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(429);
    expect((await get({ 'x-vercel-forwarded-for': '10.1.1.1' })).status).toBe(200);
    expect((await get({ 'x-real-ip': '10.1.1.2' })).status).toBe(200);
  });
});

describe('strangers do not take the lock', () => {
  it('a device that is not seated is refused without waiting for the lobby lock', async () => {
    const { runtime, storage, code } = await lobbyOf();
    await storage.set(`jackdaw:lock:${code}`, 'someone-else', 10);
    await expect(
      runtime.post(code, TOKENS.dee, { type: 'chat', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'NOT_A_PLAYER' });
    // A post to a lobby that doesn't exist is refused without locking too.
    await expect(
      runtime.post('ZZZZ', TOKENS.dee, { type: 'chat', text: 'hi' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a bad rejoin code is refused without the lock and counts as a miss', async () => {
    const { runtime, storage, code } = await lobbyOf({ addressLimit: { misses: 3 } });
    await storage.set(`jackdaw:lock:${code}`, 'someone-else', 10);
    for (let i = 0; i < 3; i++)
      await expect(
        runtime.redeemRejoin(code, TOKENS.dee, 'ABCDEF', { ip: '10.2.2.2' }),
      ).rejects.toMatchObject({ code: 'REJOIN_INVALID' });
    expect(() => runtime.checkAddress('10.2.2.2')).toThrow(/Too many wrong codes/);
    await expect(
      runtime.redeemRejoin('ZZZZ', TOKENS.dee, 'ABCDEF', { ip: '10.2.2.3' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('TV presence', () => {
  it('records at most 8 distinct displays but still serves the rest', async () => {
    const { runtime, code } = await lobbyOf();
    let last: LobbySnapshot | null = null;
    for (let i = 0; i < 12; i++)
      last = await snap(runtime.poll(code, { displayId: `tv-${i}-xxxx` }));
    expect(last!.displays).toBe(8);
    expect(last!.players).toHaveLength(3);
    // A recorded display keeps working.
    expect((await snap(runtime.poll(code, { displayId: 'tv-0-xxxx' }))).displays).toBe(8);
  });
});

describe('the lock and knocking, through the runtime', () => {
  it('a locked lobby refuses new devices, and the snapshot says so', async () => {
    const { runtime, code } = await lobbyOf();
    const locked = await runtime.post(code, TOKENS.ana, { type: 'setLocked', locked: true });
    expect(locked.locked).toBe(true);
    await expect(
      runtime.post(code, TOKENS.dee, { type: 'join', name: 'Finch' }),
    ).rejects.toMatchObject({
      code: 'LOCKED',
      message: 'This lobby is locked. Ask the host to unlock it.',
    });
    expect(
      (await runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' })).players,
    ).toHaveLength(3);
    await expect(
      runtime.post(code, TOKENS.ben, { type: 'setLocked', locked: false }),
    ).rejects.toMatchObject({
      code: 'NOT_HOST',
    });
    await runtime.post(code, TOKENS.ana, { type: 'setLocked', locked: false });
    const joined = await runtime.post(code, TOKENS.dee, { type: 'join', name: 'Finch' });
    expect(joined.players).toHaveLength(4);
  });

  it('removed → knock → host allows → seated; or host blocks → blocked for 10 minutes', async () => {
    const { runtime, code, clock } = await lobbyOf();
    const host = await snap(runtime.poll(code, { token: TOKENS.ana }));
    const benId = host.players[1]!.id;
    await runtime.post(code, TOKENS.ana, { type: 'kick', playerId: benId });

    // The removed phone retries join every few seconds: refused each time, one knock.
    for (let i = 0; i < 3; i++) {
      await expect(
        runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' }),
      ).rejects.toMatchObject({
        code: 'ASK_HOST',
      });
      clock.advance(3_000);
    }
    const asked = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(asked.knocks).toHaveLength(1);
    expect(asked.knocks![0]).toEqual({
      id: expect.any(String),
      name: 'Rook',
      avatar: expect.any(Object),
    });
    expect(Object.keys(asked.knocks![0]!).sort()).toEqual(['avatar', 'id', 'name']);
    // Knocking again and again adds nothing to the chat beyond the one removal line.
    expect(asked.chat.filter((m) => m.text.includes('removed'))).toHaveLength(1);
    const other = await snap(runtime.poll(code, { token: TOKENS.cy }));
    expect(other.knocks).toBeUndefined();
    const tv = await snap(runtime.poll(code, { displayId: 'tv-1-xxxx' }));
    expect(tv.knocks).toBeUndefined();

    // Only the host answers.
    const id = asked.knocks![0]!.id;
    await expect(
      runtime.post(code, TOKENS.cy, { type: 'answerKnock', id, allow: true }),
    ).rejects.toMatchObject({ code: 'NOT_HOST' });

    // Deny: blocked for 10 minutes, then they may ask again.
    await runtime.post(code, TOKENS.ana, { type: 'answerKnock', id, allow: false });
    await expect(
      runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' }),
    ).rejects.toMatchObject({
      code: 'BLOCKED',
      message: 'The host has blocked you from this lobby for a few minutes.',
    });
    expect((await snap(runtime.poll(code, { token: TOKENS.ana }))).knocks).toBeUndefined();
    clock.advance(10 * 60_000 + 1);
    await expect(
      runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' }),
    ).rejects.toMatchObject({
      code: 'ASK_HOST',
    });

    // Allow: their next join seats them.
    const again = await snap(runtime.poll(code, { token: TOKENS.ana }));
    await runtime.post(code, TOKENS.ana, {
      type: 'answerKnock',
      id: again.knocks![0]!.id,
      allow: true,
    });
    const back = await runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' });
    expect(back.players.map((p) => p.name)).toContain('Rook');
    expect(back.me).not.toBeNull();
  });

  it('http maps the new codes to 403', async () => {
    expect(toErrorBody(new RoomError(403, 'LOCKED', 'x')).status).toBe(403);
    for (const code of ['LOCKED', 'ASK_HOST', 'BLOCKED', 'NOT_HOST', 'NOT_A_PLAYER'])
      expect(toErrorBody(new RoomError(0, code, 'x')).status).toBe(403);
  });
});

describe('error statuses', () => {
  it('come from one table, whatever raised the error', () => {
    const status = (code: string) => toErrorBody(new RoomError(999, code, 'x')).status;
    expect(status('BAD_REQUEST')).toBe(400);
    expect(status('UNAUTHORIZED')).toBe(401);
    expect(status('NOT_FOUND')).toBe(404);
    expect(status('TOO_LARGE')).toBe(413);
    expect(status('RATE_LIMITED')).toBe(429);
    expect(status('INTERNAL')).toBe(500);
    expect(status('NOT_SET_UP')).toBe(501);
    expect(status('BUSY')).toBe(503);
    expect(status('NOT_YOUR_TURN')).toBe(409);
    expect(toErrorBody(new Error('secret')).body.error).toEqual({
      code: 'INTERNAL',
      message: 'Something went wrong. Try again.',
    });
  });
});

describe('request bodies', () => {
  const post = (
    http: ReturnType<typeof createHttpHandlers>,
    code: string,
    body: string,
    extra = {},
  ) =>
    http.postLobby(
      new Request(`http://x/api/lobby/${code}`, {
        method: 'POST',
        headers: { 'x-player-token': TOKENS.ana, ...extra },
        body,
      }),
      code,
    );

  it('refuses a body over 32 KB, by header or by length, before parsing', async () => {
    const { runtime, code } = await lobbyOf();
    const http = createHttpHandlers(runtime);
    const big = JSON.stringify({ type: 'chat', text: 'x'.repeat(MAX_BODY_BYTES) });
    const byLength = await post(http, code, big);
    expect(byLength.status).toBe(413);
    expect(await byLength.json()).toMatchObject({ error: { code: 'TOO_LARGE' } });
    const byHeader = await post(http, code, '{}', { 'content-length': String(MAX_BODY_BYTES + 1) });
    expect(byHeader.status).toBe(413);
    const ok = await post(http, code, JSON.stringify({ type: 'chat', text: 'hello' }));
    expect(ok.status).toBe(200);
  });

  it('answers a missing token with UNAUTHORIZED (401), and non-object push bodies with 400', async () => {
    const { runtime, code } = await lobbyOf({
      push: { vapid: { publicKey: 'a', privateKey: 'b', subject: 'mailto:x@example.com' } },
    });
    const http = createHttpHandlers(runtime);
    const none = await http.postLobby(
      new Request(`http://x/api/lobby/${code}`, { method: 'POST', body: '{}' }),
      code,
    );
    expect(none.status).toBe(401);
    expect(await none.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    const push = (body: string) =>
      http.setPush(
        new Request(`http://x/api/lobby/${code}/push`, {
          method: 'POST',
          headers: { 'x-player-token': TOKENS.ben },
          body,
        }),
        code,
      );
    for (const body of ['null', '"gone"', '42', '[]']) expect((await push(body)).status).toBe(400);
    expect((await push('{}')).status).toBe(200);
  });

  it('says rejoin codes are 6 letters, and that is what it makes', async () => {
    const { runtime, code } = await lobbyOf();
    const http = createHttpHandlers(runtime);
    const res = await http.rejoin(
      new Request(`http://x/api/lobby/${code}/rejoin`, {
        method: 'POST',
        headers: { 'x-player-token': TOKENS.dee },
        body: JSON.stringify({ rejoinCode: 'ABC' }),
      }),
      code,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'REJOIN_INVALID', message: 'Rejoin codes are 6 letters.' },
    });
    const made = await runtime.post(code, TOKENS.ben, { type: 'createRejoinCode' });
    expect(made.rejoinCode!.code).toHaveLength(6);
  });
});

describe('stored documents', () => {
  it('treats a malformed lobby document as missing', async () => {
    const { runtime, storage, code } = await lobbyOf();
    const errors = console.error;
    console.error = () => {};
    try {
      for (const raw of ['not json', '42', 'null', '{"code":"ABCD"}', '{"players":[]}']) {
        await storage.set(`jackdaw:lobby:${code}`, raw, 60);
        await expect(runtime.poll(code, { token: TOKENS.ana })).rejects.toMatchObject({
          code: 'NOT_FOUND',
        });
      }
    } finally {
      console.error = errors;
    }
  });
});

describe('a game timer that keeps throwing', () => {
  it('is tried once per game state, not on every poll', async () => {
    let calls = 0;
    const broken = {
      ...rps,
      nextTimer: () => ({ id: 'tick', at: 0 }),
      onTimer: () => {
        calls++;
        throw new TypeError('boom');
      },
    };
    const { runtime, code } = await lobbyOf({ games: { rps: broken } });
    const errors = console.error;
    console.error = () => {};
    try {
      await runtime.post(code, TOKENS.ana, { type: 'start' });
      const before = calls;
      for (let i = 0; i < 5; i++) await runtime.poll(code, { token: TOKENS.ben });
      expect(calls - before).toBeLessThanOrEqual(1);
      const settled = calls;
      for (let i = 0; i < 5; i++) await runtime.poll(code, { token: TOKENS.ben });
      expect(calls).toBe(settled);
      // The lobby still works, and the host can end the game.
      await runtime.post(code, TOKENS.ben, { type: 'chat', text: 'hello?' });
      expect((await runtime.post(code, TOKENS.ana, { type: 'endGame' })).status).toBe('waiting');
    } finally {
      console.error = errors;
    }
  });
});

describe('game seeds', () => {
  it('start every game from a 128-bit seed', async () => {
    const { runtime, storage, code } = await lobbyOf();
    await runtime.post(code, TOKENS.ana, { type: 'start' });
    const doc = JSON.parse((await storage.get(`jackdaw:lobby:${code}`))!);
    expect(doc.session.rngState).toMatch(/^[0-9a-f]{32}$/);
  });
});
