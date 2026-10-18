'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LobbySnapshot } from '@jackdaw/engine';
import { getDeviceToken } from './identity';

/**
 * "Your move" alerts on this device: a short chime and a buzz when a game starts waiting on you,
 * the tab title while the page is in the background, and (if asked for) notifications when the
 * phone is locked or the app is closed, through Web Push.
 */

export interface AlertPrefs {
  sound: boolean;
  buzz: boolean;
}

const PREFS_KEY = 'jackdaw:alerts';
const DEFAULTS: AlertPrefs = { sound: true, buzz: true };
const listeners = new Set<() => void>();
let cached: AlertPrefs | null = null;

function readPrefs(): AlertPrefs {
  if (cached) return cached;
  try {
    cached = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    cached = DEFAULTS;
  }
  return cached!;
}

export function setAlertPrefs(next: Partial<AlertPrefs>) {
  cached = { ...readPrefs(), ...next };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(cached));
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const l of listeners) l();
}

export function useAlertPrefs(): AlertPrefs {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    readPrefs,
    () => DEFAULTS,
  );
}

// ── The chime ─────────────────────────────────────────────────────────────────────────────
let audio: AudioContext | null = null;

/** Browsers only allow sound after a tap, so the audio is unlocked on the first one. */
function unlockAudio() {
  if (audio || typeof AudioContext === 'undefined') return;
  audio = new AudioContext();
  void audio.resume().catch(() => {});
}

/** Two soft bell notes, a fourth apart, made on the spot (no sound files). */
export function chime() {
  const ctx = audio;
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.02;
  [659.25, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = t0 + i * 0.14;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.75);
  });
}

// ── The tab title ─────────────────────────────────────────────────────────────────────────
let plainTitle: string | null = null;

function flagTitle(on: boolean) {
  if (on) {
    plainTitle ??= document.title;
    document.title = `● Your move · ${plainTitle}`;
  } else if (plainTitle !== null) {
    document.title = plainTitle;
    plainTitle = null;
  }
}

/**
 * Alerts this player when the running game starts waiting on them. Nothing fires for the state
 * the page first loads with (you're already looking), only for a change after that.
 */
export function useTurnAlert(snapshot: LobbySnapshot | null) {
  const prefs = useAlertPrefs();
  const mine = Boolean(
    snapshot?.me && snapshot.status === 'in_game' && snapshot.waitingOn?.includes(snapshot.me),
  );
  const key = mine ? `${snapshot!.session?.id}` : null;
  const last = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    const clear = () => !document.hidden && flagTitle(false);
    document.addEventListener('visibilitychange', clear);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      document.removeEventListener('visibilitychange', clear);
      flagTitle(false);
    };
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const first = last.current === undefined;
    const was = last.current;
    last.current = key;
    if (!key) {
      flagTitle(false);
      return;
    }
    if (first || was === key) return;
    if (prefs.sound) chime();
    if (prefs.buzz && 'vibrate' in navigator) navigator.vibrate([90, 60, 90]);
    if (document.hidden) {
      flagTitle(true);
      void localNotice(snapshot.code);
    }
  }, [key, snapshot, prefs]);
}

/** While the page is open in the background: a notification from the page itself. */
async function localNotice(code: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const options = { body: `Lobby ${code} is waiting for you.`, tag: `jackdaw-${code}` };
  try {
    if (reg) await reg.showNotification('Your move', { ...options, data: { url: `/r/${code}` } });
    else new Notification('Your move', options);
  } catch {
    // Some browsers refuse notifications from a page; the title and sound still work.
  }
}

// ── Push notifications ────────────────────────────────────────────────────────────────────
export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

const pushOnKey = (code: string) => `jackdaw:push:${code}`;

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Whether this device can get notifications for this lobby, and whether it's asked to. */
export async function pushState(code: string): Promise<PushState> {
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined') {
    // On an iPhone, notifications need Jackdaw on the Home Screen.
    return isIos() && !standalone() ? 'needs-install' : 'unsupported';
  }
  if (!('PushManager' in window)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  const key = await fetch('/api/push').then(
    (r) => (r.ok ? r.json() : null),
    () => null,
  );
  if (!key) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  let on = false;
  try {
    on = localStorage.getItem(pushOnKey(code)) === '1';
  } catch {
    // ignore
  }
  return on && Notification.permission === 'granted' && (await reg.pushManager.getSubscription())
    ? 'on'
    : 'off';
}

function keyBytes(b64url: string) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Ask for notifications (must run from a tap) and tell the lobby where to send them. */
export async function turnOnPush(code: string): Promise<PushState> {
  unlockAudio();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = (await fetch('/api/push').then((r) => r.json())) as { publicKey: string };
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const res = await fetch(`/api/lobby/${encodeURIComponent(code)}/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': getDeviceToken() },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) return 'off';
  try {
    localStorage.setItem(pushOnKey(code), '1');
  } catch {
    // ignore
  }
  return 'on';
}

/** Stop this lobby's notifications to this device (the browser keeps its subscription). */
export async function turnOffPush(code: string): Promise<PushState> {
  await fetch(`/api/lobby/${encodeURIComponent(code)}/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-player-token': getDeviceToken() },
    body: JSON.stringify({ subscription: null }),
  }).catch(() => {});
  try {
    localStorage.removeItem(pushOnKey(code));
  } catch {
    // ignore
  }
  return 'off';
}
