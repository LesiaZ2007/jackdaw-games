'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import type { MazeAction, MazePlayerView, MazeTableView } from '../rules';
import type { FrameModel } from './frame';
import { confetti } from './render/effects';
import { createSound, soundFor, type Sound } from './render/sound';
import { Runner } from './runner';

/** The HUD re-renders at most this often (the canvas is drawn every frame). */
const HUD_MS = 100;

export interface LoopArgs {
  /** You, or null on the TV. */
  me: string | null;
  table: MazeTableView;
  view: MazePlayerView | null;
  players: { id: string; name: string }[];
  now(): number;
  send?(a: MazeAction): Promise<boolean>;
  /** Called every animation frame with the model to draw and a clock in ms. */
  onFrame(model: FrameModel, t: number): void;
}

const noSend = () => Promise.resolve(false);

/** The Runner and whatever it needs from the latest props, kept together outside of render. */
class Host {
  readonly names: Record<string, string> = {};
  readonly runner: Runner;
  args: LoopArgs;
  constructor(a: LoopArgs) {
    this.args = a;
    this.setArgs(a);
    this.runner = new Runner({
      me: a.me,
      table: a.table,
      view: a.view,
      names: this.names,
      now: () => this.args.now(),
      send: (x) => (this.args.send ?? noSend)(x),
    });
  }
  setArgs(a: LoopArgs): void {
    this.args = a;
    for (const p of a.players) this.names[p.id] = p.name;
  }
}

/**
 * Runs the Runner on animation frames. Returns the runner, and the latest model for the parts
 * of the screen made of HTML (ten times a second, and at once when something happened).
 */
export function useMazeLoop(args: LoopArgs): { runner: Runner; model: FrameModel | null } {
  const [host] = useState(() => new Host(args));
  const [model, setModel] = useState<FrameModel | null>(null);

  useEffect(() => {
    host.setArgs(args);
  });
  useEffect(() => {
    host.runner.update(args.table, args.view);
  }, [host, args.table, args.view]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    const loop = (t: number) => {
      const m = host.runner.frame(t - last);
      last = t;
      host.args.onFrame(m, t);
      if (m.effects.length || t - hudAt >= HUD_MS) {
        hudAt = t;
        setModel(m);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [host]);

  return { runner: host.runner, model };
}

/** A box's size, kept up to date as it changes (the maze is fitted to it). */
export function useSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => {
        const w = Math.floor(r.width);
        const h = Math.floor(r.height);
        return s.w === w && s.h === h ? s : { w, h };
      });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

const MUTE_KEY = 'jackdaw:maze:muted';
let mutedNow: boolean | null = null;
const muteListeners = new Set<() => void>();

function readMuted(): boolean {
  if (mutedNow !== null) return mutedNow;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function subscribeMuted(cb: () => void): () => void {
  muteListeners.add(cb);
  return () => muteListeners.delete(cb);
}

/** Sound with a mute switch that is remembered on this device. */
export function useSound(me: string | null): {
  muted: boolean;
  toggle: () => void;
  /** Plays what this frame's effects sound like. */
  hear: (m: FrameModel) => void;
  /** Call from a tap or key press so the browser lets audio start. */
  unlock: () => void;
} {
  const sound = useRef<Sound | null>(null);
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  useEffect(() => {
    const s = createSound();
    s.muted = readMuted();
    sound.current = s;
    return subscribeMuted(() => {
      s.muted = readMuted();
    });
  }, []);
  const toggle = useCallback(() => {
    const next = !readMuted();
    mutedNow = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Not remembered; it still works for now.
    }
    for (const cb of muteListeners) cb();
    sound.current?.resume();
  }, []);
  const hear = useCallback(
    (m: FrameModel) => {
      const s = sound.current;
      if (!s || s.muted) return;
      for (const e of m.effects) {
        const k = soundFor(e, me);
        if (k) s.play(k);
      }
    },
    [me],
  );
  const unlock = useCallback(() => sound.current?.resume(), []);
  return { muted, toggle, hear, unlock };
}

/** Confetti runs for at most this long before its canvas is taken away. */
const CONFETTI_MS = 7_000;

/** Fires confetti on a full-screen canvas it adds to the page and removes again. */
class ConfettiHost {
  private canvas: HTMLCanvasElement | null = null;
  private stopFn: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  fire = (n: number, colors?: readonly string[]): void => {
    if (typeof document === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.stop();
    const c = document.createElement('canvas');
    c.className = 'mz-confetti';
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    this.canvas = c;
    this.stopFn = confetti(c, n, colors);
    this.timer = setTimeout(this.stop, CONFETTI_MS);
  };
  stop = (): void => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopFn?.();
    this.stopFn = null;
    this.canvas?.remove();
    this.canvas = null;
  };
}

/** A way to fire confetti over the whole screen. */
export function useConfetti(): { fire: (n: number, colors?: readonly string[]) => void } {
  const [host] = useState(() => new ConfettiHost());
  useEffect(() => host.stop, [host]);
  return host;
}

/** The best score on this device, for the end panel. */
const BEST_KEY = 'jackdaw:maze:best';

export function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function writeBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // Not remembered.
  }
}

/** A number that counts up to `to` over about a second. */
export function useCountUp(to: number, run = true): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run]);
  return run ? n : to;
}
