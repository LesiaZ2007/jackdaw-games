import type { Layout } from './geometry';
import { RESOURCES, type Board, type Cards, type HarbourKind, type Resource } from './types';

/** Where pieces may go, what they cost, and what harbours a player can use. */

/** Settlements and cities by corner. */
export type Buildings = Record<string, { owner: string; city: boolean }>;
/** Roads by edge: who owns each. */
export type Roads = Record<string, string>;

export type Piece = 'road' | 'settlement' | 'city';

export const COSTS: Record<Piece | 'dev', Partial<Cards>> = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  dev: { ore: 1, wool: 1, grain: 1 },
};

/** Each player's supply. */
export const PIECES: Record<Piece, number> = { road: 15, settlement: 5, city: 4 };

export const canAfford = (hand: Cards, cost: Partial<Cards>): boolean =>
  RESOURCES.every((r) => hand[r] >= (cost[r] ?? 0));

/** What a hand is short of for a cost. */
export function missing(hand: Cards, cost: Partial<Cards>): Partial<Cards> {
  const out: Partial<Cards> = {};
  for (const r of RESOURCES) {
    const short = (cost[r] ?? 0) - hand[r];
    if (short > 0) out[r] = short;
  }
  return out;
}

/** Nobody has built on this corner or any corner next to it. */
export const distanceOk = (L: Layout, b: Buildings, corner: string): boolean =>
  !b[corner] && L.corners[corner]!.corners.every((n) => !b[n]);

const touchesOwnRoad = (L: Layout, r: Roads, pid: string, corner: string) =>
  L.corners[corner]!.edges.some((e) => r[e] === pid);

/** Corners `pid` may settle: in setup anywhere the distance rule allows, later on their road. */
export function settlementSpots(
  L: Layout,
  b: Buildings,
  r: Roads,
  pid: string,
  setup: boolean,
): string[] {
  return L.cornerIds.filter((c) => distanceOk(L, b, c) && (setup || touchesOwnRoad(L, r, pid, c)));
}

/**
 * Edges `pid` may build a road on. In setup (`from` given) only beside that settlement; otherwise
 * touching their building, or their road at a corner nobody else has built on.
 */
export function roadSpots(L: Layout, b: Buildings, r: Roads, pid: string, from?: string): string[] {
  if (from) return L.corners[from]!.edges.filter((e) => !r[e]);
  const reaches = (corner: string) => {
    const here = b[corner];
    if (here) return here.owner === pid;
    return touchesOwnRoad(L, r, pid, corner);
  };
  return L.edgeIds.filter((e) => {
    if (r[e]) return false;
    const { a, b: z } = L.edges[e]!;
    return reaches(a) || reaches(z);
  });
}

export const citySpots = (b: Buildings, pid: string): string[] =>
  Object.keys(b).filter((c) => b[c]!.owner === pid && !b[c]!.city);

export function piecesLeft(b: Buildings, r: Roads, pid: string): Record<Piece, number> {
  const mine = Object.values(b).filter((x) => x.owner === pid);
  return {
    road: PIECES.road - Object.values(r).filter((o) => o === pid).length,
    settlement: PIECES.settlement - mine.filter((x) => !x.city).length,
    city: PIECES.city - mine.filter((x) => x.city).length,
  };
}

/** Harbours `pid` has built beside. */
export function harboursOf(L: Layout, board: Board, b: Buildings, pid: string): HarbourKind[] {
  return board.harbours
    .filter((h) => {
      const e = L.edges[h.edge]!;
      return b[e.a]?.owner === pid || b[e.b]?.owner === pid;
    })
    .map((h) => h.kind);
}

/** How many of `res` the bank wants for one card: 2 at its harbour, 3 at a generic one, else 4. */
export const bankRatio = (kinds: HarbourKind[], res: Resource): 2 | 3 | 4 =>
  kinds.includes(res) ? 2 : kinds.includes('any') ? 3 : 4;
