import { createRng } from '@jackdaw/engine';
import type { BotLevel } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from './options';
import type { MazeOptions } from './options';
import { actionSchema, layoutOf, maze as game } from './rules';
import type { MazeState, MazeTick } from './rules';
import { isWall } from './sim/layouts';

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

  it('stays quick three minutes into a round', () => {
    let s = start(IDS, { mode: 'Shared', minutes: 8 }, 9);
    const tick: MazeTick = {
      type: 'tick',
      round: 1,
      seq: 1,
      t: 180_000,
      maze: 0,
      pos: [9, 17, 'left'],
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
    expect(call(0)).not.toBeNull();
    for (let i = 0; i < 10; i++) call(i);
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) call(i);
    const per = (performance.now() - t0) / 20;
    console.log('bot call ms', per);
    expect(per).toBeLessThan(40);
  });
});
