import { describe, expect, it } from 'vitest';
import { arrange, moveTo } from './arrange';

describe('arranging the rack', () => {
  it('shows the server order until you move anything', () => {
    expect(arrange(['H', 'O', 'A'], [])).toEqual([0, 1, 2]);
  });

  it('keeps your order, and puts new tiles on the end', () => {
    // You had D R O A H; you played H and A, and drew E and S.
    const rack = ['R', 'O', 'D', 'E', 'S'];
    expect(arrange(rack, ['D', 'R', 'O', 'A', 'H'])).toEqual([2, 0, 1, 3, 4]);
  });

  it('matches repeated letters one for one', () => {
    expect(arrange(['E', 'T', 'E'], ['E', 'E', 'T'])).toEqual([0, 2, 1]);
    expect(arrange(['E', 'T'], ['E', 'E', 'T'])).toEqual([0, 1]);
  });

  it('moves a tile to where another was, either way', () => {
    expect(moveTo([0, 1, 2, 3], 0, 2)).toEqual([1, 2, 0, 3]);
    expect(moveTo([0, 1, 2, 3], 3, 1)).toEqual([0, 3, 1, 2]);
    expect(moveTo([0, 1, 2, 3], 2, 2)).toEqual([0, 1, 2, 3]);
  });
});
