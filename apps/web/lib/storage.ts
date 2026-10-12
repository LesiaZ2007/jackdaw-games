import 'server-only';
import { storageFromEnv, type RoomStorage } from '@jackdaw/server';

// One storage client per server process. In dev the memory store must survive hot reloads,
// so it lives on globalThis.
const g = globalThis as typeof globalThis & { __jackdawStorage?: RoomStorage };

export function getStorage(): RoomStorage {
  g.__jackdawStorage ??= storageFromEnv(process.env);
  return g.__jackdawStorage;
}
