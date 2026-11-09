import type { MapKey } from './geometry';

/** The words every part of Catan shares: resources, terrain, the board. */

export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore';
export const RESOURCES: readonly Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];

/** Cities & Knights: what a city on forest, pasture or mountains makes besides its resource. */
export type Commodity = 'paper' | 'cloth' | 'coin';
export const COMMODITIES: readonly Commodity[] = ['paper', 'cloth', 'coin'];

/** Any card in a hand: a resource, or (Cities & Knights) a commodity. */
export type Card = Resource | Commodity;
export const CARDS: readonly Card[] = [...RESOURCES, ...COMMODITIES];
export const isCommodity = (c: Card): c is Commodity => (COMMODITIES as string[]).includes(c);

export type Terrain =
  | 'forest'
  | 'pasture'
  | 'fields'
  | 'hills'
  | 'mountains'
  | 'desert'
  /** Seafarers: open water, and gold fields that pay any resource you like. */
  | 'sea'
  | 'gold';

/** What each terrain produces. */
export const YIELD: Record<Terrain, Resource | null> = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
  desert: null,
  sea: null,
  gold: null,
};

/** Cities & Knights: the commodity a city takes in place of its second resource. */
export const GOOD: Partial<Record<Terrain, Commodity>> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
};

/** A handful of cards, by kind (commodities stay at 0 outside Cities & Knights). */
export type Cards = Record<Card, number>;

/** The classic island (3–4 players) or the big one (5–6). */
export type Size = 'classic' | 'big';

/** A 2:1 harbour for one resource, or a 3:1 harbour for any. */
export type HarbourKind = Resource | 'any';

export interface Tile {
  terrain: Terrain;
  /** The number token; null on the desert. */
  number: number | null;
}

export interface Harbour {
  /** The coastal edge it sits on; it serves that edge's two corners. */
  edge: string;
  kind: HarbourKind;
}

/** One game's island: tiles in the layout's order, and its harbours. */
export interface Board {
  size: Size;
  /** Seafarers: the sea map this board is laid on (absent: the plain island of `size`). */
  map?: MapKey;
  tiles: Tile[];
  harbours: Harbour[];
}

export type DevCard = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint';

export const emptyCards = (): Cards => ({
  lumber: 0,
  brick: 0,
  wool: 0,
  grain: 0,
  ore: 0,
  paper: 0,
  cloth: 0,
  coin: 0,
});

/** A full hand from one that may lack kinds (games saved before commodities existed). */
export const fullCards = (c: Partial<Cards>): Cards => ({ ...emptyCards(), ...c });

export const countCards = (c: Partial<Cards>): number => CARDS.reduce((n, r) => n + (c[r] ?? 0), 0);
