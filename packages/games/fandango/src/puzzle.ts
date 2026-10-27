import type { Rng } from '@jackdaw/engine';

/**
 * A Fandango puzzle (LinkedIn's Tango): an N×N board (N even) to fill with suns and moons. Every
 * row and every column holds as many suns as moons, no three of the same sit next to each other
 * across or down, squares joined by = hold the same and squares joined by × hold different ones.
 * Some squares come filled in. Every puzzle made here has exactly one answer, and it can be found
 * by reasoning alone, no guessing.
 *
 * Cells are numbered row by row, `r * size + c`, and hold 0 (empty), `SUN` or `MOON`. `signs` join
 * neighbouring cells, smaller first.
 */
export interface Puzzle {
  size: number;
  given: number[];
  signs: Sign[];
}

export interface Sign {
  a: number;
  b: number;
  same: boolean;
}

export const SUN = 1;
export const MOON = 2;
export const BOARD_SIZES = [4, 6, 8, 10];

const other = (v: number) => 3 - v;

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

/** Every row of the board, then every column, as cell numbers. */
function linesOf(size: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < size; r++) out.push([...Array(size).keys()].map((c) => r * size + c));
  for (let c = 0; c < size; c++) out.push([...Array(size).keys()].map((r) => r * size + c));
  return out;
}

const fills = new Map<number, number[][]>();

/** Every way to fill one row: half suns, half moons, never three alike in a row. */
export function rowFills(size: number): number[][] {
  let out = fills.get(size);
  if (out) return out;
  out = [];
  const row: number[] = [];
  const go = (suns: number, moons: number) => {
    if (row.length === size) return void out!.push([...row]);
    for (const v of [SUN, MOON]) {
      if ((v === SUN ? suns : moons) === size / 2) continue;
      const k = row.length;
      if (k >= 2 && row[k - 1] === v && row[k - 2] === v) continue;
      row.push(v);
      go(suns + (v === SUN ? 1 : 0), moons + (v === MOON ? 1 : 0));
      row.pop();
    }
  };
  go(0, 0);
  fills.set(size, out);
  return out;
}

/**
 * Everything that follows from the clues and the squares filled so far, the way a person works
 * it out: a sign with one side known gives the other, and a row or column whose every possible
 * filling agrees on a square fixes that square. `order` lists the squares in the order they were
 * worked out. Null when the board can't be finished.
 */
export function deduce(p: Puzzle, from: readonly number[] = p.given) {
  const { size } = p;
  const cells = [...from];
  const order: number[] = [];
  const lines = linesOf(size);
  const options = rowFills(size);
  // Signs inside each line, by position along it.
  const inLine = lines.map((line) =>
    p.signs.flatMap((s) => {
      const i = line.indexOf(s.a);
      return i >= 0 && line[i + 1] === s.b ? [{ i, same: s.same }] : [];
    }),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const s of p.signs) {
      const [x, y] = [cells[s.a]!, cells[s.b]!];
      if (x && y) {
        if ((x === y) !== s.same) return null;
      } else if (x || y) {
        const v = s.same ? x || y : other(x || y);
        const cell = x ? s.b : s.a;
        cells[cell] = v;
        order.push(cell);
        changed = true;
      }
    }
    for (let l = 0; l < lines.length; l++) {
      const line = lines[l]!;
      const known = line.map((c) => cells[c]!);
      if (!known.includes(0)) continue;
      const fit = options.filter(
        (o) =>
          o.every((v, i) => !known[i] || known[i] === v) &&
          inLine[l]!.every(({ i, same }) => (o[i] === o[i + 1]) === same),
      );
      if (!fit.length) return null;
      for (let i = 0; i < size; i++) {
        if (known[i]) continue;
        const v = fit[0]![i]!;
        if (fit.every((o) => o[i] === v)) {
          cells[line[i]!] = v;
          order.push(line[i]!);
          changed = true;
        }
      }
    }
  }
  return { cells, order };
}

/** Up to `limit` full answers, by reasoning and then trying each mark where reasoning stops. */
export function solve(p: Puzzle, limit = 2): number[][] {
  const out: number[][] = [];
  const go = (from: number[]) => {
    if (out.length >= limit) return;
    const d = deduce(p, from);
    if (!d) return;
    const open = d.cells.indexOf(0);
    if (open < 0) return void out.push(d.cells);
    for (const v of [SUN, MOON]) {
      const next = [...d.cells];
      next[open] = v;
      go(next);
    }
  };
  go([...p.given]);
  return out;
}

/**
 * What's wrong with a full board, in a sentence, or null when it's the answer. (With one answer,
 * any board keeping every rule is it.)
 */
export function checkBoard(p: Puzzle, cells: readonly number[]): string | null {
  const n = p.size * p.size;
  if (cells.length !== n || cells.some((v) => v !== SUN && v !== MOON)) return 'Fill every square.';
  if (p.given.some((v, i) => v && cells[i] !== v)) return 'Keep the squares that came filled in.';
  for (const line of linesOf(p.size)) {
    const row = line.map((c) => cells[c]!);
    if (row.some((v, i) => i >= 2 && v === row[i - 1] && v === row[i - 2]))
      return 'No more than two suns or two moons next to each other.';
    if (row.filter((v) => v === SUN).length * 2 !== p.size)
      return 'Every row and column needs as many suns as moons.';
  }
  if (p.signs.some((s) => (cells[s.a] === cells[s.b]) !== s.same))
    return 'Squares joined by = match, and squares joined by × differ.';
  return null;
}

/** Squares that already break a rule, to show in red as the board fills. */
export function faults(p: Puzzle, cells: readonly number[]): Set<number> {
  const bad = new Set<number>();
  for (const line of linesOf(p.size)) {
    for (let i = 2; i < line.length; i++) {
      const [a, b, c] = [line[i - 2]!, line[i - 1]!, line[i]!];
      if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c])
        [a, b, c].forEach((x) => bad.add(x));
    }
    for (const v of [SUN, MOON]) {
      const mine = line.filter((c) => cells[c] === v);
      if (mine.length * 2 > p.size) mine.forEach((x) => bad.add(x));
    }
  }
  for (const s of p.signs) {
    if (cells[s.a] && cells[s.b] && (cells[s.a] === cells[s.b]) !== s.same) {
      bad.add(s.a);
      bad.add(s.b);
    }
  }
  return bad;
}

/** A full board keeping the row and column rules, laid a row at a time. */
function randomBoard(size: number, rng: Rng): number[] {
  const options = rowFills(size);
  for (;;) {
    const rows: number[][] = [];
    let budget = 20_000;
    const fits = () => {
      const k = rows.length;
      for (let c = 0; c < size; c++) {
        let suns = 0;
        for (const row of rows) if (row[c] === SUN) suns++;
        if (suns * 2 > size || (k - suns) * 2 > size) return false;
        if (k >= 3 && rows[k - 1]![c] === rows[k - 2]![c] && rows[k - 2]![c] === rows[k - 3]![c])
          return false;
      }
      return true;
    };
    const go = (): boolean => {
      if (rows.length === size) return true;
      for (const row of rng.shuffle(options)) {
        if (--budget < 0) return false;
        rows.push(row);
        if (fits() && go()) return true;
        rows.pop();
      }
      return false;
    };
    if (go()) return rows.flat();
  }
}

/** How much of the board the clues cover at least, so puzzles stay friendly rather than bare. */
const CLUE_SHARE = 0.3;

/**
 * A fresh puzzle with exactly one answer, found by reasoning alone. A full board is laid first;
 * then, wherever reasoning gets stuck, a square is filled in or a sign added beside it, until the
 * whole board follows. Then clues are taken away again, in random order, as long as it still all
 * follows and enough are left.
 */
export function makePuzzle(size: number, rng: Rng): Puzzle {
  const answer = randomBoard(size, rng);
  const given = new Array<number>(size * size).fill(0);
  const signs: Sign[] = [];
  const signed = new Set<string>();
  const puzzle = (): Puzzle => ({ size, given: [...given], signs: [...signs] });
  const solved = () => !deduce(puzzle())!.cells.includes(0);

  while (!solved()) {
    const cells = deduce(puzzle())!.cells;
    const open = cells.flatMap((v, i) => (v ? [] : [i]));
    const cell = rng.pick(open);
    const beside = rng
      .shuffle(neighbours(size, cell))
      .find((nb) => !signed.has(`${Math.min(cell, nb)}-${Math.max(cell, nb)}`));
    if (beside !== undefined && rng.next() < 0.5) {
      const [a, b] = cell < beside ? [cell, beside] : [beside, cell];
      signs.push({ a, b, same: answer[a] === answer[b] });
      signed.add(`${a}-${b}`);
    } else {
      given[cell] = answer[cell]!;
    }
  }

  const floor = Math.round(size * size * CLUE_SHARE);
  const clues = rng.shuffle([
    ...given.flatMap((v, i) => (v ? [{ cell: i }] : [])),
    ...signs.map((sign) => ({ sign })),
  ]);
  let count = clues.length;
  for (const clue of clues) {
    if (count <= floor) break;
    if ('cell' in clue) {
      const v = given[clue.cell]!;
      given[clue.cell] = 0;
      if (solved()) count--;
      else given[clue.cell] = v;
    } else {
      const at = signs.indexOf(clue.sign);
      signs.splice(at, 1);
      if (solved()) count--;
      else signs.splice(at, 0, clue.sign);
    }
  }
  return puzzle();
}
