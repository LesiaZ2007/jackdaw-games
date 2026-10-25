import type { Rng } from '@jackdaw/engine';
import { layout } from './geometry';
import type { Board, DevCard, HarbourKind, Size, Terrain, Tile } from './types';

/**
 * Laying out the island (5th edition and the 5–6 extension): which tiles, which number tokens in
 * which order, which harbours. Balanced follows the rulebook: tiles shuffled, tokens laid in
 * letter order along the spiral, redrawn until no two red numbers (6 and 8) touch.
 */

export type BoardStyle = 'Balanced' | 'Random' | 'Beginner';

/** Number tokens in letter order (A, B, C…). */
export const TOKENS: Record<Size, number[]> = {
  classic: [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11],
  big: [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6],
};

export const TILE_COUNTS: Record<Size, Record<Terrain, number>> = {
  classic: { forest: 4, pasture: 4, fields: 4, hills: 3, mountains: 3, desert: 1 },
  big: { forest: 6, pasture: 6, fields: 6, hills: 5, mountains: 5, desert: 2 },
};

export const HARBOUR_KINDS: Record<Size, HarbourKind[]> = {
  classic: ['any', 'any', 'any', 'any', 'lumber', 'brick', 'wool', 'grain', 'ore'],
  big: ['any', 'any', 'any', 'any', 'any', 'wool', 'wool', 'lumber', 'brick', 'grain', 'ore'],
};

/** Cards of each resource in the bank at the start. */
export const RESOURCE_COUNT: Record<Size, number> = { classic: 19, big: 24 };

export const DEV_DECK: Record<Size, Record<DevCard, number>> = {
  classic: { knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 },
  big: { knight: 20, victoryPoint: 5, roadBuilding: 3, yearOfPlenty: 3, monopoly: 3 },
};

/** The rulebook's starting map for the classic island, row by row. */
const BEGINNER_TILES: [Terrain, number | null][] = [
  ['mountains', 10],
  ['pasture', 2],
  ['forest', 9],
  ['fields', 12],
  ['hills', 6],
  ['pasture', 4],
  ['hills', 10],
  ['fields', 9],
  ['forest', 11],
  ['desert', null],
  ['forest', 3],
  ['mountains', 8],
  ['forest', 8],
  ['mountains', 3],
  ['fields', 4],
  ['pasture', 5],
  ['hills', 5],
  ['fields', 6],
  ['pasture', 11],
];
const BEGINNER_HARBOURS: HarbourKind[] = [
  'any',
  'wool',
  'any',
  'ore',
  'grain',
  'any',
  'brick',
  'lumber',
  'any',
];

/** Ways to roll a number with two dice: the dots on its token. */
export const pips = (n: number): number => 6 - Math.abs(7 - n);

const isRed = (n: number | null) => n === 6 || n === 8;

export function redsTouch(board: Board): boolean {
  const L = layout(board.size);
  return board.tiles.some(
    (t, i) => isRed(t.number) && L.tiles[i]!.neighbours.some((n) => isRed(board.tiles[n]!.number)),
  );
}

export function makeBoard(size: Size, style: BoardStyle, rng: Rng): Board {
  const L = layout(size);
  if (style === 'Beginner' && size === 'classic') {
    return {
      size,
      tiles: BEGINNER_TILES.map(([terrain, number]) => ({ terrain, number })),
      harbours: L.harbourSlots.map((edge, i) => ({ edge, kind: BEGINNER_HARBOURS[i]! })),
    };
  }
  const harbours = rng
    .shuffle(HARBOUR_KINDS[size])
    .map((kind, i) => ({ edge: L.harbourSlots[i]!, kind }));
  const terrains = Object.entries(TILE_COUNTS[size]).flatMap(([t, n]) =>
    Array<Terrain>(n).fill(t as Terrain),
  );
  let board: Board = { size, tiles: [], harbours };
  for (let tries = 0; tries < 500; tries++) {
    const ts = rng.shuffle(terrains);
    const tiles: Tile[] = ts.map((terrain) => ({ terrain, number: null }));
    const tokens = style === 'Random' ? rng.shuffle(TOKENS[size]) : TOKENS[size];
    let k = 0;
    for (const i of L.spiral) if (tiles[i]!.terrain !== 'desert') tiles[i]!.number = tokens[k++]!;
    board = { size, tiles, harbours };
    if (!redsTouch(board)) break;
  }
  return board;
}
