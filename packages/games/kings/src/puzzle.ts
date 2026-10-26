import type { Rng } from '@jackdaw/engine';

/**
 * A Kings puzzle (LinkedIn's Queens, with kings): an N×N board cut into N coloured regions.
 * Place N kings so that every row, every column and every region holds exactly one, and no two
 * kings touch, not even at a corner. Every puzzle made here has exactly one answer.
 *
 * Cells are numbered row by row, `r * size + c`. `regions[cell]` is the region (0…N-1).
 */
export interface Puzzle {
  size: number;
  regions: number[];
}

/** The smallest and largest boards offered. Below 5 there are too few layouts to be a puzzle. */
export const MIN_SIZE = 5;
export const MAX_SIZE = 10;

/** Columns of the kings by row, or null when the board has no answer. */
export type Answer = number[];

/**
 * Up to `limit` answers to the puzzle, row by row. Kings go one per row, so two kings can only
 * touch across neighbouring rows, which is checked against the row above.
 */
export function solve(p: Puzzle, limit = 2): Answer[] {
  const { size, regions } = p;
  const found: Answer[] = [];
  const cols: number[] = [];
  let colMask = 0;
  let regionMask = 0;
  const walk = (r: number) => {
    if (found.length >= limit) return;
    if (r === size) {
      found.push(cols.slice());
      return;
    }
    const above = r > 0 ? cols[r - 1]! : -9;
    for (let c = 0; c < size; c++) {
      if (colMask & (1 << c) || Math.abs(c - above) < 2) continue;
      const g = regions[r * size + c]!;
      if (regionMask & (1 << g)) continue;
      colMask |= 1 << c;
      regionMask |= 1 << g;
      cols[r] = c;
      walk(r + 1);
      colMask &= ~(1 << c);
      regionMask &= ~(1 << g);
      if (found.length >= limit) return;
    }
  };
  walk(0);
  return found;
}

/** Why these kings don't solve the puzzle, or null if they do. `kings` are cell numbers. */
export function checkKings(p: Puzzle, kings: readonly number[]): string | null {
  const { size, regions } = p;
  if (kings.length !== size) return `Place ${size} kings.`;
  if (new Set(kings).size !== size || kings.some((k) => k < 0 || k >= size * size))
    return 'Each king needs its own square.';
  const rows = new Set(kings.map((k) => Math.floor(k / size)));
  const cols = new Set(kings.map((k) => k % size));
  const regs = new Set(kings.map((k) => regions[k]));
  if (rows.size !== size) return 'One king in every row.';
  if (cols.size !== size) return 'One king in every column.';
  if (regs.size !== size) return 'One king in every colour.';
  for (const a of kings)
    for (const b of kings)
      if (
        a !== b &&
        Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 &&
        Math.abs((a % size) - (b % size)) <= 1
      )
        return 'Two kings are touching.';
  return null;
}

/** A random layout of kings, one per row and column, none touching. */
function randomAnswer(size: number, rng: Rng): Answer {
  const cols: number[] = [];
  const used = new Set<number>();
  const walk = (r: number): boolean => {
    if (r === size) return true;
    for (const c of rng.shuffle([...Array(size).keys()])) {
      if (used.has(c) || (r > 0 && Math.abs(c - cols[r - 1]!) < 2)) continue;
      used.add(c);
      cols[r] = c;
      if (walk(r + 1)) return true;
      used.delete(c);
    }
    return false;
  };
  walk(0);
  return cols;
}

function neighbours(cell: number, size: number): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

/** Is region `g` still in one piece without `without`? */
function connectedWithout(regions: number[], size: number, g: number, without: number): boolean {
  const cells = regions.flatMap((x, i) => (x === g && i !== without ? [i] : []));
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]!]);
  const stack = [cells[0]!];
  while (stack.length) {
    const at = stack.pop()!;
    for (const n of neighbours(at, size))
      if (n !== without && regions[n] === g && !seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
  }
  return seen.size === cells.length;
}

/**
 * Regions grown out from each king of the answer, a square at a time, from a random region's
 * edge, so shapes come out uneven: some long and thin, some broad.
 */
function growRegions(size: number, answer: Answer, rng: Rng): number[] {
  const regions = Array<number>(size * size).fill(-1);
  answer.forEach((c, r) => (regions[r * size + c] = r));
  let left = size * size - size;
  // Some regions grow faster than others, which gives the mix of big and small that makes it fun.
  const weight = [...Array(size).keys()].map(() => 0.3 + rng.next() * 1.7);
  const total = weight.reduce((a, b) => a + b, 0);
  while (left > 0) {
    let roll = rng.next() * total;
    let g = 0;
    while (g < size - 1 && (roll -= weight[g]!) > 0) g++;
    const edge: number[] = [];
    regions.forEach((x, i) => {
      if (x === g) for (const n of neighbours(i, size)) if (regions[n] === -1) edge.push(n);
    });
    if (edge.length === 0) continue;
    regions[rng.pick(edge)] = g;
    left--;
  }
  return regions;
}

/**
 * A new puzzle with exactly one answer. It lays out an answer, grows the regions round it, then,
 * while a second answer exists, hands one of that answer's squares to a neighbouring region so
 * the second answer stops working. A board that won't settle is thrown away and started again.
 */
export function makePuzzle(size: number, rng: Rng): Puzzle {
  for (;;) {
    const answer = randomAnswer(size, rng);
    const kingAt = new Set(answer.map((c, r) => r * size + c));
    const regions = growRegions(size, answer, rng);
    for (let step = 0; step < size * 12; step++) {
      const found = solve({ size, regions });
      // Regions were numbered by their king's row; shuffled so a colour says nothing about it.
      if (found.length === 1) {
        const relabel = rng.shuffle([...Array(size).keys()]);
        return { size, regions: regions.map((g) => relabel[g]!) };
      }
      const other = found.find((a) => a.some((c, r) => c !== answer[r]))!;
      const moves: [number, number][] = [];
      other.forEach((c, r) => {
        const cell = r * size + c;
        if (kingAt.has(cell)) return;
        const from = regions[cell]!;
        if (!connectedWithout(regions, size, from, cell)) return;
        for (const n of neighbours(cell, size))
          if (regions[n] !== from && !moves.some(([x, g]) => x === cell && g === regions[n]))
            moves.push([cell, regions[n]!]);
      });
      if (moves.length === 0) break;
      const [cell, to] = rng.pick(moves);
      regions[cell] = to;
    }
  }
}
