import type { MapDef } from './maps';

/** Who holds each territory: a player id, or the neutral army in a two-player game. */
export type Owner = Record<string, string>;
export type Armies = Record<string, number>;

export const NEUTRAL = 'neutral';

/** Armies each player starts with, by number of players (the neutral gets the 2-player count). */
export const STARTING_ARMIES: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

const neighbours = (map: MapDef, t: string) => map.territories.find((x) => x.id === t)?.adj ?? [];

export function territoriesOf(owner: Owner, pid: string): string[] {
  return Object.keys(owner).filter((t) => owner[t] === pid);
}

/** Continents where `pid` holds every territory. */
export function continentsHeld(map: MapDef, owner: Owner, pid: string): string[] {
  return map.continents
    .filter((c) => map.territories.every((t) => t.continent !== c.id || owner[t.id] === pid))
    .map((c) => c.id);
}

/** Armies at the start of a turn, before cards: territories / 3 (at least 3) plus bonuses. */
export function reinforcementCount(map: MapDef, owner: Owner, pid: string): number {
  const bonus = continentsHeld(map, owner, pid).reduce(
    (sum, c) => sum + map.continents.find((x) => x.id === c)!.bonus,
    0,
  );
  return Math.max(3, Math.floor(territoriesOf(owner, pid).length / 3)) + bonus;
}

/** Territories `from` can attack: neighbours held by anyone else, if `from` has 2+ armies. */
export function attackTargets(
  map: MapDef,
  owner: Owner,
  armies: Armies,
  pid: string,
  from: string,
): string[] {
  if (owner[from] !== pid || (armies[from] ?? 0) < 2) return [];
  return neighbours(map, from).filter((n) => owner[n] !== pid);
}

/** Your territories joined to `from` through your own territories (not counting `from`). */
export function reachable(map: MapDef, owner: Owner, pid: string, from: string): string[] {
  if (owner[from] !== pid) return [];
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    for (const n of neighbours(map, queue.shift()!)) {
      if (!seen.has(n) && owner[n] === pid) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  seen.delete(from);
  return [...seen];
}
