import type { Rng } from '@jackdaw/engine';
import { HARBOUR_KINDS, TILE_COUNTS, TOKENS, redsTouch } from './board';
import type { Buildings, Roads } from './build';
import { harbourSlots, layout, type Layout } from './geometry';
import type { Board, Cards, Size, Terrain, Tile } from './types';

/**
 * Seafarers (2026-11-08): the island sits in open sea with small islands across a strait. Ships
 * (1 lumber, 1 wool) sail along sea edges as roads run along land; the end ship of a line may sail
 * on once a turn; a trade route of roads and ships counts for Longest Road, switching between them
 * only at your own settlement or city. Gold fields pay any resource you choose. The pirate, moved
 * on a 7 or a knight instead of the robber, stops ships beside it and robs their owners. Your
 * first settlement on each small island is worth 2 more points. Opening settlements go on the
 * main island. Played to the lobby's target plus 4.
 */

export const SHIP_COST: Partial<Cards> = { lumber: 1, wool: 1 };
export const SHIPS_EACH = 15;
export const ISLAND_BONUS = 2;

/**
 * The sea maps, row by row as `layout` lays them out (rows centred): L the main island, I a
 * small island, G a gold field, S sea. The main island is the classic (or big) island's shape.
 */
const TEMPLATES: Record<'seaClassic' | 'seaBig', string[]> = {
  seaClassic: ['LLLSIIS', 'LLLLSIGS', 'LLLLLSSSI', 'LLLLSSSG', 'LLLSIIS'],
  seaBig: ['LLLSIISS', 'LLLLSIGSS', 'LLLLLSSSIS', 'LLLLLLSSIGS', 'LLLLLSSSIS', 'LLLLSGISS', 'LLLSIISS'],
};

const ISLAND_TERRAINS: Record<Size, Terrain[]> = {
  classic: ['forest', 'pasture', 'fields', 'hills', 'mountains', 'pasture'],
  big: ['forest', 'forest', 'pasture', 'pasture', 'fields', 'hills', 'hills', 'mountains', 'mountains'],
};
const ISLAND_TOKENS: Record<Size, number[]> = {
  classic: [3, 4, 5, 6, 8, 9, 10, 11],
  big: [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 4, 10],
};

export const seaKey = (size: Size): 'seaClassic' | 'seaBig' => (size === 'big' ? 'seaBig' : 'seaClassic');

export const isSea = (b: Pick<Board, 'tiles'>, t: number) => b.tiles[t]!.terrain === 'sea';
export const isLand = (b: Pick<Board, 'tiles'>, t: number) => !isSea(b, t);

export function makeSeaBoard(size: Size, rng: Rng): Board {
  const key = seaKey(size);
  const L = layout(key);
  const cells = TEMPLATES[key].join('');
  const main = rng.shuffle(
    Object.entries(TILE_COUNTS[size]).flatMap(([t, n]) => Array<Terrain>(n).fill(t as Terrain)),
  );
  const isle = rng.shuffle(ISLAND_TERRAINS[size]);
  const tiles: Tile[] = [...cells].map((c) => ({
    terrain: c === 'S' ? 'sea' : c === 'G' ? 'gold' : c === 'L' ? main.pop()! : isle.pop()!,
    number: null,
  }));
  const numbered = tiles.flatMap((t, i) => (t.terrain === 'sea' || t.terrain === 'desert' ? [] : [i]));
  const pool = [...TOKENS[size], ...ISLAND_TOKENS[size]];
  let board: Board = { size, map: key, tiles, harbours: [] };
  for (let tries = 0; tries < 500; tries++) {
    const tokens = rng.shuffle(pool);
    const next = tiles.map((t) => ({ ...t }));
    numbered.forEach((i, k) => (next[i]!.number = tokens[k]!));
    board = { size, map: key, tiles: next, harbours: [] };
    if (!redsTouch(board)) break;
  }
  // Harbours round the main island's coast, spread evenly by angle from its middle.
  const home = islands(board);
  const mainTiles = board.tiles.flatMap((_, i) => (home[i] === 0 ? [i] : []));
  const centre = {
    x: mainTiles.reduce((n, i) => n + L.tiles[i]!.x, 0) / mainTiles.length,
    y: mainTiles.reduce((n, i) => n + L.tiles[i]!.y, 0) / mainTiles.length,
  };
  const slots = harbourSlots(
    L.edges,
    L.corners,
    HARBOUR_KINDS[size].length,
    (e) => e.tiles.some((t) => home[t] === 0) && (e.tiles.length === 1 || e.tiles.some((t) => isSea(board, t))),
    centre,
  );
  const kinds = rng.shuffle(HARBOUR_KINDS[size]);
  return { ...board, harbours: slots.map((edge, i) => ({ edge, kind: kinds[i]! })) };
}

const islandCache = new WeakMap<object, number[]>();

/** Each tile's island: 0 for the main island (tile 0's), 1, 2… for the small ones, -1 at sea. */
export function islands(board: Board): number[] {
  const hit = islandCache.get(board.tiles);
  if (hit) return hit;
  const L = layout(board.map ?? board.size);
  const out = board.tiles.map(() => -2);
  let next = 0;
  board.tiles.forEach((_, start) => {
    if (out[start] !== -2) return;
    if (isSea(board, start)) {
      out[start] = -1;
      return;
    }
    const id = next++;
    const stack = [start];
    out[start] = id;
    while (stack.length) {
      const t = stack.pop()!;
      for (const n of L.tiles[t]!.neighbours)
        if (out[n] === -2 && isLand(board, n)) {
          out[n] = id;
          stack.push(n);
        }
    }
  });
  islandCache.set(board.tiles, out);
  return out;
}

/** The island a corner stands on (-1 if it touches only sea). */
export function islandOf(L: Layout, board: Board, corner: string): number {
  const is = islands(board);
  for (const t of L.corners[corner]!.tiles) if (is[t]! >= 0) return is[t]!;
  return -1;
}

export interface SeaState {
  ships: Roads;
  /** The pirate's sea tile, or null before it first sails in. */
  pirate: number | null;
  /** Islands each player has taken the bonus for. */
  bonus: Record<string, number[]>;
  /** Ships built this turn (they can't sail on yet), and whether a ship has sailed this turn. */
  built: string[];
  moved: boolean;
}

export const newSea = (players: string[]): SeaState => ({
  ships: {},
  pirate: null,
  bonus: Object.fromEntries(players.map((p) => [p, []])),
  built: [],
  moved: false,
});

type Placed = {
  board: Board;
  buildings: Buildings;
  roads: Roads;
  sea?: { ships: Roads; pirate: number | null } | null;
};

const nearPirate = (L: Layout, s: Placed, e: string) =>
  s.sea?.pirate != null && L.tiles[s.sea.pirate]!.edges.includes(e);

/** Edges `pid` may build a ship on (`from`: beside that corner only, in the opening). */
export function shipSpots(L: Layout, s: Placed, pid: string, from?: string): string[] {
  const ships = s.sea?.ships ?? {};
  const free = (e: string) =>
    !s.roads[e] &&
    !ships[e] &&
    L.edges[e]!.tiles.some((t) => isSea(s.board, t)) &&
    !nearPirate(L, s, e);
  if (from) return L.corners[from]!.edges.filter(free);
  const reaches = (c: string) => {
    const b = s.buildings[c];
    if (b) return b.owner === pid;
    return L.corners[c]!.edges.some((f) => ships[f] === pid);
  };
  return L.edgeIds.filter((e) => free(e) && (reaches(L.edges[e]!.a) || reaches(L.edges[e]!.b)));
}

/** A ship at the open end of its line: one of its corners has neither your building nor another ship of yours. */
export function openShip(L: Layout, s: Placed, e: string): boolean {
  const ships = s.sea?.ships ?? {};
  const owner = ships[e];
  if (!owner) return false;
  const loose = (c: string) =>
    s.buildings[c]?.owner !== owner && !L.corners[c]!.edges.some((f) => f !== e && ships[f] === owner);
  return loose(L.edges[e]!.a) || loose(L.edges[e]!.b);
}

/** Ships `pid` may sail this turn, and where each may go. */
export function sailMoves(
  L: Layout,
  s: Placed & { sea?: { ships: Roads; pirate: number | null; built?: string[]; moved?: boolean } | null },
  pid: string,
): Record<string, string[]> {
  const sea = s.sea;
  if (!sea || sea.moved) return {};
  const out: Record<string, string[]> = {};
  for (const [e, o] of Object.entries(sea.ships)) {
    if (o !== pid || sea.built?.includes(e) || nearPirate(L, s, e) || !openShip(L, s, e)) continue;
    const ships = { ...sea.ships };
    delete ships[e];
    const to = shipSpots(L, { ...s, sea: { ...sea, ships } }, pid).filter((x) => x !== e);
    if (to.length) out[e] = to;
  }
  return out;
}

export const shipsLeft = (sea: Pick<SeaState, 'ships'>, pid: string): number =>
  SHIPS_EACH - Object.values(sea.ships).filter((o) => o === pid).length;

/** Sea tiles the pirate may move to. */
export const pirateSpots = (board: Board, pirate: number | null): number[] =>
  board.tiles.flatMap((_, i) => (isSea(board, i) && i !== pirate ? [i] : []));

/** Players with a ship beside a sea tile, other than `who`. */
export function shipOwnersAt(L: Layout, ships: Roads, tile: number, who: string): string[] {
  return [...new Set(L.tiles[tile]!.edges.map((e) => ships[e]).filter((p): p is string => !!p && p !== who))];
}

export const seaPoints = (sea: Pick<SeaState, 'bonus'>, pid: string): number =>
  ISLAND_BONUS * (sea.bonus[pid]?.length ?? 0);
