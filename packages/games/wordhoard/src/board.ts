/**
 * Wordhoard's board, tiles and scoring: pure functions shared by the rules and the screens (the
 * phone previews a play's score before sending it). No word list here; that's server-side only.
 */

export const SIZE = 15;
export const CENTRE = 7;
export const RACK = 7;
export const BINGO = 50;

/** Letter values. '?' is a blank, worth nothing. */
export const VALUE: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 3,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 5,
  W: 4,
  X: 8,
  Y: 3,
  Z: 10,
  '?': 0,
};

/** How many of each tile are in the bag at the start: 100 in all. */
export const COUNTS: Record<string, number> = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 2,
  I: 8,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 5,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  '?': 2,
};

export type Premium = 'tw' | 'dw' | 'tl' | 'dl';

/** One quarter of the board (rows and columns 0–7), mirrored into the other three. */
const QUARTER: Record<Premium, [number, number][]> = {
  tw: [
    [0, 3],
    [3, 0],
  ],
  dw: [
    [1, 1],
    [4, 4],
    [2, 6],
    [6, 2],
    [7, 7],
  ],
  tl: [
    [1, 5],
    [5, 1],
    [5, 5],
  ],
  dl: [
    [0, 0],
    [2, 3],
    [3, 2],
    [0, 7],
    [7, 0],
    [6, 6],
    [3, 7],
    [7, 3],
  ],
};

export const PREMIUM: (Premium | null)[][] = (() => {
  const grid: (Premium | null)[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => null),
  );
  for (const [kind, cells] of Object.entries(QUARTER) as [Premium, [number, number][]][]) {
    for (const [r, c] of cells) {
      for (const [rr, cc] of [
        [r, c],
        [r, SIZE - 1 - c],
        [SIZE - 1 - r, c],
        [SIZE - 1 - r, SIZE - 1 - c],
      ] as const)
        grid[rr]![cc] = kind;
    }
  }
  return grid;
})();

/** A tile on the board: its letter, and whether it's a blank standing for that letter. */
export interface Cell {
  letter: string;
  blank?: boolean;
}
export type Board = (Cell | null)[][];

export const emptyBoard = (): Board =>
  Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));

/** A tile being placed this turn. `letter` is what it reads as (a blank's chosen letter). */
export interface Placement {
  row: number;
  col: number;
  letter: string;
  blank?: boolean;
}

export interface FormedWord {
  word: string;
  /** Cells of the word, in reading order. */
  cells: [number, number][];
  score: number;
}

export type PlayCheck =
  { ok: true; words: FormedWord[]; score: number; bingo: boolean } | { ok: false; reason: string };

const inside = (r: number, c: number) => r >= 0 && c >= 0 && r < SIZE && c < SIZE;

/**
 * Checks where the tiles go (one line, no gaps, touching the board or on the centre for the
 * first play) and scores every word they make. Whether the words are real is checked elsewhere.
 */
export function checkPlay(board: Board, tiles: Placement[]): PlayCheck {
  if (tiles.length === 0) return { ok: false, reason: 'Place at least one tile.' };
  if (tiles.length > RACK) return { ok: false, reason: 'You only have seven tiles.' };
  const placed = new Map<string, Placement>();
  for (const t of tiles) {
    if (!inside(t.row, t.col)) return { ok: false, reason: 'That’s off the board.' };
    if (board[t.row]![t.col]) return { ok: false, reason: 'That square is taken.' };
    if (!/^[A-Z]$/.test(t.letter)) return { ok: false, reason: 'Each tile needs a letter.' };
    const key = `${t.row},${t.col}`;
    if (placed.has(key)) return { ok: false, reason: 'Two tiles on one square.' };
    placed.set(key, t);
  }
  const at = (r: number, c: number): Cell | Placement | null =>
    inside(r, c) ? (placed.get(`${r},${c}`) ?? board[r]![c] ?? null) : null;

  const rows = new Set(tiles.map((t) => t.row));
  const cols = new Set(tiles.map((t) => t.col));
  if (rows.size > 1 && cols.size > 1)
    return { ok: false, reason: 'Tiles must go in one row or one column.' };
  const firstPlay = board.every((row) => row.every((c) => !c));
  // Direction of the main word: along the row unless the tiles share a column (or a single tile
  // only makes a word up and down).
  let across = rows.size === 1;
  if (tiles.length === 1) {
    const t = tiles[0]!;
    across =
      Boolean(at(t.row, t.col - 1) || at(t.row, t.col + 1)) ||
      !(at(t.row - 1, t.col) || at(t.row + 1, t.col));
  }
  const [dr, dc] = across ? [0, 1] : [1, 0];
  const sorted = [...tiles].sort((a, b) => (across ? a.col - b.col : a.row - b.row));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  for (let r = first.row, c = first.col; r <= last.row && c <= last.col; r += dr, c += dc) {
    if (!at(r, c)) return { ok: false, reason: 'Leave no gaps between your tiles.' };
  }

  if (firstPlay) {
    if (!placed.has(`${CENTRE},${CENTRE}`))
      return { ok: false, reason: 'The first word must cover the star in the middle.' };
    if (tiles.length < 2)
      return { ok: false, reason: 'The first word needs at least two letters.' };
  } else {
    const touches = tiles.some(({ row, col }) =>
      [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ].some(([r, c]) => inside(r!, c!) && board[r!]![c!]),
    );
    if (!touches) return { ok: false, reason: 'Your word must join the words on the board.' };
  }

  /** The whole word through (r, c) in direction (dr, dc), if two or more letters. */
  const wordThrough = (r: number, c: number, dr: number, dc: number): FormedWord | null => {
    let sr = r;
    let sc = c;
    while (at(sr - dr, sc - dc)) {
      sr -= dr;
      sc -= dc;
    }
    const cells: [number, number][] = [];
    for (let rr = sr, cc = sc; at(rr, cc); rr += dr, cc += dc) cells.push([rr, cc]);
    if (cells.length < 2) return null;
    let sum = 0;
    let times = 1;
    let word = '';
    for (const [rr, cc] of cells) {
      const cell = at(rr, cc)!;
      word += cell.letter;
      let value = cell.blank ? 0 : (VALUE[cell.letter] ?? 0);
      if (placed.has(`${rr},${cc}`)) {
        const p = PREMIUM[rr]![cc];
        if (p === 'dl') value *= 2;
        if (p === 'tl') value *= 3;
        if (p === 'dw') times *= 2;
        if (p === 'tw') times *= 3;
      }
      sum += value;
    }
    return { word, cells, score: sum * times };
  };

  const words: FormedWord[] = [];
  const main = wordThrough(first.row, first.col, dr, dc);
  if (main) words.push(main);
  for (const t of tiles) {
    const cross = wordThrough(t.row, t.col, dc, dr);
    if (cross) words.push(cross);
  }
  if (words.length === 0) return { ok: false, reason: 'Make a word of at least two letters.' };
  const bingo = tiles.length === RACK;
  const score = words.reduce((s, w) => s + w.score, 0) + (bingo ? BINGO : 0);
  return { ok: true, words, score, bingo };
}

/** The points left on a rack (taken off at the end). */
export const rackValue = (rack: string[]) => rack.reduce((s, t) => s + (VALUE[t] ?? 0), 0);
