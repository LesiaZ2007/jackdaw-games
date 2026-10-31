import { describe, expect, it } from 'vitest';
import {
  BAR,
  allHome,
  at,
  canStep,
  legalTurns,
  diceLeft,
  mostDice,
  nextSteps,
  pipCount,
  playStep,
  playTurn,
  pointOf,
  startPosition,
  winKind,
  type Position,
  type Side,
} from './board';

/** A position from each side's own pips: `{ 6: 5 }` is five checkers on that side's 6 point. */
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

function count(pos: Position, side: Side): number {
  let n = pos.bar[side] + pos.off[side];
  for (let pip = 1; pip <= 24; pip++) n += Math.max(0, at(pos, side, pip));
  return n;
}

describe('start position', () => {
  it('has fifteen checkers each', () => {
    const pos = startPosition();
    expect(count(pos, 0)).toBe(15);
    expect(count(pos, 1)).toBe(15);
    expect(pos.bar).toEqual([0, 0]);
    expect(pos.off).toEqual([0, 0]);
  });

  it('lays each side out the same way from its own end', () => {
    const pos = startPosition();
    for (const side of [0, 1] as Side[]) {
      expect(at(pos, side, 24)).toBe(2);
      expect(at(pos, side, 13)).toBe(5);
      expect(at(pos, side, 8)).toBe(3);
      expect(at(pos, side, 6)).toBe(5);
    }
  });

  it('counts 167 pips for each side', () => {
    const pos = startPosition();
    expect(pipCount(pos, 0)).toBe(167);
    expect(pipCount(pos, 1)).toBe(167);
  });

  it('counts the bar as 25 pips', () => {
    expect(pipCount(mk({ 3: 1 }, {}, { bar: [2, 0] }), 0)).toBe(53);
  });
});

describe('entering from the bar', () => {
  it('enters on an open point', () => {
    const pos = mk({ 6: 1 }, {}, { bar: [1, 0] });
    expect(canStep(pos, 0, BAR, 3)).toBe(true);
    const r = playStep(pos, 0, { from: BAR, die: 3 });
    expect(r.pos.bar[0]).toBe(0);
    expect(at(r.pos, 0, 22)).toBe(1);
    expect(r.played).toEqual({ from: BAR, to: 22, die: 3, hit: false });
  });

  it('is blocked by two or more opposing checkers, but not by a blot', () => {
    // Ivory enters with a 3 on its 22 point, which is Ebony's pip 3.
    expect(canStep(mk({}, { 3: 2 }, { bar: [1, 0] }), 0, BAR, 3)).toBe(false);
    expect(canStep(mk({}, { 3: 5 }, { bar: [1, 0] }), 0, BAR, 3)).toBe(false);
    expect(canStep(mk({}, { 3: 1 }, { bar: [1, 0] }), 0, BAR, 3)).toBe(true);
  });

  it('must enter before any other move', () => {
    const pos = mk({ 6: 1 }, {}, { bar: [1, 0] });
    expect(canStep(pos, 0, 6, 2)).toBe(false);
    expect(playTurn(pos, 0, [3, 2], [{ from: 6, die: 2 }])).toBe('Enter from the bar first.');
    const ok = playTurn(
      pos,
      0,
      [3, 2],
      [
        { from: BAR, die: 3 },
        { from: 6, die: 2 },
      ],
    );
    expect(typeof ok).not.toBe('string');
  });

  it('works the same for Ebony, entering on the other end', () => {
    const pos = mk({}, { 6: 1 }, { bar: [0, 1] });
    const r = playStep(pos, 1, { from: BAR, die: 4 });
    expect(at(r.pos, 1, 21)).toBe(1);
    expect(r.pos.points[pointOf(1, 21) - 1]).toBe(-1);
  });
});

describe('hitting', () => {
  it('sends a blot to the bar', () => {
    // Ivory 10 to its 7 point; Ebony's blot there is Ebony's pip 18.
    const pos = mk({ 10: 1 }, { 18: 1 });
    expect(canStep(pos, 0, 10, 3)).toBe(true);
    const r = playStep(pos, 0, { from: 10, die: 3 });
    expect(r.played.hit).toBe(true);
    expect(r.pos.bar[1]).toBe(1);
    expect(at(r.pos, 0, 7)).toBe(1);
  });

  it('cannot land on two opposing checkers', () => {
    expect(canStep(mk({ 10: 1 }, { 18: 2 }), 0, 10, 3)).toBe(false);
  });

  it('does not mutate the position it was given', () => {
    const pos = mk({ 10: 1 }, { 18: 1 });
    const before = JSON.stringify(pos);
    playStep(pos, 0, { from: 10, die: 3 });
    expect(JSON.stringify(pos)).toBe(before);
  });
});

describe('bearing off', () => {
  it('takes a checker off with the exact die', () => {
    const pos = mk({ 6: 1, 3: 1 }, {});
    expect(allHome(pos, 0)).toBe(true);
    expect(canStep(pos, 0, 3, 3)).toBe(true);
    const r = playStep(pos, 0, { from: 3, die: 3 });
    expect(r.pos.off[0]).toBe(1);
    expect(r.played).toEqual({ from: 3, to: 0, die: 3, hit: false });
  });

  it('allows a larger die only from the highest point', () => {
    const pos = mk({ 5: 1, 2: 1 }, {});
    expect(canStep(pos, 0, 5, 6)).toBe(true);
    expect(canStep(pos, 0, 2, 6)).toBe(false);
    expect(canStep(pos, 0, 2, 4)).toBe(false);
    // With nothing above the 2 point, the 2 may use a bigger die.
    expect(canStep(mk({ 2: 1 }, {}), 0, 2, 6)).toBe(true);
  });

  it('does not allow bearing off while a checker is outside home', () => {
    const pos = mk({ 8: 1, 2: 1 }, {});
    expect(allHome(pos, 0)).toBe(false);
    expect(canStep(pos, 0, 2, 2)).toBe(false);
    expect(canStep(pos, 0, 2, 6)).toBe(false);
  });

  it('does not allow bearing off with a checker on the bar', () => {
    const pos = mk({ 2: 1 }, {}, { bar: [1, 0] });
    expect(allHome(pos, 0)).toBe(false);
    expect(canStep(pos, 0, 2, 2)).toBe(false);
  });

  it('works for Ebony in its own pips', () => {
    const pos = mk({}, { 4: 1, 1: 1 });
    expect(canStep(pos, 1, 4, 4)).toBe(true);
    expect(canStep(pos, 1, 1, 6)).toBe(false);
    expect(canStep(pos, 1, 4, 6)).toBe(true);
  });
});

describe('playing the dice', () => {
  it('must play both dice when it can', () => {
    const pos = startPosition();
    const turns = legalTurns(pos, 0, [3, 1]);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((t) => t.length === 2)).toBe(true);
    expect(mostDice(pos, 0, [3, 1])).toBe(2);
    expect(playTurn(pos, 0, [3, 1], [{ from: 8, die: 3 }])).toBe('Play one more die.');
  });

  it('must play the larger die when only one can be played', () => {
    // One checker on the 8 point; the 4 point is blocked. Either die alone plays, never both.
    const pos = mk({ 8: 1 }, { 21: 2 });
    expect(canStep(pos, 0, 8, 1)).toBe(true);
    expect(canStep(pos, 0, 8, 3)).toBe(true);
    expect(mostDice(pos, 0, [3, 1])).toBe(1);
    expect(legalTurns(pos, 0, [3, 1])).toEqual([[{ from: 8, die: 3 }]]);
    expect(playTurn(pos, 0, [3, 1], [{ from: 8, die: 1 }])).toBe(
      'Only one die can be played, so it must be the 3.',
    );
    expect(typeof playTurn(pos, 0, [3, 1], [{ from: 8, die: 3 }])).not.toBe('string');
  });

  it('plays four of a doublet', () => {
    const pos = startPosition();
    const turns = legalTurns(pos, 0, [2, 2]);
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((t) => t.length === 4 && t.every((s) => s.die === 2))).toBe(true);
    expect(mostDice(pos, 0, [2, 2])).toBe(4);
    const r = playTurn(pos, 0, [2, 2], turns[0]!);
    expect(typeof r).not.toBe('string');
    if (typeof r !== 'string') expect(r.played).toHaveLength(4);
  });

  it('plays fewer than four of a doublet when it runs out of moves', () => {
    const pos = mk({ 2: 1 }, {});
    expect(mostDice(pos, 0, [3, 3])).toBe(1);
    expect(legalTurns(pos, 0, [3, 3])).toEqual([[{ from: 2, die: 3 }]]);
  });

  it('refuses a die that is not left to play', () => {
    const pos = startPosition();
    expect(playTurn(pos, 0, [3, 1], [{ from: 8, die: 5 }])).toBe('There is no 5 left to play.');
    expect(
      playTurn(
        pos,
        0,
        [3, 1],
        [
          { from: 8, die: 3 },
          { from: 8, die: 3 },
        ],
      ),
    ).toBe('There is no 3 left to play.');
  });

  it('refuses a move that is not legal', () => {
    expect(playTurn(startPosition(), 0, [6, 5], [{ from: 6, die: 6 }])).toBe(
      'That checker cannot move there.',
    );
  });

  it('lists no duplicate turns', () => {
    const cases: [number, number][] = [
      [3, 1],
      [6, 5],
      [4, 4],
      [2, 2],
      [1, 1],
      [6, 1],
    ];
    for (const dice of cases) {
      for (const side of [0, 1] as Side[]) {
        const turns = legalTurns(startPosition(), side, dice);
        const keys = turns.map((t) => t.map((s) => `${s.from}/${s.die}`).join(' '));
        expect(new Set(keys).size, `${side} ${dice}`).toBe(keys.length);
      }
    }
  });

  it('reports no moves when shut out', () => {
    // Ebony holds all six points of Ivory's entry board.
    const pos = mk({ 6: 1 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 }, { bar: [1, 0] });
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        expect(mostDice(pos, 0, [a, b])).toBe(0);
        expect(legalTurns(pos, 0, [a, b])).toEqual([]);
      }
    }
  });

  it('can still move for a side that is not shut out', () => {
    const pos = mk({ 6: 1 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 }, { bar: [1, 0] });
    expect(mostDice(pos, 0, [6, 1])).toBeGreaterThan(0);
  });
});

describe('winKind', () => {
  it('is a single game when the loser has borne a checker off', () => {
    expect(winKind(mk({}, { 10: 14 }, { off: [15, 1] }), 0)).toBe(1);
  });

  it('is a gammon when the loser has borne none off', () => {
    expect(winKind(mk({}, { 10: 15 }, { off: [15, 0] }), 0)).toBe(2);
  });

  it('is a backgammon with a loser checker on the bar', () => {
    expect(winKind(mk({}, { 10: 14 }, { off: [15, 0], bar: [0, 1] }), 0)).toBe(3);
  });

  it('is a backgammon with a loser checker in the winner home board', () => {
    // Ebony pip 20 is Ivory's 5 point.
    expect(winKind(mk({}, { 20: 1, 10: 14 }, { off: [15, 0] }), 0)).toBe(3);
    // Ebony pip 18 is Ivory's 7 point: only a gammon.
    expect(winKind(mk({}, { 18: 1, 10: 14 }, { off: [15, 0] }), 0)).toBe(2);
  });

  it('works for Ebony winning', () => {
    expect(winKind(mk({ 10: 15 }, {}, { off: [0, 15] }), 1)).toBe(2);
    expect(winKind(mk({ 20: 1, 10: 14 }, {}, { off: [0, 15] }), 1)).toBe(3);
    expect(winKind(mk({ 10: 14 }, {}, { off: [1, 15] }), 1)).toBe(1);
  });
});

describe('nextSteps (a turn played one checker at a time)', () => {
  it('offers both dice from the start, and nothing once the turn is complete', () => {
    const pos = startPosition();
    const first = nextSteps(pos, 0, [3, 1], []);
    expect(first).toContainEqual({ from: 8, die: 3 });
    expect(first).toContainEqual({ from: 6, die: 1 });
    const played = [
      { from: 8, die: 3 },
      { from: 6, die: 1 },
    ];
    expect(nextSteps(pos, 0, [3, 1], played)).toEqual([]);
    expect(diceLeft([3, 1], played)).toEqual([]);
  });

  it('lets a doublet be played in any order', () => {
    const pos = startPosition();
    // The 6 point first, then the 13: legalTurns lists this the other way round.
    const after = nextSteps(pos, 0, [3, 3], [{ from: 6, die: 3 }]);
    expect(after).toContainEqual({ from: 13, die: 3 });
    expect(diceLeft([3, 3], [{ from: 6, die: 3 }])).toEqual([3, 3, 3]);
  });

  it('only offers the bar while a checker is on it', () => {
    const pos = mk({ 6: 14 }, { 6: 15 }, { bar: [1, 0] });
    const steps = nextSteps(pos, 0, [4, 2], []);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => s.from === BAR)).toBe(true);
  });

  it('keeps to the larger die when only one die can be played', () => {
    // Ivory's lone checker on 24 can go to 18 or 23, but Ebony holds 17 (its own 8), so not both.
    const pos = mk({ 24: 1, 1: 14 }, { 8: 2, 6: 13 });
    const turns = legalTurns(pos, 0, [6, 1]);
    expect(turns.every((t) => t.length === 1)).toBe(true);
    const steps = nextSteps(pos, 0, [6, 1], []);
    expect(steps.every((s) => s.die === 6)).toBe(true);
  });

  it('refuses a first step that would leave the second die unplayable', () => {
    // 6-5 from the bar: entering with the 5 first would block the 6, so only the 6 enters first.
    const pos = mk({ 19: 1, 1: 13 }, { 6: 2, 2: 2, 3: 2, 4: 2, 5: 2, 1: 5 }, { bar: [1, 0] });
    const steps = nextSteps(pos, 0, [6, 5], []);
    for (const s of steps) {
      const left = nextSteps(pos, 0, [6, 5], [s]);
      expect(left.length + 1).toBe(mostDice(pos, 0, [6, 5]));
    }
  });
});
