import type { MapDef, MapId } from './types';
import { world } from './world';

export * from './types';

export const MAPS: Record<MapId, MapDef> = { world, realm: world };

export function getMap(id: MapId): MapDef {
  return MAPS[id];
}
