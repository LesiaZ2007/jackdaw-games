import { createRng, GameError, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { legalTurns, pointOf, startPosition, type Position, type Side } from './board';
import {
  BETWEEN_MS,
  SHOW_MS,
  backgammon as game,
  type BackgammonAction,
  type BackgammonOptions,
  type BackgammonState,
} from './rules';

const IVORY = 'wren';
const EBONY = 'rook';
const ID = [IVORY, EBONY] as const;

function setup(seed = 1, options: Partial<BackgammonOptions> = {}, now = 1_000) {
  return game.setup({
    playerIds: [IVORY, EBONY],
    options: { ...game.defaultOptions(2), ...options },
    rng: createRng(seed),
    now,
  });
}

/** An Rng that rolls these dice in order (then ones), and picks the first of any list. */
function scripted(...dice: number[]): Rng {
  const rest = [...dice];
  const rng = createRng(1);
  return {
    next: () => 0,
    int: () => (rest.shift() ?? 1) - 1,
    pick: (items) => items[0]!,
    shuffle: (items) => items.slice(),
    get state() {
      return rng.state;
    },
  };
}

function act(
  s: BackgammonState,
  id: string,
  action: BackgammonAction,
  rng: Rng = createRng(7),
  now = 5_000,
) {
  return game.applyAction(s, id, action, rng, now);
}

function mk(
  ivory: Record<number, number>,
  ebony: Record<number, number>,
  extra: { bar?: [number, number]; off?: [number, number] } = {},
): Position {
  const points = Array.from({ length: 24 }, () => 0);
  for (const [pip, n] of Object.entries(ivory)) points[pointOf(0, Number(pip)) - 1]! += n;
  for (const [pip, n] of Object.entries(ebony)) points[pointOf(1, Number(pip)) - 1]! -= n;
  return { points, bar: extra.bar ?? [0, 0], off: extra.off ?? [0, 0] };
}

/** A game waiting for `turn` to roll. */
function rolling(
  turn: Side,
  over: Partial<BackgammonState> = {},
  options: Partial<BackgammonOptions> = {},
) {
  return {
    ...setup(1, options),
    phase: 'roll',
    turn,
    dice: null,
    actBy: null,
    ...over,
  } as BackgammonState;
}

/** A game where `turn` is one move from bearing off its last checker. */
function finishing(
  turn: Side,
  loser: Record<number, number>,
  over: Partial<BackgammonState> = {},
  options: Partial<BackgammonOptions> = {},
) {
  // Key 0 of `loser` is how many the loser has borne off.
  const { 0: borne = 0, ...rest } = loser;
  const pos =
    turn === 0
      ? mk({ 1: 1 }, rest, { off: [14, borne] })
      : mk(rest, { 1: 1 }, { off: [borne, 14] });
  return {
    ...setup(1, options),
    phase: 'move',
    turn,
    dice: [3, 3],
    pos,
    ...over,
  } as BackgammonState;
}

function finish(s: BackgammonState, now = 5_000) {
  return act(s, ID[s.turn!], { type: 'move', steps: [{ from: 1, die: 3 }] }, createRng(3), now);
}

/** Ivory has one checker on the bar and Ebony holds its whole entry board. */
const SHUT: Position = mk(
  { 6: 1 },
  { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
  { bar: [1, 0], off: [14, 0] },
);

describe('setup', () => {
  it('opens game 1 with distinct dice and the higher side to move', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = setup(seed);
      expect(s.game).toBe(1);
      expect(s.phase).toBe('move');
      expect(s.players).toEqual([IVORY, EBONY]);
      const [a, b] = s.dice!;
      expect(a).not.toBe(b);
      expect(s.turn).toBe(a > b ? 0 : 1);
      expect(s.pos).toEqual(startPosition());
      expect(s.cube).toBe(1);
      expect(s.cubeOwner).toBeNull();
      expect(s.log[0]).toMatchObject({ kind: 'open', dice: [a, b], by: ID[s.turn!] });
    }
  });

  it('reads the options', () => {
    const s = setup(1, { matchTo: '7 points', cube: 'Off', turnTimer: '60 seconds' });
    expect(s.matchTo).toBe(7);
    expect(s.cubeOn).toBe(false);
    expect(s.turnSecs).toBe(60);
    expect(s.actBy).toBe(1_000 + 60_000);
  });

  it('needs exactly two players', () => {
    expect(game.validateOptions!(game.defaultOptions(2), 2)).toBeNull();
    expect(game.validateOptions!(game.defaultOptions(3), 3)).not.toBeNull();
  });
});

describe('a turn', () => {
  it('goes roll, move, then the other side to roll', () => {
    let s = setup();
    const first = s.turn!;
    const opening = legalTurns(s.pos, first, s.dice!)[0]!;
    s = act(s, ID[first], { type: 'move', steps: opening });
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(1 - first);
    expect(s.dice).toBeNull();
    expect(s.log[s.log.length - 1]).toMatchObject({ kind: 'move', side: first });

    s = act(s, ID[(1 - first) as 0 | 1], { type: 'roll' }, scripted(6, 2));
    expect(s.phase).toBe('move');
    expect(s.turn).toBe(1 - first);
    expect(s.dice).toEqual([6, 2]);

    const steps = legalTurns(s.pos, s.turn!, s.dice!)[0]!;
    s = act(s, ID[s.turn!], { type: 'move', steps });
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(first);
  });

  it('plays the opening roll as the first move', () => {
    const s = setup();
    const steps = legalTurns(s.pos, s.turn!, s.dice!)[0]!;
    const next = act(s, ID[s.turn!], { type: 'move', steps });
    expect(next.pos).not.toEqual(s.pos);
  });

  it('counts a hit', () => {
    const s: BackgammonState = {
      ...rolling(0),
      phase: 'move',
      dice: [3, 1],
      pos: mk({ 10: 1 }, { 18: 1, 24: 14 }, { off: [14, 0] }),
    };
    const next = act(s, IVORY, {
      type: 'move',
      steps: [
        { from: 10, die: 3 },
        { from: 7, die: 1 },
      ],
    });
    expect(next.pos.bar[1]).toBe(1);
    expect(next.tally.hits[0]).toBe(1);
  });

  it('throws GameError for illegal actions', () => {
    const s = setup();
    const turn = s.turn!;
    const mover = ID[turn];
    const idle = ID[(1 - turn) as 0 | 1];
    expect(() => act(s, idle, { type: 'move', steps: [{ from: 6, die: 1 }] })).toThrow(GameError);
    expect(() => act(s, mover, { type: 'roll' })).toThrow(GameError);
    expect(() => act(s, mover, { type: 'move', steps: [{ from: 1, die: s.dice![0] }] })).toThrow(
      GameError,
    );
    expect(() => act(s, mover, { type: 'move', steps: [{ from: 24, die: 5 }] })).toThrow(GameError);
    // Fewer dice than can be played.
    const partial = legalTurns(s.pos, turn, s.dice!)[0]!.slice(0, 1);
    expect(() => act(s, mover, { type: 'move', steps: partial })).toThrow(GameError);
    expect(() => act(s, 'magpie', { type: 'roll' })).toThrow(GameError);
    expect(() => act(s, mover, { type: 'next' })).toThrow(GameError);
    expect(() => act(s, mover, { type: 'take' })).toThrow(GameError);

    const r = rolling(0);
    expect(() => act(r, EBONY, { type: 'roll' })).toThrow(GameError);
    expect(() => act(r, IVORY, { type: 'move', steps: [{ from: 6, die: 1 }] })).toThrow(GameError);
  });

  it('passes a shut-out roll at once with a blocked entry', () => {
    const s = rolling(0, { pos: SHUT });
    const next = act(s, IVORY, { type: 'roll' }, scripted(2, 5));
    expect(next.phase).toBe('roll');
    expect(next.turn).toBe(1);
    expect(next.dice).toBeNull();
    expect(next.log[next.log.length - 1]).toMatchObject({ kind: 'blocked', side: 0, dice: [2, 5] });
    expect(game.announce!(s, next).join(' ')).toMatch(/cannot move/);
  });
});

describe('the doubling cube', () => {
  const options = { matchTo: '7 points' } as const;

  it('doubles only before rolling, then the other side takes and owns the cube', () => {
    let s = rolling(0, {}, options);
    expect(game.getTableView(s).canDouble).toBe(true);
    s = act(s, IVORY, { type: 'double' });
    expect(s.phase).toBe('double');
    expect(s.cube).toBe(1);
    expect(s.log[s.log.length - 1]).toMatchObject({ kind: 'double', cube: 2 });
    expect(game.waitingOn!(s)).toEqual([EBONY]);
    // Neither side can roll while the cube is out.
    expect(() => act(s, IVORY, { type: 'roll' })).toThrow(GameError);
    expect(() => act(s, EBONY, { type: 'roll' })).toThrow(GameError);

    s = act(s, EBONY, { type: 'take' });
    expect(s.cube).toBe(2);
    expect(s.cubeOwner).toBe(1);
    expect(s.phase).toBe('roll');
    expect(s.turn).toBe(0);
    expect(game.getTableView(s).cubeOwner).toBe(EBONY);
  });

  it('refuses a double in the move phase, off turn or by the side that does not own the cube', () => {
    const moving = setup(1, options);
    expect(() => act(moving, ID[moving.turn!], { type: 'double' })).toThrow(GameError);
    const r = rolling(0, {}, options);
    expect(() => act(r, EBONY, { type: 'double' })).toThrow(GameError);

    const owned = rolling(0, { cube: 2, cubeOwner: 1 }, options);
    expect(game.getTableView(owned).canDouble).toBe(false);
    expect(() => act(owned, IVORY, { type: 'double' })).toThrow(GameError);

    const mine = rolling(1, { cube: 2, cubeOwner: 1 }, options);
    const redoubled = act(mine, EBONY, { type: 'double' });
    expect(redoubled.log[redoubled.log.length - 1]).toMatchObject({ cube: 4 });
    const taken = act(redoubled, IVORY, { type: 'take' });
    expect(taken.cube).toBe(4);
    expect(taken.cubeOwner).toBe(0);
  });

  it('only the doubled side may answer', () => {
    const s = act(rolling(0, {}, options), IVORY, { type: 'double' });
    expect(() => act(s, IVORY, { type: 'take' })).toThrow(GameError);
    expect(() => act(s, IVORY, { type: 'drop' })).toThrow(GameError);
  });

  it('a drop ends the game at the current cube value', () => {
    const s = act(rolling(0, {}, options), IVORY, { type: 'double' });
    const next = act(s, EBONY, { type: 'drop' });
    expect(next.score).toEqual([1, 0]);
    expect(next.phase).toBe('between');
    expect(next.ends[0]).toMatchObject({
      winner: IVORY,
      kind: 1,
      cube: 1,
      points: 1,
      dropped: true,
    });

    const held = rolling(1, { cube: 2, cubeOwner: 1 }, options);
    const redoubled = act(held, EBONY, { type: 'double' });
    const dropped = act(redoubled, IVORY, { type: 'drop' });
    expect(dropped.score).toEqual([0, 2]);
    expect(dropped.ends[0]).toMatchObject({ winner: EBONY, points: 2 });
  });

  it('a drop can win the match', () => {
    const s = act(rolling(0, {}, { matchTo: '3 points' }), IVORY, { type: 'double' });
    const next = act(s, EBONY, { type: 'drop' });
    expect(next.phase).toBe('between');
    const held = rolling(0, { score: [2, 0], cube: 1 }, { matchTo: '3 points' });
    // At 2-0 in a 3 point match the leader would need no more than the cube, so no double.
    expect(game.getTableView(held).canDouble).toBe(false);
  });

  it('refuses doubles when the cube is Off', () => {
    const s = rolling(0, {}, { cube: 'Off' });
    expect(game.getTableView(s).canDouble).toBe(false);
    expect(() => act(s, IVORY, { type: 'double' })).toThrow(GameError);
  });
});

describe('scoring', () => {
  it('a single game scores the cube', () => {
    const next = finish(
      finishing(0, { 10: 14, 0: 1 }, { cube: 2, cubeOwner: 1 }, { matchTo: '7 points' }),
    );
    expect(next.score).toEqual([2, 0]);
    expect(next.ends[0]).toMatchObject({ winner: IVORY, kind: 1, cube: 2, points: 2 });
  });

  it('a gammon is doubled and a backgammon tripled, times the cube', () => {
    const gammon = finish(finishing(0, { 10: 15 }, {}, { matchTo: '7 points' }));
    expect(gammon.ends[0]).toMatchObject({ kind: 2, cube: 1, points: 2, dropped: false });
    expect(gammon.score).toEqual([2, 0]);

    const gammonCube = finish(finishing(0, { 10: 15 }, { cube: 2 }, { matchTo: '7 points' }));
    expect(gammonCube.score).toEqual([4, 0]);

    const back = finish(finishing(0, { 20: 1, 10: 14 }, { cube: 2 }, { matchTo: '7 points' }));
    expect(back.ends[0]).toMatchObject({ kind: 3, points: 6 });
    expect(back.score).toEqual([6, 0]);
    expect(back.phase).toBe('between');
  });

  it('a single is one point and credits Ebony when Ebony wins', () => {
    const s = finishing(1, { 10: 14 }, {}, { matchTo: '7 points' });
    const hit = { ...s, pos: { ...s.pos, off: [1, 14] as [number, number] } };
    const next = finish(hit);
    expect(next.ends[0]).toMatchObject({ winner: EBONY, kind: 1, points: 1 });
    expect(next.score).toEqual([0, 1]);
  });

  it('a bar checker makes a backgammon', () => {
    const s = finishing(0, { 10: 14 }, {}, { matchTo: '7 points' });
    const next = finish({ ...s, pos: { ...s.pos, bar: [0, 1] } });
    expect(next.ends[0]).toMatchObject({ kind: 3, points: 3 });
  });
});

describe('the match', () => {
  const win = () => finish(finishing(0, { 10: 14, 0: 1 }, {}, { matchTo: '1 point' }), 10_000);

  it('reaching the match length shows the winning move, then ends', () => {
    const s = win();
    expect(s.phase).toBe('show');
    expect(s.winner).toBe(0);
    expect(s.showBy).toBe(10_000 + SHOW_MS);
    expect(game.nextTimer!(s)).toEqual({ id: 'show', at: 10_000 + SHOW_MS });
    expect(game.getResult(s)).toBeNull();
    expect(game.waitingOn!(s)).toEqual([]);
    expect(() => act(s, IVORY, { type: 'next' })).toThrow(GameError);

    const over = game.onTimer!(s, 'show', createRng(1), 20_000);
    expect(over.phase).toBe('over');
    expect(game.nextTimer!(over)).toBeNull();
    expect(() => act(over, EBONY, { type: 'roll' })).toThrow(GameError);

    const result = game.getResult(over)!;
    expect(result.winners).toEqual([IVORY]);
    expect(result.standings).toEqual([
      { playerId: IVORY, outcome: 'win', team: 'Ivory' },
      { playerId: EBONY, outcome: 'loss', team: 'Ebony' },
    ]);
    expect(result.stats!.columns).toContain('Points');
    expect(result.stats!.rows.map((r) => r.playerId)).toEqual([IVORY, EBONY]);
    expect(result.stats!.rows[0]!.values[0]).toBe(1);
  });

  it('ignores a stray timer', () => {
    const s = win();
    expect(game.onTimer!(s, 'between', createRng(1), 20_000)).toBe(s);
    expect(game.onTimer!(s, 'move', createRng(1), 20_000)).toBe(s);
  });

  it('the same winner reported before the show ends is the partial result', () => {
    const p = game.partialResult!(win())!;
    expect(p.winners).toEqual([IVORY]);
  });
});

describe('between games', () => {
  const between = () => finish(finishing(0, { 10: 14, 0: 1 }, {}, { matchTo: '5 points' }), 10_000);

  it('waits, then the timer opens the next game', () => {
    const s = between();
    expect(s.phase).toBe('between');
    expect(s.score).toEqual([1, 0]);
    expect(s.showBy).toBe(10_000 + BETWEEN_MS);
    expect(game.nextTimer!(s)).toEqual({ id: 'between', at: 10_000 + BETWEEN_MS });
    expect(game.waitingOn!(s)).toEqual([]);

    const next = game.onTimer!(s, 'between', createRng(4), 20_000);
    expect(next.game).toBe(2);
    expect(next.phase).toBe('move');
    expect(next.pos).toEqual(startPosition());
    expect(next.cube).toBe(1);
    expect(next.cubeOwner).toBeNull();
    expect(next.score).toEqual([1, 0]);
    expect(next.dice![0]).not.toBe(next.dice![1]);
  });

  it('the next action starts it early, for either player', () => {
    for (const id of ID) {
      const next = act(between(), id, { type: 'next' });
      expect(next.game).toBe(2);
      expect(next.phase).toBe('move');
    }
  });

  it('keeps the earlier game in the results later', () => {
    const next = act(between(), IVORY, { type: 'next' });
    expect(next.ends).toHaveLength(1);
    expect(game.getTableView(next).lastEnd).toMatchObject({ game: 1, winner: IVORY });
  });
});

describe('the Crawford game', () => {
  it('is the game after a player first reaches matchTo - 1, with no doubling', () => {
    const s = finish(finishing(0, { 10: 14, 0: 1 }, { score: [2, 0] }, { matchTo: '3 points' }));
    expect(s.score).toEqual([3, 0]);
    expect(s.phase).toBe('show');

    const reach = finish(
      finishing(0, { 10: 14, 0: 1 }, { score: [1, 0] }, { matchTo: '3 points' }),
    );
    expect(reach.score).toEqual([2, 0]);
    expect(reach.crawford).toBe(true);
    expect(reach.crawfordUsed).toBe(true);

    const crawford = act(reach, IVORY, { type: 'next' });
    expect(crawford.crawford).toBe(true);
    expect(game.getTableView(crawford).crawford).toBe(true);
    const r: BackgammonState = { ...crawford, phase: 'roll', turn: 0, dice: null };
    expect(game.getTableView(r).canDouble).toBe(false);
    expect(() => act(r, IVORY, { type: 'double' })).toThrow(GameError);
    expect(game.announce!(null, crawford).join(' ')).toMatch(/Crawford/);

    // The Crawford game over, doubling returns.
    const after = finish(
      finishing(
        1,
        { 10: 14, 0: 1 },
        { score: [2, 0], crawford: true, crawfordUsed: true, game: 2 },
        { matchTo: '3 points' },
      ),
    );
    expect(after.score).toEqual([2, 1]);
    expect(after.crawford).toBe(false);
    const post = act(after, IVORY, { type: 'next' });
    expect(post.crawford).toBe(false);
  });

  it('happens only once per match', () => {
    const s = finishing(
      0,
      { 10: 14, 0: 1 },
      { score: [3, 0], crawfordUsed: true },
      { matchTo: '5 points' },
    );
    const next = finish(s);
    expect(next.score).toEqual([4, 0]);
    expect(next.crawford).toBe(false);

    const fresh = finish({ ...s, crawfordUsed: false });
    expect(fresh.crawford).toBe(true);
  });

  it('does not happen when the loser is also within a point, or with the cube Off', () => {
    const both = finish(finishing(0, { 10: 14, 0: 1 }, { score: [1, 2] }, { matchTo: '3 points' }));
    expect(both.crawford).toBe(false);
    const off = finish(
      finishing(0, { 10: 14, 0: 1 }, { score: [1, 0] }, { matchTo: '3 points', cube: 'Off' }),
    );
    expect(off.crawford).toBe(false);
  });
});

describe('turn timer', () => {
  const clock = { turnTimer: '30 seconds' } as const;

  it('sets a deadline each turn and none between games', () => {
    const s = setup(1, clock, 1_000);
    expect(s.actBy).toBe(31_000);
    expect(game.nextTimer!(s)).toEqual({ id: 'move', at: 31_000 });
    const next = act(
      s,
      ID[s.turn!],
      { type: 'move', steps: legalTurns(s.pos, s.turn!, s.dice!)[0]! },
      createRng(1),
      9_000,
    );
    expect(next.actBy).toBe(39_000);
    expect(game.nextTimer!(next)).toEqual({ id: 'roll', at: 39_000 });
  });

  it('plays a legal move for the player, flagged late', () => {
    const s = setup(1, clock);
    const next = game.onTimer!(s, 'move', createRng(2), 40_000);
    expect(next.phase).toBe('roll');
    expect(next.turn).toBe(1 - s.turn!);
    expect(next.pos).not.toEqual(s.pos);
    expect(next.log[next.log.length - 1]).toMatchObject({ kind: 'move', late: true });
  });

  it('rolls for the player', () => {
    const s = rolling(0, { actBy: 31_000 }, clock);
    const next = game.onTimer!(s, 'roll', scripted(4, 2), 40_000);
    expect(next.phase).toBe('move');
    expect(next.dice).toEqual([4, 2]);
    expect(next.turn).toBe(0);
  });

  it('flags a late roll that is then blocked', () => {
    const s = rolling(0, { pos: SHUT, actBy: 31_000 }, clock);
    const next = game.onTimer!(s, 'roll', scripted(3, 3), 40_000);
    expect(next.turn).toBe(1);
    expect(next.log[next.log.length - 1]).toMatchObject({ kind: 'blocked', late: true });
  });

  it('takes a cube that was offered', () => {
    const offered = act(rolling(0, {}, { ...clock, matchTo: '7 points' }), IVORY, {
      type: 'double',
    });
    expect(game.nextTimer!(offered)!.id).toBe('double');
    const next = game.onTimer!(offered, 'double', createRng(1), 50_000);
    expect(next.cube).toBe(2);
    expect(next.cubeOwner).toBe(1);
    expect(next.phase).toBe('roll');
    expect(next.turn).toBe(0);
  });

  it('ignores a timer that does not match the phase', () => {
    const s = setup(1, clock);
    expect(game.onTimer!(s, 'roll', createRng(1), 40_000)).toBe(s);
  });

  it('has no timer when the clock is Off', () => {
    const s = setup(1);
    expect(s.actBy).toBeNull();
    expect(game.nextTimer!(s)).toBeNull();
  });
});

describe('results while playing', () => {
  it('has no partial result before a game ends', () => {
    expect(game.partialResult!(setup())).toBeNull();
    expect(game.getResult(setup())).toBeNull();
  });

  it('names the leader after a game', () => {
    const s = finish(finishing(0, { 10: 14, 0: 1 }, {}, { matchTo: '5 points' }));
    const p = game.partialResult!(s)!;
    expect(p.winners).toEqual([IVORY]);
    expect(p.summary).toBe('Led 1–0.');
    expect(p.standings!.find((r) => r.playerId === EBONY)!.outcome).toBe('loss');
    expect(game.getResult(s)).toBeNull();
  });

  it('names Ebony when Ebony leads', () => {
    const s = finish(finishing(1, { 10: 14, 0: 1 }, {}, { matchTo: '5 points' }));
    expect(game.partialResult!(s)!.winners).toEqual([EBONY]);
  });

  it('calls a level score level, with both as winners', () => {
    const s = finish(finishing(1, { 10: 14, 0: 1 }, { score: [1, 0] }, { matchTo: '5 points' }));
    const p = game.partialResult!(s)!;
    expect(p.winners).toEqual([IVORY, EBONY]);
    expect(p.standings!.every((r) => r.outcome === 'draw')).toBe(true);
  });
});

describe('waitingOn', () => {
  it('names whoever must act', () => {
    const s = setup();
    expect(game.waitingOn!(s)).toEqual([ID[s.turn!]]);
    const r = rolling(1);
    expect(game.waitingOn!(r)).toEqual([EBONY]);
    expect(game.getTableView(r).toAct).toBe(EBONY);
    const offered: BackgammonState = { ...r, phase: 'double' };
    expect(game.waitingOn!(offered)).toEqual([IVORY]);
  });
});

describe('announce', () => {
  it('says how a game opens', () => {
    const s = setup();
    const lines = game.announce!(null, s);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`{${ID[s.turn!]}} opens with`);
  });

  it('says doubles, takes and game ends once', () => {
    const r = rolling(0, {}, { matchTo: '7 points' });
    const doubled = act(r, IVORY, { type: 'double' });
    expect(game.announce!(r, doubled)).toEqual([`{${IVORY}} doubles to 2.`]);
    const taken = act(doubled, EBONY, { type: 'take' });
    expect(game.announce!(doubled, taken)).toEqual([`{${EBONY}} takes. The cube is on 2.`]);
    const dropped = act(doubled, EBONY, { type: 'drop' });
    const lines = game.announce!(doubled, dropped);
    expect(
      lines.some((l) => l.includes(`{${IVORY}} wins game 1, on a dropped cube, for 1 point. 1–0.`)),
    ).toBe(true);
    expect(game.announce!(dropped, dropped)).toEqual([]);

    const end = finish(finishing(0, { 10: 15 }, {}, { matchTo: '7 points' }));
    expect(game.announce!(null, end).join(' ')).toMatch(/wins game 1, a gammon, for 2 points/);
  });
});

describe('views', () => {
  function states(): BackgammonState[] {
    const open = setup();
    const doubled = act(rolling(0, {}, { matchTo: '7 points' }), IVORY, { type: 'double' });
    const ended = finish(finishing(0, { 10: 15 }, {}, { matchTo: '1 point' }));
    return [open, doubled, ended, game.onTimer!(ended, 'show', createRng(1), 9_000)];
  }

  it('a player view is the table view plus me and side', () => {
    for (const s of states()) {
      expect(game.getPlayerView(s, IVORY)).toEqual({ ...game.getTableView(s), me: IVORY, side: 0 });
      expect(game.getPlayerView(s, EBONY)).toEqual({ ...game.getTableView(s), me: EBONY, side: 1 });
      expect(game.getPlayerView(s, 'magpie')).toEqual({
        ...game.getTableView(s),
        me: 'magpie',
        side: null,
      });
    }
  });

  it('leaks no state-only fields', () => {
    const hidden = ['recap', 'tally', 'crawfordUsed', 'ends', 'turnSecs', 'crawfordNext'];
    for (const s of states()) {
      for (const view of [
        game.getTableView(s),
        game.getPlayerView(s, IVORY),
        game.getPlayerView(s, 'magpie'),
      ]) {
        const text = JSON.stringify(view);
        for (const key of hidden) expect(text, key).not.toContain(`"${key}"`);
        expect(Object.keys(view)).not.toContain('recap');
        expect(Object.keys(view)).not.toContain('tally');
      }
    }
  });

  it('reports pips and the game state', () => {
    const view = game.getTableView(setup());
    expect(view.pips).toEqual([167, 167]);
    expect(view.matchTo).toBe(3);
    expect(view.score).toEqual([0, 0]);
    expect(view.game).toBe(1);
    expect(view.winner).toBeNull();
    expect(view.last?.kind).toBe('open');
  });

  it('keeps only the latest log lines', () => {
    let s = setup();
    for (let i = 0; i < 40; i++) {
      s = { ...s, phase: 'roll', turn: 0, dice: null, pos: SHUT };
      s = act(s, IVORY, { type: 'roll' }, scripted(2, 2));
    }
    expect(game.getTableView(s).log.length).toBeLessThanOrEqual(12);
    expect(s.log.length).toBeLessThanOrEqual(12);
  });
});
