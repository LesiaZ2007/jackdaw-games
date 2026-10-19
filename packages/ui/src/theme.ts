'use client';

import { useSyncExternalStore } from 'react';

/**
 * Day or dark, as chosen in the Jackdaw shell. A manual choice lives on `<html data-theme>`
 * (and in localStorage, applied before first paint by the app layout); with no choice the device
 * setting decides. Every game follows this: a game with its own looks maps day and dark onto
 * them (Avalon: day is its Parchment look, dark is its Night look) by calling `useTheme()`.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jackdaw:theme';
const QUERY = '(prefers-color-scheme: dark)';

function read(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return matchMedia(QUERY).matches ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  const media = matchMedia(QUERY);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

/** The look in force right now; re-renders when the player or the device switches it. */
export function useTheme(): Theme {
  // The server can't know the device's choice; it renders day and the client corrects it.
  return useSyncExternalStore(subscribe, read, () => 'light');
}

/** Switch every Jackdaw screen (and every game) to this look, and remember it on this device. */
export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // private mode: the choice just won't be remembered
  }
}

/**
 * A game's own look on this device, for a game that doesn't follow Jackdaw's day and dark
 * (`GameUi.look`: Avalon is Parchment unless you switch it to Night in its lobby). Kept per
 * game, so switching Avalon to Night leaves Jackdaw's own look alone.
 */
const gameKey = (id: string) => `jackdaw:look:${id}`;
const GAME_LOOK_EVENT = 'jackdaw:look';

function readGameLook(id: string, fallback: Theme): Theme {
  try {
    const v = localStorage.getItem(gameKey(id));
    return v === 'light' || v === 'dark' ? v : fallback;
  } catch {
    return fallback;
  }
}

function subscribeGameLook(onChange: () => void) {
  window.addEventListener(GAME_LOOK_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(GAME_LOOK_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** This game's look on this device: what the player picked, or the game's default. */
export function useGameLook(id: string, fallback: Theme): Theme {
  return useSyncExternalStore(
    subscribeGameLook,
    () => readGameLook(id, fallback),
    () => fallback,
  );
}

/** Pick this game's look on this device (and remember it). */
export function setGameLook(id: string, theme: Theme) {
  try {
    localStorage.setItem(gameKey(id), theme);
  } catch {
    // private mode: it lasts until the page closes
  }
  window.dispatchEvent(new Event(GAME_LOOK_EVENT));
}
