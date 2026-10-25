/** Which board a game is played on. */
export type MapId = 'world' | 'realm' | 'skerries' | 'twin';

/** A heraldic tincture for a continent's wash (the UI maps it to a token). */
export type Tint = 'gules' | 'azure' | 'vert' | 'sable' | 'purpure' | 'tenne';

export interface Continent {
  id: string;
  name: string;
  /** Extra armies each turn for holding every territory in it. */
  bonus: number;
  tint: Tint;
}

export interface Territory {
  id: string;
  name: string;
  continent: string;
  /** SVG outline in the map's viewBox units. */
  path: string;
  /** Where the army roundel sits. */
  label: [number, number];
  /** Neighbours, by id (sea lanes included). */
  adj: string[];
}

/**
 * A board: the graph the rules play on, plus the outlines the screens draw. The rules only read
 * `continents`, `territories[].continent/adj` and `missionPairs`.
 */
export interface MapDef {
  id: MapId;
  name: string;
  viewBox: [number, number];
  continents: Continent[];
  territories: Territory[];
  /** Sea crossings, drawn as dashed lines (they're in `adj` too). */
  lanes: [string, string][];
  /** Continent goals for secret missions; `'any'` asks for a third continent of your choice. */
  missionPairs: [string, string, 'any'?][];
  /** Decorative sea and coast path data. */
  sea?: string;
  /** Each continent's outline, by continent id (drawn as the heavier rule between continents). */
  regions?: Record<string, string>;
}
