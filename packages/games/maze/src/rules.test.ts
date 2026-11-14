import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from './options';
import type { MazeOptions } from './options';
import {
  BELL_GRACE_MS,
  COUNTDOWN_MS,
  FUTURE_MS,
  INBOX_MAX,
  SHOW_MS,
  SOLO_BELL_MS,
  actionSchema,
  layoutOf,
  maze as game,
  powerIndexes,
  spotKind,
  tick as rawTick,
} from './rules';
import type { MazeState, MazeTick } from './rules';
import { decodeBits as decodeBitsOf, encodeBits, pelletIndex } from './sim/pellets';
import { POINTS } from './sim/powers';

const WREN = 'wren';
const ROOK = 'rook';
const FINCH = 'finch';
const T0 = 10_000;
/** Server time at round ms `t`. */
const at = (s: MazeState, t: number) => s.startAt + t;

function setup(ids: string[], options: Partial<MazeOptions> = {}, seed = 1): MazeState {
  const s = game.setup({
    playerIds: ids,
    options: { ...defaultOptions(ids.length), ...options },
    rng: createRng(seed),
    now: T0,
  });
  return game.onTimer!(s, 'countdown', createRng(2), s.startAt);
}

function size(s: MazeState, mazeNo: number): number {
  return pelletIndex(layoutOf(s, mazeNo)).size;
}

/** Bits for the first `k` pellets of a maze (or all). */
function bits(s: MazeState, mazeNo: number, k = Infinity): string {
  const n = size(s, mazeNo);
  const b = new Uint8Array(n);
  for (let i = 0; i < Math.min(k, n); i++) b[i] = 1;
  return encodeBits(b);
}

function tick(s: MazeState, id: string, patch: Partial<MazeTick> = {}): MazeTick {
  const p = s.players[id]!;
  return {
    type: 'tick',
    round: s.round,
    seq: p.seq + 1,
    t: p.lastT + 1000,
    maze: p.maze,
    pos: [1, 1, 'right'],
    turns: [],
    eaten: p.eaten,
    ghosts: p.facts.ghosts,
    caught: p.caught,
    fruit: p.facts.fruit,
    powers: p.facts.powers,
    lives: p.lives,
    ...patch,
  };
}

function act(s: MazeState, id: string, a: MazeTick, now = at(s, a.t)): MazeState {
  return game.applyAction(s, id, a, createRng(9), now);
}

/** Clears a player's current maze in one tick, far enough into it to be plausible. */
function clear(s: MazeState, id: string, extra: Partial<MazeTick> = {}): MazeState {
  const p = s.players[id]!;
  const t = Math.max(p.lastT, p.mazeAt) + 30_000;
  return act(s, id, tick(s, id, { t, eaten: bits(s, p.maze), powers: [], ...extra }));
}

describe('setup', () => {
  it('counts down, then plays', () => {
    const s0 = game.setup({
      playerIds: [WREN],
      options: defaultOptions(1),
      rng: createRng(1),
      now: T0,
    });
    expect(s0.phase).toBe('countdown');
    expect(game.nextTimer!(s0)).toEqual({ id: 'countdown', at: T0 + COUNTDOWN_MS });
    expect(setup([WREN]).phase).toBe('play');
  });

  it('picks a layout per maze, one for the Shared maze', () => {
    expect(setup([WREN], { mazes: 5 }).layouts).toHaveLength(5);
    expect(new Set(setup([WREN], { mazes: 4 }).layouts).size).toBe(4);
    expect(setup([WREN, ROOK], { mode: 'Shared' }).layouts).toHaveLength(1);
    expect(setup([WREN, ROOK], { mode: 'Shared' }).shared).not.toBeNull();
    expect(setup([WREN, ROOK], { mode: 'Race' }).shared).toBeNull();
  });
});

describe('stale and odd ticks (review focus 1)', () => {
  const s = act(setup([WREN, ROOK], { mode: 'Race' }), WREN, {
    ...tick(setup([WREN, ROOK], { mode: 'Race' }), WREN),
    eaten: bits(setup([WREN, ROOK], { mode: 'Race' }), 0, 5),
  });

  it('took the first tick', () => {
    expect(s.players[WREN]!.seq).toBe(1);
    expect(s.players[WREN]!.score).toBe(5 * POINTS.pellet);
  });

  it('ignores an old seq, another round, a wrong maze, the wrong phase and the future', () => {
    const base = tick(s, WREN, { eaten: bits(s, 0, 8) });
    for (const a of [
      { ...base, seq: 1 },
      { ...base, seq: 0 + 1 },
      { ...base, round: 2 },
      { ...base, maze: 1 },
      { ...base, t: 9_000 },
    ]) {
      expect(act(s, WREN, a, at(s, 3_000))).toBe(s);
    }
    const between = { ...s, phase: 'between' as const };
    expect(act(between, WREN, base)).toBe(between);
    expect(act(s, 'heron', base)).toBe(s);
  });

  it('a repeated tick changes nothing', () => {
    const a = tick(s, WREN, { eaten: bits(s, 0, 8) });
    const once = act(s, WREN, a);
    expect(act(once, WREN, a)).toBe(once);
  });

  it('ignores pellets coming in faster than a chomper can eat', () => {
    const fast = tick(s, WREN, { t: s.players[WREN]!.lastT + 100, eaten: bits(s, 0, 200) });
    expect(act(s, WREN, fast)).toBe(s);
  });

  it('never throws on random valid ticks', () => {
    const rng = createRng(42);
    let cur = setup([WREN, ROOK], { mode: 'Race' });
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const dirs = ['up', 'down', 'left', 'right', null] as const;
    for (let i = 0; i < 200; i++) {
      const id = rng.pick([WREN, ROOK]);
      const raw = {
        type: 'tick',
        round: 1 + rng.int(2),
        seq: 1 + rng.int(300),
        t: rng.int(200_000),
        maze: rng.int(5),
        pos: [rng.next() * 27, rng.next() * 24, rng.pick(dirs)],
        turns: Array.from({ length: rng.int(5) }, () => [
          rng.int(200_000),
          rng.int(27),
          rng.int(24),
          rng.pick(['up', 'down', 'left', 'right']),
        ]),
        eaten: Array.from({ length: rng.int(80) }, () => rng.pick([...chars])).join(''),
        ghosts: Array.from({ length: rng.int(6) }, () => [rng.int(200_000), rng.int(16)]),
        caught: rng.int(5),
        fruit: Array.from({ length: rng.int(4) }, () => rng.int(3)),
        powers: Array.from({ length: rng.int(5) }, () => [
          rng.int(200_000),
          rng.int(16),
          rng.pick(['hunt', 'jinx', 'steal', 'fog', 'freeze', 'dash']),
        ]),
        lives: rng.int(4),
      };
      const a = actionSchema.parse(raw);
      const now = cur.startAt + rng.int(200_000);
      cur = game.applyAction(cur, id, a, rng, now);
      for (const p of Object.values(cur.players)) expect(p.score).toBeGreaterThanOrEqual(0);
    }
  });

  it('near-valid ticks never throw; broken ones change nothing; most good ones count', () => {
    const rng = createRng(7);
    let accepted = 0;
    let good = 0;
    for (const mode of ['Solo', 'Race', 'Shared'] as const) {
      const ids = mode === 'Solo' ? [WREN] : [WREN, ROOK, FINCH];
      let cur = setup(ids, { mode });
      for (let i = 0; i < 150; i++) {
        if (cur.phase !== 'play') cur = setup(ids, { mode }, i + 2);
        const id = rng.pick(ids);
        const p = cur.players[id]!;
        if (p.done) continue;
        const n = size(cur, p.maze);
        const b = new Uint8Array(n);
        const had = decodeBitsOf(p.eaten, n);
        for (let k = 0; k < n; k++) b[k] = had[k]!;
        for (let k = 0; k < rng.int(6); k++) b[rng.int(n)] = 1;
        const t = Math.max(p.lastT, p.mazeAt) + 200 + rng.int(1500);
        const powers = [...p.facts.powers];
        if (rng.int(4) === 0) powers.push([t - 100, rng.int(4), 'hunt']);
        const ghosts = [...p.facts.ghosts];
        if (rng.int(4) === 0) ghosts.push([t - 50, rng.int(4)]);
        const caughtAt = [...p.facts.caughtAt];
        if (rng.int(8) === 0) caughtAt.push(t - 20);
        const a = tick(cur, id, {
          t,
          eaten: encodeBits(b),
          powers: powers.slice(-32),
          ghosts: ghosts.slice(-64),
          caught: p.caught + (caughtAt.length - p.facts.caughtAt.length),
          caughtAt: caughtAt.slice(-16),
          fruit: rng.int(10) === 0 ? [...p.facts.fruit, rng.int(3)] : p.facts.fruit,
          pos: [rng.int(27), rng.int(24), rng.pick(['up', 'down', 'left', 'right'] as const)],
          turns: [[t - 10, 1, 1, 'left']],
          lives: Math.max(0, p.lives - (rng.int(12) === 0 ? 1 : 0)),
        });
        expect(actionSchema.safeParse(a).success).toBe(true);
        const now = at(cur, t);
        const broken = rng.int(5) === 0;
        if (broken) {
          const bad = rng.pick([
            { ...a, seq: p.seq },
            { ...a, round: cur.round + 1 },
            { ...a, maze: p.maze + 1 },
            { ...a, t: t + FUTURE_MS + 5_000 },
          ]);
          expect(rawTick(cur, id, bad, now)).toBe(cur);
          continue;
        }
        good++;
        const next = rawTick(cur, id, a, now);
        if (next !== cur) accepted++;
        for (const q of Object.values(next.players)) expect(q.score).toBeGreaterThanOrEqual(0);
        cur = next;
      }
    }
    expect(accepted / good).toBeGreaterThan(0.8);
  });
});

describe('Solo', () => {
  it('keeps the union of eaten pellets', () => {
    let s = setup([WREN]);
    s = act(s, WREN, tick(s, WREN, { t: 5_000, eaten: bits(s, 0, 10) }));
    s = act(s, WREN, tick(s, WREN, { t: 6_000, eaten: bits(s, 0, 3) }));
    expect(s.players[WREN]!.eaten).toBe(bits(s, 0, 10));
    const spots = powerIndexes(layoutOf(s, 0));
    const plain = [...Array(10).keys()].filter((i) => !spots.has(i)).length;
    expect(s.players[WREN]!.score).toBe(plain * POINTS.pellet);
  });

  it('scores from facts: powers, ghost combos, fruit, catches', () => {
    let s = setup([WREN], { powerUps: 'Classic' });
    const kind = spotKind(layoutOf(s, 0), ['hunt'], 0, 1);
    expect(kind).toBe('hunt');
    const a = tick(s, WREN, {
      t: 9_000,
      powers: [[4_000, 0, 'dash']],
      ghosts: [
        [4_500, 0],
        [5_000, 1],
        [5_500, 2],
        [6_000, 3],
      ],
      fruit: [0, 1],
      caught: 1,
      lives: 2,
    });
    s = act(s, WREN, a);
    const p = s.players[WREN]!;
    expect(p.facts.powers).toEqual([[4_000, 0, 'hunt']]);
    expect(p.score).toBe(50 + 200 + 400 + 800 + 1600 + 100 + 300 - 200);
    expect(p.ghostsEaten).toBe(4);
    expect(p.lives).toBe(2);
    // A second Hunt starts the combo again.
    s = act(
      s,
      WREN,
      tick(s, WREN, {
        t: 20_000,
        powers: [...p.facts.powers, [15_000, 1, 'hunt']],
        ghosts: [...p.facts.ghosts, [16_000, 0]],
      }),
    );
    expect(s.players[WREN]!.score).toBe(p.score + 50 + 200);
  });

  it('lives only go down', () => {
    let s = setup([WREN]);
    s = act(s, WREN, tick(s, WREN, { lives: 2, caught: 1 }));
    s = act(s, WREN, tick(s, WREN, { lives: 3, caught: 0 }));
    expect(s.players[WREN]!.lives).toBe(2);
    expect(s.players[WREN]!.caught).toBe(1);
  });

  it('clearing a maze moves on to the next after a countdown', () => {
    let s = setup([WREN], { mazes: 3 });
    s = clear(s, WREN);
    const p = s.players[WREN]!;
    expect(p.maze).toBe(1);
    expect(p.mazeAt).toBe(30_000 + COUNTDOWN_MS);
    expect(p.eaten).toBe('');
    expect(p.cleared).toBe(1);
    expect(s.phase).toBe('play');
    const spots = powerIndexes(layoutOf(s, 0)).size;
    expect(p.score).toBe((size(s, 0) - spots) * POINTS.pellet + POINTS.mazeClear);
    // Ticks for the old maze no longer count.
    expect(act(s, WREN, tick(s, WREN, { maze: 0 }))).toEqual(s);
  });

  it('runs out of lives', () => {
    let s = setup([WREN]);
    s = act(s, WREN, tick(s, WREN, { lives: 0, caught: 3 }));
    expect(s.phase).toBe('between');
    expect(game.nextTimer!(s)).toEqual({ id: 'show', at: s.showBy });
    expect(game.getResult(s)).toBeNull();
    s = game.onTimer!(s, 'show', createRng(1), s.showBy!);
    expect(s.phase).toBe('over');
  });

  it('after the last maze the player wins, with standings and a recap', () => {
    let s = setup([WREN], { mazes: 2 });
    s = clear(s, WREN);
    s = clear(s, WREN);
    expect(s.phase).toBe('between');
    s = game.onTimer!(s, 'show', createRng(1), at(s, 80_000) + SHOW_MS);
    const r = game.getResult(s)!;
    expect(r.winners).toEqual([WREN]);
    expect(r.standings).toEqual([{ playerId: WREN, outcome: 'win' }]);
    expect(r.recap.some((e) => e.text.includes('cleared maze 2'))).toBe(true);
    expect(r.stats!.rows[0]!.values[1]).toBe(2);
  });
});

describe('Solo backstop and combos', () => {
  it('a stalled Solo game ends at the backstop bell', () => {
    let s = setup([WREN]);
    expect(s.endAt).toBe(s.startAt + SOLO_BELL_MS);
    expect(game.nextTimer!(s)).toEqual({ id: 'bell', at: s.endAt! + BELL_GRACE_MS });
    s = game.onTimer!(s, 'bell', createRng(1), s.endAt! + BELL_GRACE_MS);
    expect(s.phase).toBe('between');
  });

  it('a catch starts the ghost combo over, as the phone does', () => {
    let s = setup([WREN], { powerUps: 'Classic' });
    s = act(
      s,
      WREN,
      tick(s, WREN, {
        t: 9_000,
        powers: [[4_000, 0, 'hunt']],
        ghosts: [
          [4_500, 0],
          [5_000, 1],
          [6_000, 2],
        ],
        caught: 1,
        caughtAt: [5_500],
      }),
    );
    const g = POINTS.ghost;
    expect(s.players[WREN]!.score).toBe(POINTS.power + g[0] + g[1] + g[0] + POINTS.caught);
    // Repeating (or dropping) the catch list changes nothing.
    s = act(s, WREN, tick(s, WREN, { t: 10_000, caughtAt: [] }));
    expect(s.players[WREN]!.facts.caughtAt).toEqual([5_500]);
  });

  it('no players: no winners, no throw', () => {
    const s = { ...setup([WREN]), ids: [], players: {}, phase: 'over' as const };
    expect(game.getResult(s)!.winners).toEqual([]);
  });
});

describe('Race', () => {
  const race = (n = 2, mazes = 1) =>
    setup([WREN, ROOK, FINCH].slice(0, n), { mode: 'Race', mazes });

  it('the earliest reported finish gets the bonus; the winner is the top score', () => {
    let s = race(2, 1);
    // Rook racks up ghosts first.
    s = act(
      s,
      ROOK,
      tick(s, ROOK, {
        t: 5_000,
        ghosts: [
          [1_000, 0],
          [1_500, 1],
          [2_000, 2],
          [2_500, 3],
          [3_000, 0],
          [3_500, 1],
        ],
      }),
    );
    // Wren finishes; Rook reports an earlier finish within the grace.
    s = clear(s, WREN, { finishMs: 29_000 });
    expect(s.phase).toBe('play');
    expect(s.endAt).toBe(at(s, 30_000));
    const rookAt = s.endAt! + 500;
    s = act(s, ROOK, tick(s, ROOK, { t: 31_000, eaten: bits(s, 0), finishMs: 28_000 }), rookAt);
    expect(s.phase).toBe('between');
    const rook = s.players[ROOK]!;
    const wren = s.players[WREN]!;
    expect(rook.adjust).toBe(POINTS.raceFinish);
    expect(wren.adjust).toBe(0);
    s = game.onTimer!(s, 'show', createRng(1), s.showBy!);
    expect(game.getResult(s)!.winners).toEqual([ROOK]);
  });

  it('a finish time from before the last unfinished tick does not beat an honest one', () => {
    let s = race(2, 1);
    // Rook hasn't finished at 29.5 s; Wren honestly finished at 29 s.
    s = act(s, ROOK, tick(s, ROOK, { t: 29_500, eaten: bits(s, 0, size(s, 0) - 10) }));
    s = clear(s, WREN, { finishMs: 29_000 });
    s = act(s, ROOK, tick(s, ROOK, { t: 30_500, eaten: bits(s, 0), finishMs: 0 }), s.endAt! + 500);
    expect(s.players[ROOK]!.finishMs).toBe(29_500);
    expect(s.phase).toBe('between');
    expect(s.players[ROOK]!.finishMs).toBeGreaterThanOrEqual(s.players[ROOK]!.mazeAt);
    expect(s.players[WREN]!.adjust).toBe(POINTS.raceFinish);
    expect(s.players[ROOK]!.adjust).toBe(0);
  });

  it('a finish ends the round at the bell grace; the top score wins, not the finisher', () => {
    let s = race(2, 1);
    s = act(
      s,
      ROOK,
      tick(s, ROOK, {
        t: 20_000,
        eaten: bits(s, 0, 200),
        ghosts: [
          [1_000, 0],
          [1_500, 1],
          [2_000, 2],
          [2_500, 3],
        ],
        fruit: [0, 1, 2, 0, 1, 2],
      }),
    );
    s = clear(s, WREN);
    expect(game.nextTimer!(s)).toEqual({ id: 'bell', at: s.endAt! + BELL_GRACE_MS });
    s = game.onTimer!(s, 'bell', createRng(1), s.endAt! + BELL_GRACE_MS);
    expect(s.phase).toBe('between');
    expect(s.players[WREN]!.adjust).toBe(POINTS.raceFinish);
    expect(s.players[ROOK]!.score).toBeGreaterThan(s.players[WREN]!.score);
    s = game.onTimer!(s, 'show', createRng(1), s.showBy!);
    expect(game.getResult(s)!.winners).toEqual([ROOK]);
  });

  it('the bell ends it otherwise', () => {
    let s = race(2, 3);
    expect(s.endAt).toBe(T0 + COUNTDOWN_MS + 3 * 60_000);
    s = act(s, WREN, tick(s, WREN, { eaten: bits(s, 0, 10) }));
    s = game.onTimer!(s, 'bell', createRng(1), s.endAt! + BELL_GRACE_MS);
    expect(s.phase).toBe('between');
    s = game.onTimer!(s, 'show', createRng(1), s.showBy!);
    expect(game.getResult(s)!.winners).toEqual([WREN]);
  });

  it('eating a ghost jinxes the leader, or second place if you lead', () => {
    let s = race(3, 2);
    s = act(s, ROOK, tick(s, ROOK, { eaten: bits(s, 0, 20) }));
    s = act(s, FINCH, tick(s, FINCH, { eaten: bits(s, 0, 10) }));
    s = act(s, WREN, tick(s, WREN, { ghosts: [[500, 0]] }));
    expect(s.players[ROOK]!.inbox.map((a) => [a.kind, a.from])).toEqual([['jinx', WREN]]);
    expect(s.players[FINCH]!.inbox).toEqual([]);
    // Rook leads, so Rook's ghost goes to second place.
    s = act(s, ROOK, tick(s, ROOK, { ghosts: [[900, 1]] }));
    expect(s.players[ROOK]!.score).toBeGreaterThan(s.players[WREN]!.score);
    const second = s.players[WREN]!.score >= s.players[FINCH]!.score ? WREN : FINCH;
    expect(s.players[second]!.inbox.map((a) => a.kind)).toEqual(['jinx']);
    expect(game.getPlayerView(s, ROOK).inbox).toHaveLength(1);
  });

  it('clearing a maze fogs everyone else; inboxes hold at most three', () => {
    let s = race(3, 3);
    s = act(s, FINCH, tick(s, FINCH, { eaten: bits(s, 0, 20) }));
    s = act(
      s,
      ROOK,
      tick(s, ROOK, {
        t: 25_000,
        ghosts: [
          [100, 0],
          [200, 1],
          [300, 2],
          [400, 3],
          [500, 0],
        ],
      }),
    );
    s = clear(s, WREN);
    expect(s.players[ROOK]!.inbox.map((a) => a.kind)).toEqual(['fog']);
    expect(s.players[FINCH]!.inbox.map((a) => a.kind)).toEqual(['jinx', 'jinx', 'jinx']);
    expect(s.players[FINCH]!.inbox).toHaveLength(INBOX_MAX);
    expect(s.players[WREN]!.inbox).toEqual([]);
    expect(s.players[WREN]!.maze).toBe(1);
  });

  it('an attack leaves the inbox after a while', () => {
    let s = race(2, 2);
    s = act(s, WREN, tick(s, WREN, { ghosts: [[500, 0]] }));
    expect(s.players[ROOK]!.inbox).toHaveLength(1);
    s = act(s, ROOK, tick(s, ROOK, { t: 15_000 }));
    expect(s.players[ROOK]!.inbox).toEqual([]);
  });
});

describe('Shared maze', () => {
  it('records position and turns', () => {
    let s = setup([WREN, ROOK], { mode: 'Shared' });
    s = act(s, WREN, tick(s, WREN, { pos: [3, 1, 'left'], turns: [[800, 3, 1, 'left']] }));
    expect(s.players[WREN]!.pos).toEqual([3, 1, 'left']);
    expect(s.players[WREN]!.turns).toEqual([[800, 3, 1, 'left']]);
    expect(s.players[WREN]!.seq).toBe(1);
  });
});

describe('views', () => {
  it('the table view is public and carries mode and phase', () => {
    const s = setup([WREN, ROOK], { mode: 'Race' });
    const t = game.getTableView(s);
    expect(t.mode).toBe('Race');
    expect(t.phase).toBe('play');
    expect(t.players.map((p) => p.id)).toEqual([WREN, ROOK]);
    expect('inbox' in t.players[0]!).toBe(false);
    expect(game.getPlayerView(s, WREN)).toMatchObject({ me: WREN, inbox: [] });
    expect(game.waitingOn!(s)).toEqual([]);
  });

  it('the table view of eight players in the Shared maze stays small and public', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let s = setup(ids, { mode: 'Shared' });
    const turns: [number, number, number, 'left'][] = Array.from({ length: 40 }, (_, i) => [
      1000 + i * 300,
      3.5,
      7,
      'left',
    ]);
    s = {
      ...s,
      players: Object.fromEntries(
        ids.map((id) => [
          id,
          {
            ...s.players[id]!,
            turns,
            facts: {
              ghosts: Array.from({ length: 30 }, (_, i) => [i * 100, i % 4] as [number, number]),
              fruit: [],
              powers: [],
              caughtAt: [],
            },
          },
        ]),
      ),
    };
    const t = game.getTableView(s);
    for (const p of t.players) {
      expect('facts' in p).toBe(false);
      expect('banked' in p).toBe(false);
      expect('seq' in p).toBe(false);
    }
    expect(JSON.stringify(t).length).toBeLessThan(6000);
  });
});
