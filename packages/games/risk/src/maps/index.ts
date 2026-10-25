import type { MapDef, MapId } from './types';
import { realm } from './realm';
import { skerries } from './skerries';
import { twin } from './twin';
import { world } from './world';

export * from './types';

export const MAPS: Record<MapId, MapDef> = { world, realm, skerries, twin };

export function getMap(id: MapId): MapDef {
  return MAPS[id];
}
