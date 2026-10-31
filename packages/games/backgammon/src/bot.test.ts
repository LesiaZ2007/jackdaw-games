import { BOT_LEVELS, createRng, type BotLevel } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { pipCount, playTurn, pointOf, startPosition, type Position, type Side } from './board';
import {
  backgammon as game,
  type BackgammonAction,
  type BackgammonOptions,
  type BackgammonPlayerView,
  type BackgammonState,
  type Phase,
} from './rules';

/** A position from checkers listed by each side's own pips. */
function board(
  ivory: Record<number, number>,
  ebony: Record<number, number>,
  extra: { bar?: [number, number]; off?: [number, number] } = {},
): Position {
  const points = Array.from({ length: 24 }, () => 0);
  for (const [pip, n] of Object.entries(ivory)) points[pointOf(0, Number(pip)) - 1]! += n;
  for (const [pip, n] of Object.entries(ebony)) points[pointOf(1, Number(pip)) - 1]! -= n;
  return { points, bar: extra.bar ?? [0, 0], off: extra.off ?? [0, 0] };
}

function ask(
  pos: Position,
  side: Side,
  phase: Phase,
  opts: { dice?: [number, number]; canDouble?: boolean; level?: BotLevel; seed?: number } = {},
): BackgammonAction | null {
  const players: [string, string] = ['wren', 'rook'];
  const me = players[side];
  const live = phase === 'double' || phase === 'roll' || phase === 'move';
  const view = {
    players,
    matchTo: 5,
    cubeOn: true,
    game: 1,
    score: [0, 0],
    pos,
    phase,
    toAct: live ? me : null,
    turn: phase === 'double' ? 1 - side : side,
    dice: opts.dice ?? null,
    cube: 1,
    cubeOwner: null,
    crawford: false,
    canDouble: opts.canDouble ?? false,
    pips: [pipCount(pos, 0), pipCount(pos, 1)],
    last: null,
    log: [],
    lastEnd: null,
    actBy: null,
    showBy: null,
    winner: null,
    me,
    side,
  } as unknown as BackgammonPlayerView;
  return game.bot!({
    playerId: me,
    playerIds: players,
    view,
    tableView: view,
    rng: createRng(opts.seed ?? 1),
    now: 0,
    level: opts.level ?? 'hard',
  });
}

function played(pos: Position, side: Side, dice: [number, number], a: BackgammonAction | null) {
  expect(a?.type).toBe('move');
  if (a?.type !== 'move') throw new Error('no move');
  const r = playTurn(pos, side, dice, a.steps);
  expect(typeof r).not.toBe('string');
  if (typeof r === 'string') throw new Error(r);
  return r.pos;
}

describe('Backgammon bot moves', () => {
  it('plays only legal turns, at every level', () => {
    const positions: [Position, Side][] = [
      [startPosition(), 0],
      [startPosition(), 1],
      [board({ 10: 1, 8: 2, 6: 3, 13: 2 }, { 21: 1, 12: 3, 6: 2 }, { bar: [1, 0] }), 0],
      [board({ 6: 5, 5: 5, 3: 2 }, { 6: 5, 5: 5, 4: 5 }), 0],
      [board({ 6: 2, 2: 2 }, { 6: 2 }, { off: [11, 13] }), 0],
    ];
    for (const level of BOT_LEVELS) {
      for (const [pos, side] of positions) {
        for (let seed = 1; seed <= 12; seed++) {
          const dice: [number, number] = [(seed % 6) + 1, ((seed * 5) % 6) + 1];
          const a = ask(pos, side, 'move', { dice, level, seed });
          if (a === null) continue;
          played(pos, side, dice, a);
        }
      }
    }
  });

  it('hits a blot when it can', () => {
    const pos = board({ 13: 2, 10: 1, 8: 2, 6: 4 }, { 21: 1, 12: 3, 6: 2, 1: 2 });
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const after = played(pos, 0, [6, 1], ask(pos, 0, 'move', { dice: [6, 1], seed }));
      if (after.bar[1] === 1) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(18);
  });

  it('makes its 5 point with a 3-1 on the opening roll', () => {
    const pos = startPosition();
    let made = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const after = played(pos, 0, [3, 1], ask(pos, 0, 'move', { dice: [3, 1], seed }));
      if (after.points[4]! >= 2) made++;
    }
    expect(made).toBeGreaterThanOrEqual(18);
  });

  it('covers a blot rather than leaving it to be hit', () => {
    const pos = board({ 13: 2, 8: 3, 6: 3, 5: 1, 24: 2 }, { 24: 2, 13: 5, 8: 3, 6: 5 });
    let covered = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const after = played(pos, 0, [3, 1], ask(pos, 0, 'move', { dice: [3, 1], seed }));
      if (after.points[4]! >= 2) covered++;
    }
    expect(covered).toBeGreaterThanOrEqual(18);
  });

  it('bears off in a race', () => {
    const pos = board({ 6: 3, 4: 2, 2: 2 }, { 6: 3, 5: 3, 4: 3 });
    const after = played(pos, 0, [6, 4], ask(pos, 0, 'move', { dice: [6, 4], seed: 3 }));
    expect(after.off[0]).toBe(2);
  });

  it('does nothing when the game is not waiting on it', () => {
    const pos = startPosition();
    expect(ask(pos, 0, 'between')).toBeNull();
    expect(ask(pos, 0, 'show')).toBeNull();
    expect(ask(pos, 0, 'over')).toBeNull();
  });
});

describe('Backgammon bot cube', () => {
  const ahead = board({ 6: 5, 5: 5, 4: 5 }, { 10: 3, 6: 5, 5: 4, 4: 3 });
  const level = board({ 6: 5, 5: 5, 4: 5 }, { 6: 5, 5: 5, 4: 5 });

  it('doubles a clear race lead, never on Easy, and rolls otherwise', () => {
    expect(ask(ahead, 0, 'roll', { canDouble: true })).toEqual({ type: 'double' });
    expect(ask(ahead, 0, 'roll', { canDouble: true, level: 'easy' })).toEqual({ type: 'roll' });
    expect(ask(ahead, 0, 'roll', { canDouble: false })).toEqual({ type: 'roll' });
    expect(ask(level, 0, 'roll', { canDouble: true })).toEqual({ type: 'roll' });
    expect(ask(startPosition(), 0, 'roll', { canDouble: true })).toEqual({ type: 'roll' });
  });

  it('takes a close race and drops a lost one', () => {
    expect(ask(level, 0, 'double')).toEqual({ type: 'take' });
    expect(ask(ahead, 1, 'double')).toEqual({ type: 'drop' });
    expect(ask(startPosition(), 1, 'double')).toEqual({ type: 'take' });
  });

  it('drops with checkers on the bar against a closed board', () => {
    const pos = board(
      { 13: 3, 10: 2 },
      { 6: 3, 5: 2, 4: 2, 3: 2, 2: 2, 1: 2, 13: 2 },
      { bar: [3, 0] },
    );
    expect(ask(pos, 0, 'double')).toEqual({ type: 'drop' });
  });
});

/** A whole match with a bot in each seat, timers fired the way the platform would. */
function playOut(options: BackgammonOptions, level: BotLevel, seed: number) {
  let now = 1_000;
  let s: BackgammonState = game.setup({
    playerIds: ['wren', 'rook'],
    options,
    rng: createRng(seed),
    now,
  });
  let steps = 0;
  while (s.phase !== 'over') {
    if (++steps > 6_000) throw new Error(`no finish (seed ${seed}, ${s.phase})`);
    now += 1_000;
    let acted = false;
    for (const id of game.waitingOn!(s)) {
      const action = game.bot!({
        playerId: id,
        playerIds: s.players,
        view: game.getPlayerView(s, id),
        tableView: game.getTableView(s),
        rng: createRng(seed * 7919 + steps),
        now,
        level,
      });
      if (!action) continue;
      const next = game.applyAction(s, id, action, createRng(steps), now);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (acted) continue;
    const timer = game.nextTimer!(s);
    if (!timer) throw new Error(`bots stuck in ${s.phase} (seed ${seed})`);
    now = Math.max(now, timer.at);
    const next = game.onTimer!(s, timer.id, createRng(steps), now);
    if (next === s) throw new Error(`timer did nothing in ${s.phase}`);
    s = next;
  }
  return s;
}

describe('Backgammon all-bot matches', () => {
  for (const cube of ['On', 'Off'] as const) {
    for (const level of BOT_LEVELS) {
      it(`finishes: ${level}, cube ${cube}`, () => {
        for (let seed = 1; seed <= 3; seed++) {
          const s = playOut({ matchTo: '3 points', cube, turnTimer: 'Off' }, level, seed);
          const result = game.getResult(s);
          expect(result).not.toBeNull();
          expect(result?.winners).toHaveLength(1);
          expect(s.winner).not.toBeNull();
          expect(Math.max(...s.score)).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});
