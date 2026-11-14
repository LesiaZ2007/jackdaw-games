/**
 * Where each card in your hand sits. A long hand used to squeeze into one row until every card
 * was a sliver too thin to tap; now it breaks into rows, so each card always shows a strip at
 * least `MIN_STRIP` wide, and the rows are balanced (12 cards on a 7-wide phone go 6 and 6, not
 * 7 and 5).
 */

/** The narrowest strip of a card left showing, in px: a comfortable thumb. */
export const MIN_STRIP = 44;

/** How many cards fit across `width` with each one showing at least a strip. */
export function perRowFor(width: number, cardW: number): number {
  if (!(width > 0) || !(cardW > 0)) return 7;
  const strip = Math.max(MIN_STRIP, cardW * 0.46);
  return Math.max(1, Math.floor((width - cardW) / strip) + 1);
}

export interface Slot {
  /** Row, from the top. */
  r: number;
  /** Place in its row, from the left. */
  c: number;
  /** How many cards share its row. */
  rn: number;
}

/** Rows of at most `perRow`, as even as they can be, in hand order (the hand is sorted). */
export function handSlots(n: number, perRow: number): { rows: number; slots: Slot[] } {
  if (n <= 0) return { rows: 0, slots: [] };
  const rows = Math.ceil(n / Math.max(1, perRow));
  const base = Math.floor(n / rows);
  // The first `extra` rows take one more, so the shorter rows sit at the front (nearer you).
  const extra = n % rows;
  const slots: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    const rn = base + (r < extra ? 1 : 0);
    for (let c = 0; c < rn; c++) slots.push({ r, c, rn });
  }
  return { rows, slots };
}
