import { z } from 'zod';
import {
  GameError,
  type GameLink,
  type GameModule,
  type LinkStartContext,
  type LinkStatus,
  type LobbySnapshot,
} from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { createRoomRuntime, type UnchangedSnapshot } from './runtime';
import { MemoryStorage } from './storage';

/** A game played "elsewhere": the state is just the other app's room and everyone's seat. */
interface FarState {
  room: string;
  seats: Record<string, string>;
}

const farGame: GameModule<FarState, never, { seat: string | null }, { room: string }, object> = {
  meta: {
    id: 'far',
    name: 'Far Game',
    tagline: 'Played in another app.',
    minPlayers: 2,
    maxPlayers: 6,
    category: 'social-deduction',
    minutes: [10, 20],
    complexity: 1,
  },
  linked: true,
  optionsSchema: z.object({}),
  actionSchema: z.never(),
  defaultOptions: () => ({}),
  setup: (ctx) => ctx.linked as FarState,
  getPlayerView: (s, id) => ({ seat: s.seats[id] ?? null }),
  getTableView: (s) => ({ room: s.room }),
  applyAction: () => {
    throw new GameError('NO_MOVES', 'Played elsewhere.');
  },
  getResult: () => null,
};

function fakeLink() {
  const calls: LinkStartContext<object>[] = [];
  let status: LinkStatus = { over: false };
  let checks = 0;
  let fail: string | null = null;
  const ended: FarState[] = [];
  const link: GameLink<FarState, object> = {
    async start(ctx) {
      calls.push(ctx);
      if (fail) throw new GameError('LINK_FAILED', fail);
      return {
        room: `ROOM${calls.length}`,
        seats: Object.fromEntries(ctx.players.map((p) => [p.id, `seat-of-${p.id}`])),
      };
    },
    async check() {
      checks++;
      return status;
    },
    async end(state) {
      ended.push(state);
      if (fail) throw new Error(fail);
    },
  };
  return {
    link: link as GameLink,
    calls,
    setStatus: (s: LinkStatus) => (status = s),
    failWith: (m: string | null) => (fail = m),
    checks: () => checks,
    ended,
  };
}

const TOKENS = { ana: 'token-ana-0123456789', ben: 'token-ben-0123456789' };

async function lobbyWithLink(opts: { withLink?: boolean } = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const fake = fakeLink();
  const runtime = createRoomRuntime({
    storage: new MemoryStorage(clock.now),
    games: { far: farGame },
    links: opts.withLink === false ? {} : { far: fake.link },
    now: clock.now,
    readCacheMs: 0,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  });
  const { code } = await runtime.create({ token: TOKENS.ana, name: 'Jay', gameId: 'far' });
  await runtime.post(code, TOKENS.ben, { type: 'join', name: 'Crow' });
  return { runtime, code, clock, fake };
}

async function snap(p: Promise<LobbySnapshot | UnchangedSnapshot>): Promise<LobbySnapshot> {
  const s = await p;
  if ('unchanged' in s) throw new Error('expected a full snapshot');
  return s;
}

describe('linked games', () => {
  it('opens the game in its app on Start, and each player sees only their own seat', async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    const started = await runtime.post(
      code,
      TOKENS.ana,
      { type: 'start', look: 'dark' },
      { origin: 'https://jackdaw.test' },
    );
    expect(started.status).toBe('in_game');
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.returnUrl).toBe(`https://jackdaw.test/r/${code}`);
    expect(call.look).toBe('dark');
    expect(call.players.map((p) => p.name)).toEqual(['Jay', 'Crow']);
    expect(call.hostId).toBe(started.hostId);

    const [ana, ben] = started.players;
    expect(started.view).toEqual({ seat: `seat-of-${ana!.id}` });
    expect(started.tableView).toEqual({ room: 'ROOM1' });
    const benView = await snap(runtime.poll(code, { token: TOKENS.ben }));
    expect(benView.view).toEqual({ seat: `seat-of-${ben!.id}` });
    // The TV gets the room but nobody's seat.
    const tv = await snap(runtime.poll(code, { displayId: 'tv-1234' }));
    expect(JSON.stringify(tv)).not.toContain('seat-of-');
  });

  it("refuses Start with a clear message when the game's link isn't configured", async () => {
    const { runtime, code } = await lobbyWithLink({ withLink: false });
    await expect(runtime.post(code, TOKENS.ana, { type: 'start' })).rejects.toThrow(
      "Far Game isn't set up on this server yet.",
    );
  });

  it("shows the other app's error and changes nothing when it can't open the game", async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    fake.failWith('Far Game needs at least 5 players.');
    await expect(runtime.post(code, TOKENS.ana, { type: 'start' })).rejects.toThrow(
      'Far Game needs at least 5 players.',
    );
    expect((await snap(runtime.poll(code, { token: TOKENS.ana }))).status).toBe('waiting');
  });

  it('only the host can start, and non-hosts never reach the other app', async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    await expect(runtime.post(code, TOKENS.ben, { type: 'start' })).rejects.toThrow(
      'Only the host can do that.',
    );
    expect(fake.calls).toHaveLength(0);
  });

  it('asks the app at most every few seconds and records the result when it is over', async () => {
    const { runtime, code, clock, fake } = await lobbyWithLink();
    const started = await runtime.post(code, TOKENS.ana, { type: 'start' });
    const [ana, ben] = started.players;

    await runtime.poll(code, { token: TOKENS.ana });
    await runtime.poll(code, { token: TOKENS.ben });
    expect(fake.checks()).toBe(1);
    clock.advance(5_000);
    await runtime.poll(code, { token: TOKENS.ana });
    expect(fake.checks()).toBe(2);

    fake.setStatus({
      over: true,
      result: {
        winners: [ben!.id],
        summary: 'Evil wins.',
        reveal: null,
        recap: [],
        standings: [
          { playerId: ana!.id, outcome: 'loss', team: 'Good', role: 'Merlin' },
          { playerId: ben!.id, outcome: 'win', team: 'Evil', role: 'Assassin' },
        ],
      },
    });
    clock.advance(5_000);
    const done = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(done.status).toBe('results');
    expect(done.results?.summary).toBe('Evil wins.');
    expect(done.scores[ben!.id]).toEqual({ wins: 1, losses: 0, played: 1 });
    expect(done.history[0]?.standings?.[0]).toMatchObject({ team: 'Good', role: 'Merlin' });

    // Play again opens a fresh room in the other app.
    const again = await runtime.post(code, TOKENS.ana, { type: 'playAgain' });
    expect(again.status).toBe('in_game');
    expect(again.tableView).toEqual({ room: 'ROOM2' });
  });

  it('goes back to the lobby with nothing scored when the game was abandoned there', async () => {
    const { runtime, code, clock, fake } = await lobbyWithLink();
    await runtime.post(code, TOKENS.ana, { type: 'start' });
    fake.setStatus({ over: true, abandoned: true });
    clock.advance(5_000);
    const back = await snap(runtime.poll(code, { token: TOKENS.ben }));
    expect(back.status).toBe('waiting');
    expect(back.history).toHaveLength(0);
    expect(back.scores).toEqual({});
  });

  it('ends the game in its app too when the host ends it here, even if that call fails', async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    await runtime.post(code, TOKENS.ana, { type: 'start' });
    const back = await runtime.post(code, TOKENS.ana, { type: 'endGame' });
    expect(back.status).toBe('waiting');
    expect(fake.ended.map((s) => s.room)).toEqual(['ROOM1']);

    await runtime.post(code, TOKENS.ana, { type: 'start' });
    fake.failWith('Far Game is down.');
    const again = await runtime.post(code, TOKENS.ana, { type: 'endGame' });
    expect(again.status).toBe('waiting');
    expect(again.history).toHaveLength(0);
    expect(fake.ended.map((s) => s.room)).toEqual(['ROOM1', 'ROOM2']);
  });

  it("refuses to seat the wrong table if someone joined while the app's room was being made", async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    const late = 'token-cy-01234567890';
    const original = fake.link.start.bind(fake.link);
    fake.link.start = async (ctx) => {
      const out = await original(ctx);
      await runtime.post(code, late, { type: 'join', name: 'Kite' });
      return out;
    };
    await expect(runtime.post(code, TOKENS.ana, { type: 'start' })).rejects.toThrow(
      'Press Start again',
    );
    expect((await snap(runtime.poll(code, { token: TOKENS.ana }))).status).toBe('waiting');
    // The room the other app opened for the refused Start is closed again.
    expect(fake.ended.map((s) => s.room)).toEqual(['ROOM1']);
  });

  it('closes the extra room when two Starts race and only one can begin', async () => {
    const { runtime, code, fake } = await lobbyWithLink();
    const outcomes = await Promise.allSettled([
      runtime.post(code, TOKENS.ana, { type: 'start' }),
      runtime.post(code, TOKENS.ana, { type: 'start' }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(fake.calls).toHaveLength(2);
    expect(fake.ended).toHaveLength(1);
    const s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(s.status).toBe('in_game');
    expect(fake.ended[0]!.room).not.toBe((s.tableView as { room: string }).room);
  });
});
