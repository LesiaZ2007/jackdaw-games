import { citySpots, roadSpots, settlementSpots, type Buildings, type Roads } from './build';
import { knightSpots, occupied, type Knight } from './ck';
import { layout, type Layout } from './geometry';
import { islandOf, isLand, shipSpots } from './sea';
import type { Board, Size } from './types';

/**
 * Where each piece may go, for every expansion, from facts the table view shares with the
 * state (the rules, the bot and the screens all ask here).
 */

export interface Placed {
  size: Size;
  board: Board;
  buildings: Buildings;
  roads: Roads;
  ck?: { knights: Record<string, Knight>; walls: string[] } | null;
  sea?: { ships: Roads; pirate: number | null } | null;
}

export const layoutOf = (s: { size: Size; board?: Pick<Board, 'map'> }): Layout =>
  layout(s.board?.map ?? s.size);

const landEdge = (L: Layout, s: Placed, e: string) =>
  L.edges[e]!.tiles.some((t) => isLand(s.board, t));
const landCorner = (L: Layout, s: Placed, c: string) =>
  L.corners[c]!.tiles.some((t) => isLand(s.board, t));

/** Edges for a road: on land, free of ships, through nobody else's building or knight. */
export function roadSpotsOf(s: Placed, pid: string, from?: string): string[] {
  const L = layoutOf(s);
  const ships = s.sea?.ships ?? {};
  return roadSpots(L, occupied(s), s.roads, pid, from).filter(
    (e) => !ships[e] && landEdge(L, s, e),
  );
}

/** Corners to settle: the distance rule, on land, not under a knight, on your road or ship. In
 * the opening on a sea map, only the main island. */
export function settleSpotsOf(s: Placed, pid: string, setup: boolean): string[] {
  const L = layoutOf(s);
  const ways = s.sea ? { ...s.sea.ships, ...s.roads } : s.roads;
  return settlementSpots(L, s.buildings, ways, pid, setup).filter(
    (c) =>
      landCorner(L, s, c) &&
      !s.ck?.knights[c] &&
      (!setup || !s.sea || islandOf(L, s.board, c) === 0),
  );
}

export const citySpotsOf = (s: Placed, pid: string): string[] => citySpots(s.buildings, pid);

export const shipSpotsOf = (s: Placed, pid: string, from?: string): string[] =>
  s.sea ? shipSpots(layoutOf(s), s, pid, from) : [];

export const knightSpotsOf = (s: Placed, pid: string): string[] =>
  s.ck ? knightSpots(layoutOf(s), s, pid) : [];

export const wallSpotsOf = (s: Placed, pid: string): string[] =>
  s.ck
    ? Object.keys(s.buildings).filter(
        (c) => s.buildings[c]!.owner === pid && s.buildings[c]!.city && !s.ck!.walls.includes(c),
      )
    : [];
