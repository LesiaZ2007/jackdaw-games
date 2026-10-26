import type { Rng } from '@jackdaw/engine';

/**
 * A Zap puzzle (LinkedIn's Zip): an N×N board with numbered squares and a few walls. Draw one
 * line from 1 that passes through every square exactly once, through the numbers in order, and
 * ends on the last number. It moves up, down, left or right, never through a wall. Every puzzle
 * made here has exactly one answer.
 *
 * Cells are numbered row by row, `r * size + c`. `dots[k]` is the cell showing number k + 1.
 * `walls` are pairs of neighbouring cells, smaller first, with a wall between them.
 */
export interface Puzzle {
  size: number;
  dots: number[];
  walls: [number, number][];
}

/** The smallest and largest boards offered. Above 8, making a board with one answer gets slow. */
export const MIN_SIZE = 5;
export const MAX_SIZE = 8;

export function neighbours(size: number, cell: number): number[] {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

const wallKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/** For each cell, the neighbours a line can step to (no wall between). */
export function links(p: Puzzle): number[][] {
  const walled = new Set(p.walls.map(([a, b]) => wallKey(a, b)));
  return [...Array(p.size * p.size).keys()].map((cell) =>
    neighbours(p.size, cell).filter((n) => !walled.has(wallKey(cell, n))),
  );
}

/**
 * Up to `limit` answers, each the line's cells in order. Gives up after `budget` steps and
 * returns null, so a board that's slow to check can be made easier instead.
 */
export function solve(p: Puzzle, limit = 2, budget = 60_000): number[][] | null {
  const n = p.size * p.size;
  const adj = links(p);
  const order = new Int16Array(n).fill(-1);
  p.dots.forEach((cell, k) => (order[cell] = k));
  const last = p.dots[p.dots.length - 1]!;
  const seen = new Uint8Array(n);
  const path: number[] = [];
  const found: number[][] = [];
  let steps = 0;
  const stack = new Int16Array(n);
  const mark = new Uint8Array(n);

  // Every square not yet on the line must still be reachable from its end, in one piece.
  const connected = (from: number, left: number) => {
    mark.fill(0);
    let top = 0;
    let reached = 0;
    for (const m of adj[from]!)
      if (!seen[m] && !mark[m]) {
        mark[m] = 1;
        stack[top++] = m;
      }
    while (top) {
      const cell = stack[--top]!;
      reached++;
      for (const m of adj[cell]!)
        if (!seen[m] && !mark[m]) {
          mark[m] = 1;
          stack[top++] = m;
        }
    }
    return reached === left;
  };

  // A square with only one way in left has to be where the line ends.
  const deadEnd = (from: number, to: number) => {
    for (const u of adj[from]!) {
      if (seen[u] || u === to) continue;
      let free = 0;
      for (const m of adj[u]!) if (!seen[m] || m === to) free++;
      if (free < 2 && u !== last) return true;
      if (free < 1) return true;
    }
    return false;
  };

  const walk = (cell: number, next: number): boolean => {
    if (++steps > budget) return false;
    if (path.length === n) {
      if (cell === last) found.push(path.slice());
      return found.length < limit;
    }
    for (const m of adj[cell]!) {
      if (seen[m]) continue;
      const k = order[m]!;
      if (k >= 0 && k !== next) continue;
      if (m === last && path.length + 1 < n) continue;
      if (deadEnd(cell, m)) continue;
      seen[m] = 1;
      path.push(m);
      const ok = path.length === n || connected(m, n - path.length);
      if (ok && !walk(m, k >= 0 ? next + 1 : next)) {
        seen[m] = 0;
        path.pop();
        return false;
      }
      seen[m] = 0;
      path.pop();
    }
    return true;
  };

  const start = p.dots[0]!;
  seen[start] = 1;
  path.push(start);
  const finished = walk(start, 1);
  if (!finished && steps > budget) return null;
  return found;
}

/** Why this line isn't an answer, or null when it is. */
export function checkPath(p: Puzzle, path: readonly number[]): string | null {
  const n = p.size * p.size;
  if (path[0] !== p.dots[0]) return 'Start on 1.';
  if (new Set(path).size !== path.length) return 'The line crosses itself.';
  const adj = links(p);
  for (let i = 1; i < path.length; i++)
    if (!adj[path[i - 1]!]!.includes(path[i]!)) return 'Every step goes to a square next door.';
  if (path.length !== n) return 'Fill every square.';
  const dots = new Set(p.dots);
  const met = path.filter((c) => dots.has(c));
  if (met.some((c, k) => c !== p.dots[k])) return 'Go through the numbers in order.';
  return null;
}

/** A random line through every square: a zigzag, shuffled by "backbite" moves. */
export function randomPath(size: number, rng: Rng): number[] {
  let path: number[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) path.push(r * size + (r % 2 ? size - 1 - c : c));
  const n = size * size;
  for (let move = 0; move < n * 40; move++) {
    if (rng.next() < 0.5) path.reverse();
    const head = path[0]!;
    const options = neighbours(size, head).filter((m) => m !== path[1]);
    const m = rng.pick(options);
    const i = path.indexOf(m);
    path = [...path.slice(0, i).reverse(), ...path.slice(i)];
  }
  return rng.next() < 0.5 ? path.reverse() : path;
}

/**
 * A fresh puzzle with exactly one answer. A random line is laid first; numbers go along it at
 * intervals. While another line also fits, the puzzle gets a wall across that line or another
 * number on the real one, until only the real one is left.
 */
export function makePuzzle(size: number, rng: Rng): Puzzle {
  const n = size * size;
  for (;;) {
    const path = randomPath(size, rng);
    const at = new Set([0, n - 1]);
    const count = Math.max(4, Math.round(size * (size > 7 ? 1.5 : 1.2)));
    for (let k = 1; k < count - 1; k++) {
      const centre = Math.round((k * (n - 1)) / (count - 1));
      at.add(Math.min(n - 2, Math.max(1, centre + rng.int(5) - 2)));
    }
    const walls: [number, number][] = [];
    const onPath = new Set<string>();
    for (let i = 1; i < n; i++) onPath.add(wallKey(path[i - 1]!, path[i]!));
    const puzzle = (): Puzzle => ({
      size,
      dots: [...at].sort((a, b) => a - b).map((i) => path[i]!),
      walls: walls.map(([a, b]) => [a, b]),
    });

    for (let tries = 0; tries < n * 2; tries++) {
      const p = puzzle();
      const answers = solve(p, 2);
      if (answers && answers.length === 1) return p;
      if (!answers) {
        // Too slow to settle: another number in the longest stretch without one.
        const sorted = [...at].sort((a, b) => a - b);
        let gap = 0;
        for (let k = 1; k < sorted.length; k++)
          if (sorted[k]! - sorted[k - 1]! > sorted[gap + 1]! - sorted[gap]!) gap = k - 1;
        at.add(Math.round((sorted[gap]! + sorted[gap + 1]!) / 2));
        continue;
      }
      const other = answers.find((a) => a.some((c, i) => c !== path[i]))!;
      const split = other.findIndex((c, i) => c !== path[i]);
      const cuts: [number, number][] = [];
      for (let i = Math.max(1, split); i < n; i++) {
        const a = other[i - 1]!;
        const b = other[i]!;
        if (!onPath.has(wallKey(a, b))) cuts.push(a < b ? [a, b] : [b, a]);
      }
      if (cuts.length && (rng.next() < 0.45 || at.size >= n / 3)) walls.push(rng.pick(cuts));
      else at.add(split);
    }
  }
}
