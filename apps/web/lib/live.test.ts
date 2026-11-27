import { maze } from '@jackdaw/game-maze';
import { signBody, verifyPass } from '@jackdaw/game-maze/live';
import { createRoomRuntime, MemoryStorage } from '@jackdaw/server';
import { describe, expect, it } from 'vitest';
import { issueLivePass, takeLiveResult } from './live';

const SECRET = 'live-secret-for-tests-0123456789';
const TOKENS = { wren: 'token-wren-0123456789', rook: 'token-rook-0123456789' };

async function contactLobby() {
  const t = 5_000_000;
  const runtime = createRoomRuntime({
    storage: new MemoryStorage(() => t),
    games: { maze },
    now: () => t,
    readCacheMs: 0,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  });
  const { code } = await runtime.create({ token: TOKENS.wren, name: 'Wren', gameId: 'maze' });
  await runtime.post(code, TOKENS.rook, { type: 'join', name: 'Rook' });
  await runtime.post(code, TOKENS.wren, {
    type: 'setOptions',
    options: { ...maze.defaultOptions(2), mode: 'Contact' },
  });
  const started = await runtime.post(code, TOKENS.wren, { type: 'start', look: 'light' });
  return { runtime, code, session: started.session!.id, now: () => t, ids: started.players };
}

describe('live passes and results', () => {
  it('give a seated phone a signed pass for its own seat', async () => {
    const { runtime, code, session, now, ids } = await contactLobby();
    const out = await issueLivePass(runtime, code, { token: TOKENS.rook }, SECRET, now());
    expect(out.status).toBe(200);
    const body = out.body as { pass: string; path: string };
    expect(body.path).toBe(`/live/${code}/${session}`);
    const pass = (await verifyPass(body.pass, SECRET, now()))!;
    expect(pass.who).toBe(ids[1]!.id);
    expect(pass.session).toBe(session);
    expect(pass.setup.seats.map((s) => s.name)).toEqual(['Wren', 'Rook']);
  });

  it('give the TV a watcher pass, and refuse strangers and other modes', async () => {
    const { runtime, code, now } = await contactLobby();
    const tv = await issueLivePass(runtime, code, { tv: true }, SECRET, now());
    expect(tv.status).toBe(200);
    expect((await verifyPass((tv.body as { pass: string }).pass, SECRET, now()))!.who).toBe('tv');
    const stranger = await issueLivePass(
      runtime,
      code,
      { token: 'token-nobody-0123456789' },
      SECRET,
      now(),
    );
    expect(stranger.status).toBeGreaterThanOrEqual(400);
  });

  it('take a signed result into the game, and refuse an unsigned one', async () => {
    const { runtime, code, session, ids } = await contactLobby();
    const result = {
      type: 'liveResult',
      round: 1,
      seq: 1,
      final: false,
      players: {
        [ids[0]!.id]: {
          score: 120,
          pellets: 12,
          ghosts: 0,
          caught: 0,
          fruit: 0,
          powers: 0,
          bumps: 0,
          eats: 0,
        },
      },
      log: [],
    };
    const body = JSON.stringify({ code, sessionId: session, result });
    expect((await takeLiveResult(runtime, code, body, 'bad-signature', SECRET)).status).toBe(401);
    const ok = await takeLiveResult(runtime, code, body, await signBody(body, SECRET), SECRET);
    expect(ok.status).toBe(200);
    const snap = await runtime.poll(code, { token: TOKENS.wren });
    if ('unchanged' in snap) throw new Error('expected a snapshot');
    const me = (snap.tableView as { players: { id: string; score: number }[] }).players[0]!;
    expect(me.score).toBe(120);
    const stale = JSON.stringify({ code, sessionId: 'old', result: { ...result, seq: 2 } });
    expect(
      (await takeLiveResult(runtime, code, stale, await signBody(stale, SECRET), SECRET)).status,
    ).toBe(409);
  });
});
