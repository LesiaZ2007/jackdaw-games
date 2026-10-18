import type { Continent, MapDef, MapId } from './types';

export interface MapSource {
  id: MapId;
  name: string;
  viewBox: [number, number];
  continents: Continent[];
  /** `[id, name, continent]`, in the order cards are made. */
  territories: [string, string, string][];
  /** Every border once, by land or sea. */
  borders: [string, string][];
  /** The borders crossed by sea (drawn dashed). */
  lanes: [string, string][];
  missionPairs: MapDef['missionPairs'];
  /** Outlines and label points from `scripts/build-map.mjs`. */
  shapes: Record<string, { path: string; label: [number, number] }>;
  sea?: string;
}

/** Builds a `MapDef` from a border list, so neighbours always go both ways. */
export function defineMap(src: MapSource): MapDef {
  const adj = new Map<string, string[]>(src.territories.map(([id]) => [id, []]));
  for (const [a, b] of src.borders) {
    if (!adj.has(a) || !adj.has(b)) throw new Error(`${src.id}: unknown border ${a}–${b}`);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  return {
    id: src.id,
    name: src.name,
    viewBox: src.viewBox,
    continents: src.continents,
    territories: src.territories.map(([id, name, continent]) => ({
      id,
      name,
      continent,
      path: src.shapes[id]?.path ?? '',
      label: src.shapes[id]?.label ?? [0, 0],
      adj: adj.get(id)!,
    })),
    lanes: src.lanes,
    missionPairs: src.missionPairs,
    sea: src.sea,
  };
}
