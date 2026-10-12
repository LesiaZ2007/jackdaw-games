import { Avatar } from '@jackdaw/engine';

/**
 * Who this device is, kept in localStorage. No accounts: a random token made on first visit
 * identifies the device to every lobby (the server stores only its hash), and the last name and
 * avatar are remembered so returning friends skip the prompt.
 */

export const KEYS = {
  token: 'jackdaw:token',
  name: 'jackdaw:name',
  avatar: 'jackdaw:avatar',
  display: 'jackdaw:display',
  seat: (code: string) => `jackdaw:seat:${code}`,
} as const;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage when it works; otherwise an in-memory stand-in (private mode, blocked storage). */
export function deviceStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__jackdaw_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    const g = globalThis as typeof globalThis & { __jackdawMemoryStore?: Map<string, string> };
    const map = (g.__jackdawMemoryStore ??= new Map());
    return {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  }
}

/** A URL-safe random string with `bytes` bytes of entropy. */
export function randomToken(bytes = 24): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** This device's player token, created once and then reused for every lobby. */
export function getDeviceToken(store: KeyValueStore = deviceStore()): string {
  const existing = store.getItem(KEYS.token);
  if (existing && TOKEN_PATTERN.test(existing)) return existing;
  const token = randomToken();
  store.setItem(KEYS.token, token);
  return token;
}

/** A stable id for this device when it acts as a TV display (counted, never seated). */
export function getDisplayId(store: KeyValueStore = deviceStore()): string {
  const existing = store.getItem(KEYS.display);
  if (existing && /^[A-Za-z0-9_-]{4,64}$/.test(existing)) return existing;
  const id = randomToken(9);
  store.setItem(KEYS.display, id);
  return id;
}

export function rememberedName(store: KeyValueStore = deviceStore()): string | null {
  const name = store.getItem(KEYS.name)?.trim();
  return name ? name.slice(0, 20) : null;
}

export function rememberName(name: string, store: KeyValueStore = deviceStore()) {
  store.setItem(KEYS.name, name.trim().slice(0, 20));
}

export function rememberedAvatar(store: KeyValueStore = deviceStore()): Avatar | null {
  try {
    const parsed = Avatar.safeParse(JSON.parse(store.getItem(KEYS.avatar) ?? 'null'));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function rememberAvatar(avatar: Avatar, store: KeyValueStore = deviceStore()) {
  store.setItem(KEYS.avatar, JSON.stringify(avatar));
}

/**
 * The player id this device last held in a lobby. Lets the UI tell "never joined" (show the join
 * form) apart from "was removed" (the server no longer knows this device: show a removed state).
 */
export function rememberedSeat(code: string, store: KeyValueStore = deviceStore()): string | null {
  return store.getItem(KEYS.seat(code));
}

export function rememberSeat(code: string, playerId: string, store: KeyValueStore = deviceStore()) {
  store.setItem(KEYS.seat(code), playerId);
}

export function forgetSeat(code: string, store: KeyValueStore = deviceStore()) {
  store.removeItem(KEYS.seat(code));
}
