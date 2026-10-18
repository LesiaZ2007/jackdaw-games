import type { MapDef, MapId } from './types';
import { realm } from './realm';
import { world } from './world';

export * from './types';

export const MAPS: Record<MapId, MapDef> = { world, realm };

export function getMap(id: MapId): MapDef {
  return MAPS[id];
}
