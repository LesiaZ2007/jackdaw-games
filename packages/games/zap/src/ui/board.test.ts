import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { links, makePuzzle, type Puzzle } from '../puzzle';
import { inkOf, stepTo } from './board';

// 1 at the top-left, 2 at the top-right: the line has to stop there.
const p: Puzzle = { size: 5, dots: [0, 4], walls: [] };
const adj = links(p);

describe('drawing the line', () => {
  it('starts on 1, extends next door and cuts back', () => {
    expect(stepTo(p, adj, [], 1)).toBeNull();
    expect(stepTo(p, adj, [], 0)).toEqual([0]);
    expect(stepTo(p, adj, [0], 1)).toEqual([0, 1]);
    expect(stepTo(p, adj, [0], 2)).toBeNull();
    expect(stepTo(p, adj, [0, 1, 2], 1)).toEqual([0, 1]);
  });

  it('comes in different inks from puzzle to puzzle, the same for the same puzzle', () => {
    const rng = createRng(3);
    const puzzles = [...Array(30)].map(() => makePuzzle(5, rng));
    expect(new Set(puzzles.map((q) => inkOf(q).line)).size).toBeGreaterThanOrEqual(5);
    expect(inkOf({ ...puzzles[0]! })).toEqual(inkOf(puzzles[0]!));
  });

  it('stops at the last number', () => {
    const line = [0, 1, 2, 3, 4];
    expect(stepTo(p, adj, line, 9)).toBeNull();
    expect(stepTo(p, adj, line, 2)).toEqual([0, 1, 2]);
  });
});
