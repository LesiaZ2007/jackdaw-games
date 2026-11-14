import { createRng } from '@jackdaw/engine';
import type { BotLevel } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from './options';
import type { MazeOptions } from './options';
import { actionSchema, layoutOf, maze as game } from './rules';
import type { MazeState, MazeTick } from './rules';
import { isWall } from './sim/layouts';
import { ghostSeed, mazeBot } from './bot';
import { GhostSim } from './sim/ghosts';
import type { GhostView } from './sim/ghosts';

type Vec2 = [number, number];

const T0 = 10_000;
const IDS = ['wren', 'rook', 'finch', 'lark'];

function start(ids: string[], options: Partial<MazeOptions>, seed: number): MazeState {
  const s = game.setup({
    playerIds: ids,
    options: { ...defaultOptions(ids.length), ...options },
    rng: createRng(seed),
    now: T0,
  });
  return game.onTimer!(s, 'countdown', createRng(2), s.startAt);
}

interface Run {
  s: MazeState;
  ticks: number;
  walled: number;
  invalid: number;
}

/** Bots drive every id in `bots`; each round of calls moves the clock 900 ms. */
function play(s0: MazeState, bots: string[], level: BotLevel, rngSeed: number, maxMs: number): Run {
  let s = s0;
  const rng = createRng(rngSeed);
  const run: Run = { s, ticks: 0, walled: 0, invalid: 0 };
  let now = s.startAt;
  while (s.phase === 'play' && now - s.startAt < maxMs) {
    now += 900;
    for (const id of bots) {
      const a = game.bot!({
        playerId: id,
        playerIds: s.ids,
        view: game.getPlayerView(s, id),
        tableView: game.getTableView(s),
        rng,
        now,
        level,
      });
      if (!a) continue;
      if (!actionSchema.safeParse(a).success) run.invalid++;
      const m = layoutOf(s, a.maze);
      const [x, y] = a.pos;
      if (isWall(m, Math.round(x), Math.round(y))) run.walled++;
      run.ticks++;
      s = game.applyAction(s, id, a, rng, now);
    }
    if (s.endAt !== null && now >= s.endAt) s = game.onTimer!(s, 'bell', rng, now);
  }
  run.s = s;
  return run;
}

describe('mazeBot', () => {
  it('plays a Shared maze with a human and three bots', () => {
    const s = start(IDS, { mode: 'Shared', minutes: 2 }, 3);
    const run = play(s, IDS.slice(1), 'normal', 5, 2 * 60_000 + 5000);
    expect(run.invalid).toBe(0);
    expect(run.walled).toBe(0);
    expect(run.ticks).toBeGreaterThan(50);
    expect(run.s.phase).not.toBe('play');
    for (const id of IDS.slice(1)) expect(run.s.players[id]!.score).toBeGreaterThan(0);
  });

  for (const size of ['Small', 'Large'] as const) {
    it(`plays a ${size} Shared maze and a ${size} Race`, () => {
      const ids = size === 'Large' ? [...IDS, 'robin', 'jay'] : IDS;
      const s = start(ids, { mode: 'Shared', minutes: 2 }, 3);
      // Six players get the Large maze on Auto; Small has to be picked.
      const shared = size === 'Large' ? s : start(ids, { mode: 'Shared', minutes: 2, size }, 3);
      expect(layoutOf(shared, 0).size).toBe(size);
      const run = play(shared, ids.slice(1), 'normal', 5, 2 * 60_000 + 5000);
      expect(run.invalid).toBe(0);
      expect(run.walled).toBe(0);
      expect(run.s.phase).not.toBe('play');
      for (const id of ids.slice(1)) expect(run.s.players[id]!.score).toBeGreaterThan(0);

      const race = start(IDS.slice(0, 2), { mode: 'Race', mazes: 1, size }, 4);
      expect(layoutOf(race, 0).size).toBe(size);
      const r = play(race, IDS.slice(0, 2), 'hard', 6, 8 * 60_000);
      expect(r.invalid).toBe(0);
      expect(r.walled).toBe(0);
      expect(r.s.phase).not.toBe('play');
      expect(r.s.players.wren!.score).toBeGreaterThan(500);
    }, 60_000);
  }

  it('plays a Race of two bots to a finish', () => {
    const s = start(IDS.slice(0, 2), { mode: 'Race', mazes: 1 }, 4);
    const run = play(s, IDS.slice(0, 2), 'hard', 6, 6 * 60_000);
    expect(run.invalid).toBe(0);
    expect(run.walled).toBe(0);
    expect(run.s.phase).not.toBe('play');
    expect(run.s.players.wren!.score).toBeGreaterThan(500);
  });

  it('hard bots outscore easy bots on average', () => {
    let hard = 0;
    let easy = 0;
    for (let seed = 1; seed <= 5; seed++) {
      for (const lv of ['hard', 'easy'] as const) {
        const s = start(IDS, { mode: 'Shared', minutes: 2 }, seed);
        const r = play(s, IDS.slice(1), lv, seed, 2 * 60_000 + 5000);
        const total = IDS.slice(1).reduce((a, id) => a + r.s.players[id]!.score, 0);
        if (lv === 'hard') hard += total;
        else easy += total;
      }
    }
    expect(hard).toBeGreaterThan(easy);
  }, 120_000);

  it.each(['Medium', 'Large'] as const)('stays quick three minutes into a %s round', (size) => {
    let s = start(IDS, { mode: 'Shared', minutes: 8, size }, 9);
    const tick: MazeTick = {
      type: 'tick',
      round: 1,
      seq: 1,
      t: 180_000,
      maze: 0,
      // Rook's own start tile, which is open in every layout.
      pos: [...layoutOf(s, 0).starts[1]!],
      turns: [],
      eaten: '',
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    };
    s = game.applyAction(s, 'rook', tick, createRng(1), s.startAt + 180_000);
    const call = (i: number) =>
      game.bot!({
        playerId: 'rook',
        playerIds: s.ids,
        view: game.getPlayerView(s, 'rook'),
        tableView: game.getTableView(s),
        rng: createRng(i),
        now: s.startAt + 180_900,
        level: 'normal',
      });
    // The first call replays the ghosts from the maze start; later ones carry on from there.
    const c0 = performance.now();
    expect(call(0)).not.toBeNull();
    const cold = performance.now() - c0;
    for (let i = 0; i < 10; i++) call(i);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) call(i);
    const per = (performance.now() - t0) / 20;
    console.log(`bot call ms (${size}): first ${cold.toFixed(1)}, then ${per.toFixed(1)}`);
    expect(cold).toBeLessThan(150);
    expect(per).toBeLessThan(20);
  });
});

describe('mazeBot ghosts', () => {
  it.each(['Medium', 'Large'] as const)(
    'rebuilds exactly the phones’ ghosts from the full Shared history (%s)',
    (size) => {
      // Few enough bots that they don't clear the maze before two minutes are up.
      const ids = IDS.slice(0, size === 'Large' ? 3 : 2);
      let s = start(ids, { mode: 'Shared', minutes: 3, size }, 7);
      const rng = createRng(11);
      const seen: { t: number; ghosts: GhostView[]; eat?: { ghost: number; pos: Vec2 } }[] = [];
      let eats = 0;
      let now = s.startAt;
      while (s.phase === 'play' && now - s.startAt < 150_000) {
        now += 900;
        for (const id of ids.slice(1)) {
          const a = mazeBot(
            {
              playerId: id,
              playerIds: s.ids,
              view: game.getPlayerView(s, id),
              tableView: game.getTableView(s),
              rng,
              now,
              level: size === 'Large' ? 'normal' : 'easy',
            },
            {
              start: (t, ghosts) => seen.push({ t, ghosts }),
              eat: (t, ghost, pos, ghosts) => seen.push({ t, ghosts, eat: { ghost, pos } }),
            },
          );
          if (a) s = game.applyAction(s, id, a, rng, now);
        }
      }
      // A Medium maze is cleared by one bot in about 100 s; the Large one lasts past 2 minutes.
      expect(now - s.startAt).toBeGreaterThanOrEqual(size === 'Large' ? 120_000 : 90_000);
      // The table view still carries only the recent window.
      expect(game.getTableView(s)).not.toHaveProperty('history');
      expect(s.shared!.aims.length).toBeLessThan(s.history!.aims.length);
      expect(s.history!.aims.length).toBeGreaterThan(30);

      // A reference sim fed the full history, as a phone that saw everything would run it.
      const m = layoutOf(s, 0);
      const ref = new GhostSim(m, ghostSeed(s.seed, 0), 1);
      const input = { aims: s.history!.aims, events: s.history!.events };
      seen.sort((a, b) => a.t - b.t);
      for (const x of seen) {
        ref.stepTo(x.t, input);
        const want = ref.ghosts();
        expect(x.ghosts, `ghosts at ${x.t}`).toEqual(want);
        if (x.eat) {
          eats++;
          const g = want.find((v) => v.id === x.eat!.ghost)!;
          const dx = Math.abs(g.pos[0] - x.eat.pos[0]);
          expect(Math.min(dx, m.w - dx)).toBeLessThan(1);
          expect(Math.abs(g.pos[1] - x.eat.pos[1])).toBeLessThan(1);
        }
      }
      expect(seen.length).toBeGreaterThan(100);
      console.log(`${size}: ${seen.length} checks, ${eats} ghost eats`);
    },
    120_000,
  );

  it('Race bots read their own full turns from the player view', () => {
    const s0 = start(IDS.slice(0, 2), { mode: 'Race', mazes: 1 }, 4);
    const run = play(s0, IDS.slice(0, 2), 'hard', 6, 60_000);
    const view = game.getPlayerView(run.s, 'wren');
    const table = game.getTableView(run.s).players.find((p) => p.id === 'wren')!;
    expect(view.turns.length).toBeGreaterThan(table.turns.length);
    expect(view.turns.slice(-table.turns.length)).toEqual(table.turns);
    expect(view.history).toBeNull();
  });
});
