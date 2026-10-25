import type { Owner } from './board';
import type { MapDef } from './maps';
import type { RiskTableView, RiskView } from './rules';

/** Territories `pid` can see through the fog of war: their own and every neighbour of one. */
export function visibleTo(map: MapDef, owner: Owner, pid: string): Set<string> {
  const seen = new Set<string>();
  for (const t of map.territories) {
    if (owner[t.id] !== pid) continue;
    seen.add(t.id);
    for (const n of t.adj) seen.add(n);
  }
  return seen;
}

/**
 * The table as this player sees it: in the fog, their own sight (owners and armies in view, their
 * move-in and armies to place, a battle they can see) laid over the public view. Without fog, or
 * for the TV, it's the table view as it is.
 */
export function seen(t: RiskTableView, v: RiskView | null | undefined): RiskTableView {
  const f = v?.sight;
  if (!t.fog || !f) return t;
  return {
    ...t,
    owner: f.owner,
    armies: f.armies,
    toPlace: f.toPlace,
    occupy: f.occupy,
    battle: f.battle,
  };
}
