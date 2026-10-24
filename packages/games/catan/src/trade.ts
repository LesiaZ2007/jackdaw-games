import type { Offer } from './rules';
import { RESOURCES, type Cards } from './types';

/**
 * What needs the player on their turn: counter-offers and proposals made to them, and their own
 * offers that someone has said yes to.
 */
export const waitingForYou = (offers: readonly Offer[], me: string): Offer[] =>
  offers.filter(
    (o) =>
      (o.to === me && o.from !== me) ||
      (o.from === me && Object.values(o.replies).includes('accept')),
  );

/**
 * Why a trade's shape isn't allowed, or null: each side must give at least one card (no gifts),
 * and no resource may be on both sides.
 */
export function validTrade(give: Partial<Cards>, want: Partial<Cards>): string | null {
  const g = RESOURCES.filter((r) => (give[r] ?? 0) > 0);
  const w = RESOURCES.filter((r) => (want[r] ?? 0) > 0);
  if (!g.length || !w.length) return 'Each side has to give at least one card.';
  if (g.some((r) => w.includes(r))) return 'You can’t trade a resource for the same resource.';
  return null;
}

/** Drops zero counts, so offers read cleanly. */
export const trim = (c: Partial<Cards>): Partial<Cards> =>
  Object.fromEntries(
    RESOURCES.filter((r) => (c[r] ?? 0) > 0).map((r) => [r, c[r]]),
  ) as Partial<Cards>;
