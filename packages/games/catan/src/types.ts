/** The words every part of Catan shares: resources, terrain, the board. */

export type Resource = 'lumber' | 'brick' | 'wool' | 'grain' | 'ore';
export const RESOURCES: readonly Resource[] = ['lumber', 'brick', 'wool', 'grain', 'ore'];

export type Terrain = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert';

/** What each terrain produces. */
export const YIELD: Record<Terrain, Resource | null> = {
  forest: 'lumber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
  desert: null,
};

/** A handful of resource cards, by kind. */
export type Cards = Record<Resource, number>;

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
  tiles: Tile[];
  harbours: Harbour[];
}

export type DevCard = 'knight' | 'roadBuilding' | 'yearOfPlenty' | 'monopoly' | 'victoryPoint';

export const emptyCards = (): Cards => ({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 });

export const countCards = (c: Partial<Cards>): number =>
  RESOURCES.reduce((n, r) => n + (c[r] ?? 0), 0);
