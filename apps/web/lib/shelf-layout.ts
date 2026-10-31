/**
 * How the home page's shelves sit on wide screens: rows of `cols` columns, each shelf one column
 * per game (a full row at most, its boxes wrapping below). Shelves keep their order where they
 * can, but a row takes whichever later shelves fill it best, so short kinds pair up instead of
 * leaving gaps. The draw box takes the biggest gap left over (or a row of its own), and a shelf
 * next to any other gap widens to close it, so every row is full whatever the counts.
 */
export interface ShelfSlot {
  /** Index into the shelves passed in, or 'draw' for the draw box. */
  item: number | 'draw';
  /** Columns it spans. */
  span: number;
}

/** Brute force is fine below this many shelves waiting; past it, plain first-fit. */
const SEARCH_LIMIT = 12;

/**
 * The later shelves (by position in `waiting`) that best fill `free` columns: the most columns
 * filled, then the fewest shelves moved ahead, then the earliest.
 */
function bestFill(waiting: number[], spans: number[], free: number): number[] {
  if (waiting.length > SEARCH_LIMIT) {
    const picked: number[] = [];
    for (const i of waiting) {
      if (spans[i]! <= free) {
        picked.push(i);
        free -= spans[i]!;
      }
    }
    return picked;
  }
  let best: number[] = [];
  let bestSum = 0;
  for (let mask = 1; mask < 1 << waiting.length; mask++) {
    const pick = waiting.filter((_, b) => mask & (1 << b));
    const sum = pick.reduce((t, i) => t + spans[i]!, 0);
    if (sum > free || sum < bestSum) continue;
    if (sum > bestSum || pick.length < best.length) {
      best = pick;
      bestSum = sum;
    }
  }
  return best;
}

export function packShelves(counts: number[], cols: number, draw: boolean): ShelfSlot[] {
  const spans = counts.map((c) => Math.max(1, Math.min(c, cols)));
  const waiting = counts.map((_, i) => i);
  const rows: ShelfSlot[][] = [];
  while (waiting.length) {
    const first = waiting.shift()!;
    const row: ShelfSlot[] = [{ item: first, span: spans[first]! }];
    const more = bestFill(waiting, spans, cols - spans[first]!);
    for (const i of more) {
      row.push({ item: i, span: spans[i]! });
      waiting.splice(waiting.indexOf(i), 1);
    }
    rows.push(row);
  }

  const free = (row: ShelfSlot[]) => cols - row.reduce((t, s) => t + s.span, 0);
  if (draw) {
    // The biggest gap, the later row on a tie; with no gap at all, a row of its own.
    let at = -1;
    rows.forEach((row, r) => {
      if (free(row) > 0 && (at < 0 || free(row) >= free(rows[at]!))) at = r;
    });
    if (at < 0) rows.push([{ item: 'draw', span: cols }]);
    else rows[at]!.push({ item: 'draw', span: free(rows[at]!) });
  }
  for (const row of rows) {
    const gap = free(row);
    if (gap > 0) row[row.length - 1]!.span += gap;
  }
  return rows.flat();
}
