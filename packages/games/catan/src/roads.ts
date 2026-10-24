import type { Buildings, Roads } from './build';
import type { Layout } from './geometry';

/**
 * Longest Road: the longest trail of one player's roads, each road counted once, never passing
 * through a corner where someone else has built (a trail may end there).
 */
export function longestRoad(L: Layout, b: Buildings, r: Roads, pid: string): number {
  const mine = new Set(Object.keys(r).filter((e) => r[e] === pid));
  if (!mine.size) return 0;
  const blocked = (corner: string) => !!b[corner] && b[corner].owner !== pid;
  const walk = (corner: string, used: Set<string>): number => {
    let best = 0;
    for (const e of L.corners[corner]!.edges) {
      if (!mine.has(e) || used.has(e)) continue;
      const { a, b: z } = L.edges[e]!;
      const next = a === corner ? z : a;
      used.add(e);
      best = Math.max(best, 1 + (blocked(next) ? 0 : walk(next, used)));
      used.delete(e);
    }
    return best;
  };
  const starts = new Set([...mine].flatMap((e) => [L.edges[e]!.a, L.edges[e]!.b]));
  let best = 0;
  for (const c of starts) best = Math.max(best, walk(c, new Set()));
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
