import { describe, expect, it } from 'vitest';
import { links, type Puzzle } from '../puzzle';
import { stepTo } from './board';

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

  it('stops at the last number', () => {
    const line = [0, 1, 2, 3, 4];
    expect(stepTo(p, adj, line, 9)).toBeNull();
    expect(stepTo(p, adj, line, 2)).toEqual([0, 1, 2]);
  });
});
