import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  HARBOUR_KINDS,
  TILE_COUNTS,
  TOKENS,
  makeBoard,
  pips,
  redsTouch,
  type BoardStyle,
} from './board';
import { layout } from './geometry';
import type { Board, Size } from './types';

const STYLES: BoardStyle[] = ['Balanced', 'Random', 'Beginner'];
const SIZES: Size[] = ['classic', 'big'];

const tally = <T extends string>(xs: T[]) =>
  xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});

describe('board generation', () => {
  it.each(SIZES.flatMap((size) => STYLES.map((style) => [size, style] as const)))(
    'component counts match (%s, %s)',
    (size, style) => {
      const b = makeBoard(size, style, createRng(7));
      expect(b.size).toBe(size);
      expect(tally(b.tiles.map((t) => t.terrain))).toEqual(TILE_COUNTS[size]);
      const numbers = b.tiles.flatMap((t) => (t.number === null ? [] : [t.number]));
      expect(numbers.sort((x, y) => x - y)).toEqual([...TOKENS[size]].sort((x, y) => x - y));
      for (const t of b.tiles) expect(t.number === null).toBe(t.terrain === 'desert');
      expect(tally(b.harbours.map((h) => h.kind))).toEqual(tally(HARBOUR_KINDS[size]));
      expect(b.harbours.map((h) => h.edge)).toEqual(layout(size).harbourSlots);
    },
  );

  it('Balanced lays tokens in spiral order', () => {
    for (const size of SIZES) {
      const b = makeBoard(size, 'Balanced', createRng(3));
      const along = layout(size)
        .spiral.map((i) => b.tiles[i]!.number)
        .filter((n): n is number => n !== null);
      expect(along).toEqual(TOKENS[size]);
    }
  });

  it('no style lets red numbers touch', () => {
    for (const size of SIZES)
      for (const style of STYLES)
        for (let seed = 0; seed < 200; seed++)
          expect(redsTouch(makeBoard(size, style, createRng(seed)))).toBe(false);
  });

  it('redsTouch spots two neighbouring reds', () => {
    const L = layout('classic');
    const b: Board = makeBoard('classic', 'Beginner', createRng(1));
    const [a, n] = [0, L.tiles[0]!.neighbours[0]!];
    const tiles = b.tiles.map((t, i) =>
      i === a ? { ...t, number: 6 } : i === n ? { ...t, number: 8 } : t,
    );
    expect(redsTouch({ ...b, tiles })).toBe(true);
  });

  it('Beginner classic is the rulebook map', () => {
    const b = makeBoard('classic', 'Beginner', createRng(99));
    expect(b.tiles.slice(0, 3)).toEqual([
      { terrain: 'mountains', number: 10 },
      { terrain: 'pasture', number: 2 },
      { terrain: 'forest', number: 9 },
    ]);
    expect(b.tiles[9]).toEqual({ terrain: 'desert', number: null });
    expect(makeBoard('classic', 'Beginner', createRng(1))).toEqual(b);
  });

  it('Beginner on big falls back to Balanced', () => {
    expect(makeBoard('big', 'Beginner', createRng(5))).toEqual(
      makeBoard('big', 'Balanced', createRng(5)),
    );
  });

  it('same seed, same board; different seeds differ', () => {
    expect(makeBoard('classic', 'Balanced', createRng(42))).toEqual(
      makeBoard('classic', 'Balanced', createRng(42)),
    );
    expect(makeBoard('classic', 'Random', createRng(1))).not.toEqual(
      makeBoard('classic', 'Random', createRng(2)),
    );
  });

  it('pips count the ways to roll a number', () => {
    expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pips)).toEqual([1, 2, 3, 4, 5, 5, 4, 3, 2, 1]);
  });
});
