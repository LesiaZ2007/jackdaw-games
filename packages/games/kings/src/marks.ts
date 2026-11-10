import type { Puzzle } from './puzzle';

/** What a square holds on the player's board: nothing, a cross they ruled out, or a king. */
export type Mark = 0 | 1 | 2;

/**
 * Squares a king rules out: its row, its column, its color and the eight round it. Drawn faintly
 * when Auto-cross is on; never stored, so taking the king back clears them.
 */
export function ruledOut(p: Puzzle, marks: readonly Mark[]): boolean[] {
  const { size, regions } = p;
  const out = Array<boolean>(size * size).fill(false);
  marks.forEach((m, k) => {
    if (m !== 2) return;
    const kr = Math.floor(k / size);
    const kc = k % size;
    for (let i = 0; i < size * size; i++) {
      if (i === k) continue;
      const r = Math.floor(i / size);
      const c = i % size;
      if (
        r === kr ||
        c === kc ||
        regions[i] === regions[k] ||
        (Math.abs(r - kr) <= 1 && Math.abs(c - kc) <= 1)
      )
        out[i] = true;
    }
  });
  return out;
}

/** Kings that break a rule: sharing a row, column or color, or touching another king. */
export function clashes(p: Puzzle, marks: readonly Mark[]): Set<number> {
  const { size, regions } = p;
  const kings = marks.flatMap((m, i) => (m === 2 ? [i] : []));
  const bad = new Set<number>();
  for (const a of kings)
    for (const b of kings) {
      if (a >= b) continue;
      const ar = Math.floor(a / size);
      const br = Math.floor(b / size);
      const ac = a % size;
      const bc = b % size;
      if (
        ar === br ||
        ac === bc ||
        regions[a] === regions[b] ||
        (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
      ) {
        bad.add(a);
        bad.add(b);
      }
    }
  return bad;
}

/** Heavy ink on the sides of a square that border another color (or the edge of the board). */
export function edges(p: Puzzle, i: number) {
  const { size, regions } = p;
  const r = Math.floor(i / size);
  const c = i % size;
  const g = regions[i];
  return {
    t: r === 0 || regions[i - size] !== g,
    b: r === size - 1 || regions[i + size] !== g,
    l: c === 0 || regions[i - 1] !== g,
    r: c === size - 1 || regions[i + 1] !== g,
  };
}

/** A board with only the answer's kings on it, for the results. */
export function answerMarks(p: Puzzle, kings: readonly number[]): Mark[] {
  const out = Array<Mark>(p.size * p.size).fill(0);
  for (const k of kings) out[k] = 2;
  return out;
}
