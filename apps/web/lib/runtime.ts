import 'server-only';
import type { GameLink } from '@jackdaw/engine';
import { createAvalonLink } from '@jackdaw/game-avalon/link';
import { createHttpHandlers, createRoomRuntime, type RoomRuntime } from '@jackdaw/server';
import { games } from './registry';
import { getStorage } from './storage';

// One runtime per server instance, so its short read cache and rate limits are shared
// between requests (and survive dev hot reloads).
const g = globalThis as typeof globalThis & { __jackdawRuntime?: RoomRuntime };

/**
 * Games played in another app (docs/avalon/LINK.md). Each needs its app's URL and the shared
 * JACKDAW_LINK_SECRET; without them, Start says the game isn't set up yet.
 */
function links(): Record<string, GameLink> {
  const secret = process.env.JACKDAW_LINK_SECRET;
  const avalonUrl = process.env.AVALON_URL;
  return secret && avalonUrl
    ? { avalon: createAvalonLink({ baseUrl: avalonUrl, secret }) as GameLink }
    : {};
}

export function getRuntime(): RoomRuntime {
  g.__jackdawRuntime ??= createRoomRuntime({
    storage: getStorage(),
    games,
    links: links(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return g.__jackdawRuntime;
}

export const http = () => createHttpHandlers(getRuntime());
