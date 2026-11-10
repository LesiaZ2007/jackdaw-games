import { rankOf, type Card } from './cards';
import {
  canGoUp,
  fits,
  movesFor,
  viewLayout,
  type Move,
  type SeatView,
  type SolitaireTableView,
  type Source,
} from './rules';

/**
 * Where a tapped card goes: up to the middle if it can (only a column's bottom card or the
 * waste's), otherwise onto the first column it fits, a column with cards before an empty one.
 */
export function moveFor(
  seat: SeatView,
  foundations: SolitaireTableView['foundations'],
  from: Source,
  card: Card,
): Move | null {
  const top = from === 'waste' ? seat.waste.at(-1) : seat.cols[from]!.up.at(-1);
  if (top === card && canGoUp(foundations, card)) return { type: 'up', from, card };
  const order = seat.cols
    .map((col, to) => ({ col, to }))
    .filter(({ to }) => to !== from)
    .sort((a, b) => Number(a.col.up.length === 0) - Number(b.col.up.length === 0));
  for (const { col, to } of order) {
    if (!fits(col, card)) continue;
    // A king already heading a column of its own gains nothing from moving to another.
    if (from !== 'waste' && rankOf(card) === 13) {
      const src = seat.cols[from]!;
      if (src.down === 0 && src.up[0] === card) continue;
    }
    return { type: 'move', from, card, to };
  }
  return null;
}

/** The move a hint points at: anything going up first, then turning a covered card over. */
export function hintFor(seat: SeatView, t: SolitaireTableView): Move | 'stock' | null {
  const moves = movesFor(viewLayout(seat), t.foundations);
  const best =
    moves.find((m) => m.type === 'up') ??
    moves.find((m) => m.type === 'move' && m.from !== 'waste') ??
    moves[0];
  if (best) return best;
  return seat.stuck ? null : 'stock';
}
