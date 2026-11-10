import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { answerMarks, clashes, edges, ruledOut, type Mark } from './marks';
import { checkKings, makePuzzle, solve, type Puzzle } from './puzzle';

// A 4×4 board in four 2×2 color blocks.
const p: Puzzle = {
  size: 4,
  regions: [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3],
};
const board = (kings: number[]): Mark[] => {
  const m = Array<Mark>(16).fill(0);
  for (const k of kings) m[k] = 2;
  return m;
};
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

describe('ruledOut', () => {
  it('is empty with no kings, and ignores crosses', () => {
    expect(ruledOut(p, Array<Mark>(16).fill(0)).some(Boolean)).toBe(false);
    expect(ruledOut(p, Array<Mark>(16).fill(1)).some(Boolean)).toBe(false);
  });

  it('rules out the row, column, color and neighbors, but not the king itself', () => {
    const out = ruledOut(p, board([5]));
    const open = out.flatMap((x, i) => (x ? [] : [i]));
    expect(open).toEqual([3, 5, 11, 12, 14, 15]);
  });
});

describe('clashes', () => {
  it('is empty for kings that do not touch or share a line or color', () => {
    expect(clashes(p, board([1, 11])).size).toBe(0);
  });

  it('marks both kings of a pair that shares a row, column, color or touches', () => {
    expect(sorted(clashes(p, board([0, 3])))).toEqual([0, 3]); // row
    expect(sorted(clashes(p, board([0, 12])))).toEqual([0, 12]); // column
    expect(sorted(clashes(p, board([0, 5])))).toEqual([0, 5]); // color and touching
    expect(sorted(clashes(p, board([2, 7])))).toEqual([2, 7]); // color
    expect(sorted(clashes(p, board([5, 10])))).toEqual([5, 10]); // diagonal touch
  });

  it('finds no clash in the answer of a generated puzzle', () => {
    const puzzle = makePuzzle(6, createRng(11));
    const kings = solve(puzzle, 1)[0]!.map((c, r) => r * puzzle.size + c);
    expect(checkKings(puzzle, kings)).toBeNull();
    expect(clashes(puzzle, answerMarks(puzzle, kings)).size).toBe(0);
  });
});

describe('edges', () => {
  it('inks the board edge and every color change', () => {
    expect(edges(p, 0)).toEqual({ t: true, l: true, b: false, r: false });
    expect(edges(p, 1)).toEqual({ t: true, l: false, b: false, r: true });
    expect(edges(p, 5)).toEqual({ t: false, l: false, b: true, r: true });
    expect(edges(p, 10)).toEqual({ t: true, l: true, b: false, r: false });
  });
});

describe('answerMarks', () => {
  it('puts a king on each answer square and nothing else', () => {
    const m = answerMarks(p, [1, 8]);
    expect(m.filter((x) => x === 2)).toHaveLength(2);
    expect(m[1]).toBe(2);
    expect(m[8]).toBe(2);
    expect(m.filter((x) => x === 1)).toHaveLength(0);
  });
});
