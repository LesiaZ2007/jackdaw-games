import { RESOURCES, type Cards } from './types';

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
