import 'server-only';
import { createHttpHandlers, createRoomRuntime, type RoomRuntime } from '@jackdaw/server';
import { games } from './registry';
import { getStorage } from './storage';

// One runtime per server instance, so its short read cache and rate limits are shared
// between requests (and survive dev hot reloads).
const g = globalThis as typeof globalThis & { __jackdawRuntime?: RoomRuntime };

export function getRuntime(): RoomRuntime {
  g.__jackdawRuntime ??= createRoomRuntime({ storage: getStorage(), games });
  return g.__jackdawRuntime;
}

export const http = () => createHttpHandlers(getRuntime());
