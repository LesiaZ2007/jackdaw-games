import 'server-only';
import type { GameLink } from '@jackdaw/engine';
import { createAvalonLink } from '@jackdaw/game-avalon/link';
import { after } from 'next/server';
import {
  createHttpHandlers,
  createRoomRuntime,
  type RoomRuntime,
  type VapidKeys,
} from '@jackdaw/server';
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

/**
 * Keys for "your move" notifications (Web Push). Without VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY,
 * phones don't offer notifications. VAPID_SUBJECT (a mailto: or https: address for push services
 * to reach whoever runs the site) falls back to NEXT_PUBLIC_SITE_URL.
 */
export function vapidKeys(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || process.env.NEXT_PUBLIC_SITE_URL;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function getRuntime(): RoomRuntime {
  const vapid = vapidKeys();
  g.__jackdawRuntime ??= createRoomRuntime({
    storage: getStorage(),
    games,
    links: links(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    push: vapid ? { vapid } : undefined,
    // Notifications go out after the reply, so a move isn't slowed down by them.
    defer: (work) => after(work),
  });
  return g.__jackdawRuntime;
}

export const http = () => createHttpHandlers(getRuntime());
