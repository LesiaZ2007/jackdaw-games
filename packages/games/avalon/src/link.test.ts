import type { LobbySnapshot } from '@jackdaw/engine';
import {
  createRoomRuntime,
  MemoryStorage,
  TINT_IDS,
  type UnchangedSnapshot,
} from '@jackdaw/server';
import { describe, expect, it } from 'vitest';
import { AVALON_TINT_ORDER, avalonAvatar, avalonSettings, createAvalonLink } from './link';
import { avalon, defaultOptions, seatUrl, tvUrl, type AvalonPlayerView } from './rules';

const BASE = 'https://avalon.test';
const SECRET = 'shared-secret';

interface Created {
  body: {
    jackdawCode: string;
    returnUrl: string;
    hostId: string;
    players: { id: string; name: string; avatar: { icon: string | null; tint: number } }[];
    settings: Record<string, unknown>;
  };
  seats: Record<string, { playerId: string; token: string }>;
}

/** A stand-in for the Avalon app's two link endpoints. */
function fakeAvalon() {
  const rooms = new Map<string, Created>();
  let status: Record<string, unknown> = { phase: 'team', over: false };
  let statusCode = 200;
  let createError: { status: number; error: string } | null = null;
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (new Headers(init?.headers).get('authorization') !== `Bearer ${SECRET}`)
      return Response.json({ error: 'Not allowed.' }, { status: 401 });
    if (url.pathname === '/api/jackdaw/rooms' && init?.method === 'POST') {
      if (createError) return Response.json({ error: createError.error }, createError);
      const body = JSON.parse(String(init.body)) as Created['body'];
      const code = 'ABCD';
      const seats = Object.fromEntries(
        body.players.map((p, i) => [p.id, { playerId: `av${i}`, token: `secret-token-${p.name}` }]),
      );
      rooms.set(code, { body, seats });
      return Response.json({ code, seats });
    }
    const m = url.pathname.match(/^\/api\/jackdaw\/rooms\/([A-Z]{4})$/);
    if (m) {
      if (!rooms.has(m[1]!) || statusCode === 404)
        return Response.json({ error: 'Gone' }, { status: 404 });
      return Response.json(status, { status: statusCode });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return {
    fetch: fetchFn,
    rooms,
    setStatus: (s: Record<string, unknown>, code = 200) => {
      status = s;
      statusCode = code;
    },
    failCreate: (e: { status: number; error: string } | null) => (createError = e),
  };
}

const NAMES = ['Wren', 'Bran', 'Cerys', 'Dafydd', 'Elin'];
const tokenFor = (name: string) => `token-${name.toLowerCase()}-0123456789`;

async function fiveAtTheTable() {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const app = fakeAvalon();
  const runtime = createRoomRuntime({
    storage: new MemoryStorage(clock.now),
    games: { avalon },
    links: { avalon: createAvalonLink({ baseUrl: BASE, secret: SECRET, fetch: app.fetch }) },
    now: clock.now,
    readCacheMs: 0,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  });
  const { code } = await runtime.create({
    token: tokenFor('Wren'),
    name: 'Wren',
    gameId: 'avalon',
    avatar: { crest: 'raven', tint: 'lagoon' },
  });
  for (const name of NAMES.slice(1))
    await runtime.post(code, tokenFor(name), { type: 'join', name });
  return { runtime, code, clock, app };
}

async function snap(p: Promise<LobbySnapshot | UnchangedSnapshot>): Promise<LobbySnapshot> {
  const s = await p;
  if ('unchanged' in s) throw new Error('expected a full snapshot');
  return s;
}

describe('the Avalon link', () => {
  it("maps Jackdaw's avatars and options onto Avalon's", () => {
    // The server's tint ids are the kit's TINT_CHOICES, in the same order.
    expect(AVALON_TINT_ORDER).toEqual([...TINT_IDS]);
    expect(avalonAvatar({ crest: 'raven', tint: 'lagoon' })).toEqual({ icon: 'raven', tint: 14 });
    expect(avalonAvatar({ crest: 'jackdaw', tint: 'nope' })).toEqual({ icon: null, tint: 0 });
    expect(avalonSettings({ ...defaultOptions(), mode: 'full', talkTimer: 120 }, 'dark')).toEqual({
      mode: 'full',
      custom: { merlin: true, percival: true, morgana: true, mordred: false, oberon: false },
      lady: false,
      timers: { talk: 120, vote: 0 },
      theme: 'night',
    });
  });

  it('opens a seated Avalon room and sends each phone only its own seat', async () => {
    const { runtime, code, app } = await fiveAtTheTable();
    await runtime.post(code, tokenFor('Wren'), {
      type: 'setOptions',
      options: { ...defaultOptions(), mode: 'full', lady: true },
    });
    const started = await runtime.post(
      code,
      tokenFor('Wren'),
      { type: 'start', look: 'dark' },
      { origin: 'https://jackdaw.test' },
    );
    expect(started.status).toBe('in_game');

    const sent = app.rooms.get('ABCD')!.body;
    expect(sent.jackdawCode).toBe(code);
    expect(sent.returnUrl).toBe(`https://jackdaw.test/r/${code}`);
    expect(sent.hostId).toBe(started.hostId);
    expect(sent.players.map((p) => p.name)).toEqual(NAMES);
    expect(sent.players[0]!.avatar).toEqual({ icon: 'raven', tint: 14 });
    expect(sent.settings).toMatchObject({ mode: 'full', lady: true, theme: 'night' });

    // Every seat token is a password for one place at the table: only its owner may see it.
    const reads = await Promise.all([
      ...NAMES.map((n) => snap(runtime.poll(code, { token: tokenFor(n) }))),
      snap(runtime.poll(code, { displayId: 'tv-0001' })),
    ]);
    reads.forEach((s, i) => {
      const json = JSON.stringify(s);
      NAMES.forEach((other, j) => {
        if (i !== j) expect(json).not.toContain(`secret-token-${other}`);
      });
    });
    const wren = reads[0]!.view as AvalonPlayerView;
    expect(wren.seat).toEqual({ playerId: 'av0', token: 'secret-token-the owner' });
    expect(seatUrl(wren)).toBe(`${BASE}/j/ABCD#seat=av0.secret-token-the owner`);
    expect(reads[5]!.view).toBeUndefined();
    expect(tvUrl(reads[5]!.tableView as AvalonPlayerView)).toBe(`${BASE}/tv/ABCD`);
  });

  it('records the game when Avalon says it is over, with teams and roles, and leaks no seat', async () => {
    const { runtime, code, clock, app } = await fiveAtTheTable();
    const started = await runtime.post(code, tokenFor('Wren'), { type: 'start' });
    const ids = started.players.map((p) => p.id);
    const roles = ['merlin', 'servant', 'percival', 'assassin', 'minion'];
    app.setStatus({
      phase: 'over',
      over: true,
      endedEarly: false,
      winner: 'good',
      reason: 'Merlin survived the assassination.',
      players: ids.map((id, i) => ({
        id,
        side: i < 3 ? 'good' : 'evil',
        role: roles[i],
        won: i < 3,
      })),
    });
    clock.advance(5_000);
    const done = await snap(runtime.poll(code, { token: tokenFor('Bran') }));
    expect(done.status).toBe('results');
    expect(done.results?.summary).toBe('Good wins. Merlin survived the assassination.');
    expect(done.results?.winners).toEqual(ids.slice(0, 3));
    expect(done.history[0]?.standings?.[3]).toMatchObject({
      outcome: 'loss',
      team: 'Evil',
      role: 'Assassin',
    });
    expect(done.scores[ids[0]!]).toEqual({ wins: 1, losses: 0, played: 1 });

    const everything = JSON.stringify([done, await runtime.stats(code)]);
    expect(everything).not.toContain('secret-token-');
  });

  it("goes back to the lobby unscored when Avalon's host ends the game early", async () => {
    const { runtime, code, clock, app } = await fiveAtTheTable();
    await runtime.post(code, tokenFor('Wren'), { type: 'start' });
    app.setStatus({ phase: 'lobby', over: true, endedEarly: true });
    clock.advance(5_000);
    const back = await snap(runtime.poll(code, { token: tokenFor('Elin') }));
    expect(back.status).toBe('waiting');
    expect(back.historyCount).toBe(0);
  });

  it("keeps waiting while Avalon can't be reached, and shows Avalon's own error on Start", async () => {
    const { runtime, code, clock, app } = await fiveAtTheTable();
    app.failCreate({ status: 400, error: 'Avalon needs at least 5 players.' });
    await expect(runtime.post(code, tokenFor('Wren'), { type: 'start' })).rejects.toThrow(
      'Avalon needs at least 5 players.',
    );
    app.failCreate(null);
    await runtime.post(code, tokenFor('Wren'), { type: 'start' });
    app.setStatus({ error: 'boom' }, 500);
    clock.advance(5_000);
    const still = await snap(runtime.poll(code, { token: tokenFor('Wren') }));
    expect(still.status).toBe('in_game');
  });

  it('only seats players who were at the table', () => {
    expect(() =>
      avalon.setup({
        playerIds: ['a', 'b'],
        options: defaultOptions(),
        rng: { state: 1 } as never,
        now: 0,
        linked: {
          avalonCode: 'ABCD',
          avalonUrl: BASE,
          seats: { a: { playerId: 'x', token: 'y' } },
        },
      }),
    ).toThrow("Avalon didn't seat everyone.");
  });
});
