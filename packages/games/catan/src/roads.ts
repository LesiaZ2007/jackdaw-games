import type { Buildings, Roads } from './build';
import type { Layout } from './geometry';

/**
 * Longest Road: the longest trail of one player's roads, each road counted once, never passing
 * through a corner where someone else has built (a trail may end there). With Seafarers, ships
 * count too, and a trail switches between roads and ships only at the player's own building.
 */
export function longestRoad(
  L: Layout,
  b: Buildings,
  r: Roads,
  pid: string,
  ships: Roads = {},
): number {
  const mine = new Map<string, 'road' | 'ship'>();
  for (const e of Object.keys(r)) if (r[e] === pid) mine.set(e, 'road');
  for (const e of Object.keys(ships)) if (ships[e] === pid) mine.set(e, 'ship');
  if (!mine.size) return 0;
  const blocked = (corner: string) => !!b[corner] && b[corner].owner !== pid;
  const walk = (corner: string, used: Set<string>, last: 'road' | 'ship' | null): number => {
    let best = 0;
    for (const e of L.corners[corner]!.edges) {
      const kind = mine.get(e);
      if (!kind || used.has(e)) continue;
      if (last && kind !== last && b[corner]?.owner !== pid) continue;
      const { a, b: z } = L.edges[e]!;
      const next = a === corner ? z : a;
      used.add(e);
      best = Math.max(best, 1 + (blocked(next) ? 0 : walk(next, used, kind)));
      used.delete(e);
    }
    return best;
  };
  const starts = new Set([...mine.keys()].flatMap((e) => [L.edges[e]!.a, L.edges[e]!.b]));
  let best = 0;
  for (const c of starts) best = Math.max(best, walk(c, new Set(), null));
  return best;
}

/**
 * Who holds the card now. The holder keeps it while still tied for longest (at 5 or more);
 * otherwise it goes to the single longest player with 5 or more, or is set aside (null).
 */
export function awardRoad(holder: string | null, lengths: Record<string, number>): string | null {
  const best = Math.max(0, ...Object.values(lengths));
  if (holder && (lengths[holder] ?? 0) >= 5 && (lengths[holder] ?? 0) >= best) return holder;
  const leaders = Object.keys(lengths).filter((p) => lengths[p] === best);
  return best >= 5 && leaders.length === 1 ? leaders[0]! : null;
}
