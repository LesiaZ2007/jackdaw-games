import { describe, expect, it } from 'vitest';
import type { GameCategory } from '@jackdaw/engine';
import { CATEGORY_LABEL, SHELVES } from './catalog';
import { packShelves, type ShelfSlot } from './shelf-layout';

const COLS = 6;

/** Splits the slots back into rows, failing if any row is short or over-full. */
function rowsOf(slots: ShelfSlot[], cols = COLS): ShelfSlot[][] {
  const rows: ShelfSlot[][] = [];
  let row: ShelfSlot[] = [];
  let used = 0;
  for (const s of slots) {
    row.push(s);
    used += s.span;
    expect(used).toBeLessThanOrEqual(cols);
    if (used === cols) {
      rows.push(row);
      row = [];
      used = 0;
    }
  }
  expect(row).toEqual([]);
  return rows;
}

const shelvesIn = (slots: ShelfSlot[]) =>
  slots.flatMap((s) => (s.item === 'draw' ? [] : [s.item])).sort((a, b) => a - b);

describe('packShelves', () => {
  it('pairs the shelves of today: three and three, three and three, five and the draw box', () => {
    const slots = packShelves([3, 3, 3, 3, 5], COLS, true);
    expect(rowsOf(slots).map((r) => r.map((s) => [s.item, s.span]))).toEqual([
      [
        [0, 3],
        [1, 3],
      ],
      [
        [2, 3],
        [3, 3],
      ],
      [
        [4, 5],
        ['draw', 1],
      ],
    ]);
  });

  it('moves a later shelf up when it fills the row better', () => {
    // 4 then 3 would leave holes; the 2 at the end fits beside the 4.
    const rows = rowsOf(packShelves([4, 3, 3, 2], COLS, false));
    expect(rows[0]!.map((s) => s.item)).toEqual([0, 3]);
    expect(rows[1]!.map((s) => s.item)).toEqual([1, 2]);
  });

  it('gives the draw box the biggest gap, and widens a shelf beside any other', () => {
    const slots = packShelves([4, 4], COLS, true);
    const rows = rowsOf(slots);
    expect(rows).toHaveLength(2);
    expect(slots.filter((s) => s.item === 'draw')).toEqual([{ item: 'draw', span: 2 }]);
    expect(slots.find((s) => s.item === 0)!.span).toBe(6);
  });

  it('gives the draw box a row of its own when every row is full', () => {
    expect(packShelves([6, 3, 3], COLS, true).at(-1)).toEqual({ item: 'draw', span: COLS });
  });

  it('caps a big shelf at a full row (its boxes wrap below)', () => {
    expect(packShelves([11], COLS, false)).toEqual([{ item: 0, span: 6 }]);
  });

  it('fills every row and places every shelf once, for any counts', () => {
    for (let n = 1; n <= 9; n++) {
      for (let seed = 0; seed < 40; seed++) {
        const counts = Array.from({ length: n }, (_, i) => ((seed * 7 + i * 5) % 9) + 1);
        for (const draw of [true, false]) {
          const slots = packShelves(counts, COLS, draw);
          rowsOf(slots);
          expect(shelvesIn(slots)).toEqual(counts.map((_, i) => i));
          expect(slots.filter((s) => s.item === 'draw')).toHaveLength(draw ? 1 : 0);
        }
      }
    }
  });

  it('copes with many shelves (first-fit past the search limit)', () => {
    const counts = Array.from({ length: 20 }, (_, i) => (i % 5) + 1);
    const slots = packShelves(counts, COLS, true);
    rowsOf(slots);
    expect(shelvesIn(slots)).toHaveLength(20);
  });
});

describe('SHELVES', () => {
  it('has a shelf for every kind of game, so no game goes missing from the home page', () => {
    const kinds = Object.keys(CATEGORY_LABEL) as GameCategory[];
    expect(SHELVES.map((s) => s.kind).sort()).toEqual([...kinds].sort());
  });
});
