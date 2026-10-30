'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The narrator. Every phone and the TV show its lines; one device reads them aloud, so a room
 * isn't full of phones talking a beat apart: the TV when there is one, otherwise the host's
 * phone. Anyone can switch their own device's voice on or off (kept on this device).
 *
 * Browsers only let a page speak after someone has touched it, so the first tap anywhere
 * unlocks the voice; a device that should speak and hasn't been touched yet offers a button.
 */

export type VoicePref = 'auto' | 'on' | 'off';
const KEY = 'jackdaw:mafia:voice';
const listeners = new Set<() => void>();

function readPref(): VoicePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setVoicePref(p: VoicePref) {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  memory = p;
  listeners.forEach((l) => l());
}

let memory: VoicePref | null = null;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useVoicePref(): VoicePref {
  return useSyncExternalStore(
    subscribe,
    () => memory ?? (memory = readPref()),
    () => 'auto',
  );
}

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

let unlocked = false;
const unlockers = new Set<() => void>();
function unlock() {
  if (unlocked || !canSpeak()) return;
  unlocked = true;
  // An empty line spoken inside a tap is what lets later lines through.
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  unlockers.forEach((l) => l());
}

function useUnlocked(): boolean {
  useEffect(() => {
    if (unlocked) return;
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);
  return useSyncExternalStore(
    (l) => {
      unlockers.add(l);
      return () => unlockers.delete(l);
    },
    () => unlocked,
    () => false,
  );
}

function voice(): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  return (
    all.find((v) => /Daniel|Google UK English Male|Arthur|Ryan/i.test(v.name)) ??
    all.find((v) => v.lang === 'en-GB') ??
    all[0]
  );
}

/**
 * Speaks `text` whenever `id` changes, if this device is the one that speaks. A line older than
 * `freshMs` (a refresh mid-step) isn't read again.
 */
export function useNarrator({
  id,
  text,
  speaker,
  startedAt,
  now,
  freshMs = 12_000,
}: {
  id: string;
  text: string;
  /** This device speaks on Auto (the TV, or the host's phone when there's no TV). */
  speaker: boolean;
  startedAt: number;
  now: () => number;
  freshMs?: number;
}): { speaking: boolean; needsTap: boolean; pref: VoicePref } {
  const pref = useVoicePref();
  const unlockedNow = useUnlocked();
  const on = pref === 'on' || (pref === 'auto' && speaker);
  const said = useRef<string | null>(null);

  useEffect(() => {
    if (!on || !unlockedNow || !canSpeak() || said.current === id) return;
    const first = said.current === null;
    said.current = id;
    if (first && now() - startedAt > freshMs) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voice();
    if (v) u.voice = v;
    u.rate = 0.92;
    u.pitch = 0.9;
    synth.speak(u);
  }, [id, text, on, unlockedNow, startedAt, now, freshMs]);

  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  return { speaking: on, needsTap: on && !unlockedNow && canSpeak(), pref };
}

const NEXT: Record<VoicePref, VoicePref> = { auto: 'on', on: 'off', off: 'auto' };
const SAY: Record<VoicePref, string> = { auto: 'Voice: auto', on: 'Voice: on', off: 'Voice: off' };

/** The voice switch: Auto (this device speaks if it's the room's speaker), On, Off. */
export function VoiceButton({ speaking, pref }: { speaking: boolean; pref: VoicePref }) {
  return (
    <button
      type="button"
      className={speaking ? 'mf-voice is-on' : 'mf-voice'}
      onClick={() => setVoicePref(NEXT[pref])}
      aria-label={`${SAY[pref]}${pref === 'auto' ? (speaking ? ', this device speaks' : ', another device speaks') : ''}. Tap to change.`}
      title={SAY[pref]}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {speaking ? (
          <path
            d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 9l5 6M21 9l-5 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
      </svg>
      <span className="mf-voice__word">
        {pref === 'auto' ? 'Auto' : pref === 'on' ? 'On' : 'Off'}
      </span>
    </button>
  );
}
