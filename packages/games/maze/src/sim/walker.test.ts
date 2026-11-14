import { describe, expect, it } from 'vitest';
import { MAZE_LAYOUTS } from './layouts';
import { advance, canEnter } from './walker';
import type { Walker } from './walker';

const m = MAZE_LAYOUTS[0]!;
const chomper = { ghost: false };
const w = (tile: [number, number], dir: Walker['dir'], prog = 0): Walker => ({
  tile,
  dir,
  next: null,
  prog,
});

describe('advance', () => {
  it('moves along a corridor and lands on tile centers', () => {
    const c = w([1, 1], 'right');
    expect(advance(c, 2.5, m, chomper)).toBe(true);
    expect(c.tile).toEqual([3, 1]);
    expect(c.prog).toBeCloseTo(0.5);
  });

  it('holds a queued turn until the junction', () => {
    // Row 1 runs right from (1,1); the first opening downward is at x = 1, then x = 6.
    const c = w([2, 1], 'right');
    c.next = 'down';
    advance(c, 1, m, chomper);
    expect(c.tile).toEqual([3, 1]);
    expect(c.dir).toBe('right');
    expect(c.next).toBe('down');
    advance(c, 3, m, chomper);
    expect(c.tile).toEqual([6, 1]);
    expect(c.dir).toBe('right');
    advance(c, 0.5, m, chomper);
    expect(c.dir).toBe('down');
    expect(c.next).toBeNull();
    expect(c.tile).toEqual([6, 1]);
    expect(c.prog).toBeCloseTo(0.5);
  });

  it('reverses mid-tile at once, flipping the progress', () => {
    const c = w([2, 1], 'right', 0.3);
    c.next = 'left';
    advance(c, 0, m, chomper);
    expect(c.tile).toEqual([3, 1]);
    expect(c.dir).toBe('left');
    expect(c.prog).toBeCloseTo(0.7);
    expect(c.next).toBeNull();
  });

  it('stops at a wall', () => {
    const c = w([5, 1], 'right');
    expect(advance(c, 1, m, chomper)).toBe(true);
    expect(c.tile).toEqual([6, 1]);
    expect(c.prog).toBe(0);
    expect(advance(c, 1, m, chomper)).toBe(false);
    expect(c.tile).toEqual([6, 1]);
    // Running into the wall partway through a move also reports false.
    const d = w([4, 1], 'right');
    expect(advance(d, 5, m, chomper)).toBe(false);
    expect(d.tile).toEqual([6, 1]);
  });

  it('does not move without a direction', () => {
    const c = w([1, 1], null);
    expect(advance(c, 1, m, chomper)).toBe(false);
    c.next = 'down';
    expect(advance(c, 1, m, chomper)).toBe(true);
    expect(c.tile).toEqual([1, 2]);
  });

  it('wraps through the tunnel both ways', () => {
    const l = w([1, 12], 'left');
    advance(l, 2, m, chomper);
    expect(l.tile).toEqual([26, 12]);
    expect(l.prog).toBeCloseTo(0);
    const r = w([25, 12], 'right');
    advance(r, 2.25, m, chomper);
    expect(r.tile).toEqual([0, 12]);
    expect(r.prog).toBeCloseTo(0.25);
  });

  it('keeps chompers out of the ghost door but lets ghosts through', () => {
    expect(canEnter(m, [13, 10], 'down', false)).toBe(false);
    expect(canEnter(m, [13, 10], 'down', true)).toBe(true);
    const c = w([13, 10], 'down');
    expect(advance(c, 1, m, chomper)).toBe(false);
    const g = w([13, 10], 'down');
    expect(advance(g, 2, m, { ghost: true })).toBe(true);
    expect(g.tile).toEqual([13, 12]);
  });

  it('calls decide at tile centers and arrive on each new tile', () => {
    const decided: string[] = [];
    const arrived: string[] = [];
    const c = w([1, 1], 'right');
    advance(c, 3, m, {
      ghost: false,
      decide: (e) => decided.push(e.tile.join(',')),
      arrive: (e) => arrived.push(e.tile.join(',')),
    });
    expect(arrived).toEqual(['2,1', '3,1', '4,1']);
    expect(decided).toEqual(['1,1', '2,1', '3,1']);
  });
});
