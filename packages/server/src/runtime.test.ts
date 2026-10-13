import type { LobbySnapshot } from '@jackdaw/engine';
import { rps, type RpsPlayerView, type RpsTableView } from '@jackdaw/game-rps';
import { describe, expect, it } from 'vitest';
import { createHttpHandlers } from './http';
import { createRoomRuntime, hashToken, type UnchangedSnapshot } from './runtime';
import { MemoryStorage } from './storage';

const TOKENS = {
  ana: 'token-ana-0123456789',
  ben: 'token-ben-0123456789',
  cy: 'token-cy-01234567890',
};

function setup(opts: { rateLimit?: { posts: number; polls: number; windowMs: number } } = {}) {
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

const isSnapshot = (s: LobbySnapshot | UnchangedSnapshot): s is LobbySnapshot =>
  !('unchanged' in s);
async function snap(p: Promise<LobbySnapshot | UnchangedSnapshot>): Promise<LobbySnapshot> {
  const s = await p;
  if (!isSnapshot(s)) throw new Error('expected a full snapshot');
  return s;
}

/** Ana hosts an RPS lobby (from the catalog); Ben and Cy join. */
async function threePlayerLobby(rounds = 1) {
  const env = setup();
  const created = await env.runtime.create({ token: TOKENS.ana, name: 'Ana', gameId: 'rps' });
  const { code } = created;
  await env.runtime.post(code, TOKENS.ben, { type: 'join', name: 'Ben' });
  await env.runtime.post(code, TOKENS.cy, { type: 'join', name: 'Cy' });
  await env.runtime.post(code, TOKENS.ana, { type: 'setOptions', options: { rounds } });
  return { ...env, code };
}

const pick = (s: LobbySnapshot, p: 'rock' | 'paper' | 'scissors') => ({
  type: 'action' as const,
  sessionId: s.session!.id,
  seq: s.session!.seq,
  action: { type: 'pick', pick: p },
});

describe('room runtime', () => {
  it('runs create → join → start → simultaneous picks → results → play again', async () => {
    const { runtime, code } = await threePlayerLobby(1);
    const started = await runtime.post(code, TOKENS.ana, { type: 'start' });
    expect(started.status).toBe('in_game');

    // Everyone picks from the same snapshot (same seq) at once: all must be accepted.
    const views = await Promise.all(
      (['ana', 'ben', 'cy'] as const).map((who) =>
        snap(runtime.poll(code, { token: TOKENS[who] })),
      ),
    );
    const results = await Promise.all([
      runtime.post(code, TOKENS.ana, pick(views[0]!, 'rock')),
      runtime.post(code, TOKENS.ben, pick(views[1]!, 'scissors')),
      runtime.post(code, TOKENS.cy, pick(views[2]!, 'scissors')),
    ]);
    const final = results.find((r) => r.status === 'results') ?? results[2]!;
    expect(final.status).toBe('results');
    expect(final.results?.winners).toEqual([started.players[0]!.id]);
    expect(final.history[0]?.gameId).toBe('rps');

    // The full record and stats come from their own endpoint.
    const { stats, history } = await runtime.stats(code);
    expect(history).toHaveLength(1);
    expect(history[0]?.names[started.players[0]!.id]).toBe('Ana');
    expect(stats.totalGames).toBe(1);
    expect(stats.players[0]).toMatchObject({ name: 'Ana', played: 1, wins: 1, losses: 0 });
    expect(stats.games).toEqual([{ gameId: 'rps', played: 1, lastPlayedAt: expect.any(Number) }]);

    const again = await runtime.post(code, TOKENS.ana, { type: 'playAgain' });
    expect(again.status).toBe('in_game');
    expect(again.selectedGameId).toBe('rps');
    expect(again.gameOptions).toEqual({ rounds: 1 });
    expect(again.session?.id).not.toBe(started.session?.id);
  });

  it('only the host may start', async () => {
    const { runtime, code } = await threePlayerLobby();
    await expect(runtime.post(code, TOKENS.ben, { type: 'start' })).rejects.toThrow(/host/);
  });

  it('a refreshed phone with the same token reclaims its seat mid-game', async () => {
    const { runtime, code } = await threePlayerLobby(2);
    await runtime.post(code, TOKENS.ana, { type: 'start' });
    const before = await snap(runtime.poll(code, { token: TOKENS.ben }));
    await runtime.post(code, TOKENS.ben, pick(before, 'paper'));
    // "Refresh": join again with the same token.
    const rejoined = await runtime.post(code, TOKENS.ben, { type: 'join', name: 'Benjamin' });
    expect(rejoined.me).toBe(before.me);
    expect(rejoined.players).toHaveLength(3);
    expect((rejoined.view as RpsPlayerView).myPick).toBe('paper');
  });

  it('answers unchanged when the caller already has the latest version', async () => {
    const { runtime, code } = await threePlayerLobby();
    const first = await snap(runtime.poll(code, { token: TOKENS.ana }));
    const second = await runtime.poll(code, { token: TOKENS.ana }, first.version);
    expect(second).toMatchObject({ unchanged: true, version: first.version });
    expect((second as UnchangedSnapshot).online).toContain(first.me);
  });

  it('gives a TV only the public table view and counts it as a display', async () => {
    const { runtime, code } = await threePlayerLobby();
    await runtime.post(code, TOKENS.ana, { type: 'start' });
    const ana = await snap(runtime.poll(code, { token: TOKENS.ana }));
    await runtime.post(code, TOKENS.ana, pick(ana, 'rock'));
    const tv = await snap(runtime.poll(code, { displayId: 'living-room' }));
    expect(tv.me).toBeNull();
    expect(tv.view).toBeUndefined();
    expect((tv.tableView as RpsTableView).picked).toEqual([ana.me]);
    expect(JSON.stringify(tv)).not.toContain('rock');
    expect(tv.displays).toBe(1);
    expect(tv.players).toHaveLength(3);
  });

  it('hands host to the longest-connected player after the host is away for 60s', async () => {
    const { runtime, code, clock } = await threePlayerLobby();
    clock.advance(30_000);
    await runtime.poll(code, { token: TOKENS.ben });
    await runtime.poll(code, { token: TOKENS.cy });
    clock.advance(35_000); // Ana last seen 65s ago, Ben and Cy 35s ago.
    const s = await snap(runtime.poll(code, { token: TOKENS.cy }));
    expect(s.hostId).toBe(s.players[1]!.id);
  });

  it('rate-limits a device that floods messages', async () => {
    const env = setup({ rateLimit: { posts: 3, polls: 100, windowMs: 10_000 } });
    const { code } = await env.runtime.create({ token: TOKENS.ana, name: 'Ana' });
    for (let i = 0; i < 3; i++)
      await env.runtime.post(code, TOKENS.ana, { type: 'chat', text: `hi ${i}` });
    await expect(
      env.runtime.post(code, TOKENS.ana, { type: 'chat', text: 'spam' }),
    ).rejects.toThrow(/Slow down/);
    env.clock.advance(10_001);
    await expect(
      env.runtime.post(code, TOKENS.ana, { type: 'chat', text: 'ok now' }),
    ).resolves.toBeDefined();
  });

  it('serialises concurrent writes so none are lost', async () => {
    const { runtime, code } = await threePlayerLobby();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        runtime.post(code, i % 2 ? TOKENS.ben : TOKENS.cy, { type: 'chat', text: `msg ${i}` }),
      ),
    );
    const s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(s.chat).toHaveLength(8);
  });

  it('moves a seat to a new device with a rejoin code', async () => {
    const { runtime, code } = await threePlayerLobby();
    const withCode = await runtime.post(code, TOKENS.ben, { type: 'createRejoinCode' });
    const rejoinCode = withCode.rejoinCode!.code;
    expect(rejoinCode).toMatch(/^[A-Z]{6}$/);
    const moved = await runtime.redeemRejoin(code, 'token-new-phone-0123', rejoinCode);
    expect(moved.me).toBe(withCode.me);
    const old = await snap(runtime.poll(code, { token: TOKENS.ben }));
    expect(old.me).toBeNull();
  });

  it('stores only hashed tokens, and never puts secrets in snapshots', async () => {
    const { runtime, code, storage } = await threePlayerLobby();
    const raw = (await storage.get(`jackdaw:lobby:${code}`))!;
    expect(raw).not.toContain(TOKENS.ana);
    expect(raw).toContain(await hashToken(TOKENS.ana));
    const s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(JSON.stringify(s)).not.toContain(await hashToken(TOKENS.ana));
  });

  it('refuses unknown lobbies and strangers', async () => {
    const { runtime, code } = await threePlayerLobby();
    await expect(runtime.poll('ZZZZ', { token: TOKENS.ana })).rejects.toThrow(/does not exist/);
    await expect(runtime.post(code, 'token-stranger-012345', { type: 'start' })).rejects.toThrow(
      /not in this lobby/,
    );
  });
});

describe('http handlers', () => {
  it('maps requests and errors to JSON responses', async () => {
    const { runtime } = setup();
    const http = createHttpHandlers(runtime);
    const headers = { 'x-player-token': TOKENS.ana, 'content-type': 'application/json' };

    const created = await http.createLobby(
      new Request('http://x/api/lobby', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Ana', gameId: 'rps' }),
      }),
    );
    expect(created.status).toBe(201);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const { code } = (await created.json()) as { code: string };

    const polled = await http.getLobby(
      new Request(`http://x/api/lobby/${code.toLowerCase()}`, { headers }),
      code.toLowerCase(),
    );
    expect(polled.status).toBe(200);
    const { version } = (await polled.json()) as LobbySnapshot;
    const unchanged = await http.getLobby(
      new Request(`http://x/api/lobby/${code}?v=${version}`, { headers }),
      code,
    );
    expect(await unchanged.json()).toMatchObject({ unchanged: true });

    const tooFew = await http.postLobby(
      new Request(`http://x/api/lobby/${code}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'start' }),
      }),
      code,
    );
    expect(tooFew.status).toBe(409);
    expect(await tooFew.json()).toEqual({
      error: { code: 'PLAYER_COUNT', message: 'Needs 2 to 10 players.' },
    });

    const noToken = await http.postLobby(
      new Request(`http://x/api/lobby/${code}`, { method: 'POST', body: '{}' }),
      code,
    );
    expect(noToken.status).toBe(401);
    const stats = await http.getStats(new Request(`http://x/api/lobby/${code}/stats`), code);
    expect(stats.status).toBe(200);
    expect(await stats.json()).toMatchObject({ stats: { totalGames: 0 }, history: [] });

    const badCode = await http.getLobby(new Request('http://x/api/lobby/12'), '12');
    expect(badCode.status).toBe(404);
    const badJson = await http.postLobby(
      new Request(`http://x/api/lobby/${code}`, { method: 'POST', headers, body: 'nope' }),
      code,
    );
    expect(badJson.status).toBe(400);
  });
});
