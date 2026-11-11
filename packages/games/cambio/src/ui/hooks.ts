'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { prefersReducedMotion } from '@jackdaw/ui';
import type { CambioPlayerView, Move } from '../rules';

/** How long a newly learned face stays turned up. */
export const GLIMPSE_MS = 4000;
/** How long after that it takes to turn back (the card keeps its face until then). */
const TURN_BACK_MS = 500;

interface Glimpse {
  card: number;
  gen: number;
  up: boolean;
}
type Grid = Record<string, (number | null)[]>;
interface Seen {
  sig: string;
  round: number;
  grid: Grid;
  gen: number;
}

/**
 * Faces you newly learn, turned up for about four seconds and then back. A slot counts as newly
 * learned when its value in `grid` goes from unknown to a card, or changes, between two views of
 * the same round's play. The first view you open the screen with is only a baseline, so a refresh
 * never replays one. With "Keep notes" there are no glimpses: known cards carry a note instead.
 * Nothing here reads anything but your own player view.
 */
export function useGlimpses(v: CambioPlayerView): (owner: string, slot: number) => Glimpse | null {
  const sig = JSON.stringify([v.round, v.phase, v.notes, v.grid]);
  const [seen, setSeen] = useState<Seen>({ sig, round: v.round, grid: v.grid, gen: 0 });
  const [entries, setEntries] = useState<Record<string, Glimpse>>({});
  const timers = useRef(new Map<string, number[]>());

  if (sig !== seen.sig) {
    let gen = seen.gen;
    const next: Record<string, Glimpse> = {};
    if (!v.notes && v.phase === 'play' && v.round === seen.round) {
      for (const owner of Object.keys(v.grid)) {
        v.grid[owner]!.forEach((card, slot) => {
          const key = `${owner}:${slot}`;
          const before = seen.grid[owner]?.[slot] ?? null;
          if (card === null) return;
          if (card !== before) next[key] = { card, gen: ++gen, up: true };
          else if (entries[key]) next[key] = entries[key]!;
        });
      }
    }
    setSeen({ sig, round: v.round, grid: v.grid, gen });
    setEntries(next);
  }

  useEffect(() => {
    for (const [key, e] of Object.entries(entries)) {
      const id = `${key}#${e.gen}`;
      if (!e.up || timers.current.has(id)) continue;
      const turn = window.setTimeout(() => {
        setEntries((cur) =>
          cur[key]?.gen === e.gen ? { ...cur, [key]: { ...e, up: false } } : cur,
        );
      }, GLIMPSE_MS);
      const gone = window.setTimeout(() => {
        setEntries((cur) => {
          if (cur[key]?.gen !== e.gen) return cur;
          const rest = { ...cur };
          delete rest[key];
          return rest;
        });
      }, GLIMPSE_MS + TURN_BACK_MS);
      timers.current.set(id, [turn, gone]);
    }
  }, [entries]);
  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const ids of all.values()) ids.forEach((t) => window.clearTimeout(t));
      all.clear();
    };
  }, []);

  return (owner, slot) => entries[`${owner}:${slot}`] ?? null;
}

/** True once `on` has been true for `ms`, false again when it isn't. */
export function useAfter(on: boolean, ms: number): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!on) return;
    const id = window.setTimeout(() => setReady(true), ms);
    return () => {
      window.clearTimeout(id);
      setReady(false);
    };
  }, [on, ms]);
  return on && ready;
}

/**
 * A blind swap (or a King's) flies: the two cards cross the table in about half a second. They
 * are the real cards, drawn in their new places and slid in from the old ones. Only moves that
 * happen after the screen opened fly, and reduced motion lets them simply change places.
 */
export function useSwapFlight(root: RefObject<HTMLElement | null>, moves: Move[]) {
  const [base] = useState(() => moves[moves.length - 1]?.seq ?? 0);
  const m = moves[moves.length - 1];
  const key =
    m &&
    (m.kind === 'swap' || m.kind === 'kingSwap') &&
    m.seq > base &&
    m.slot !== undefined &&
    m.target &&
    m.targetSlot !== undefined
      ? `${m.seq}|${m.player}:${m.slot}|${m.target}:${m.targetSlot}`
      : '';
  useLayoutEffect(() => {
    const el = root.current;
    if (!key || !el || prefersReducedMotion()) return;
    const [, a, b] = key.split('|');
    const pick = (k: string) => el.querySelector<HTMLElement>(`[data-cmb-slot="${k}"]`);
    const A = pick(a!);
    const B = pick(b!);
    if (!A || !B || !A.animate) return;
    const ra = A.getBoundingClientRect();
    const rb = B.getBoundingClientRect();
    const dx = rb.left - ra.left;
    const dy = rb.top - ra.top;
    const fly = (e: HTMLElement, x: number, y: number) => {
      const prev = e.style.zIndex;
      e.style.zIndex = '6';
      const run = e.animate(
        [{ transform: `translate(${x}px, ${y}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      run.onfinish = () => {
        e.style.zIndex = prev;
      };
    };
    fly(A, dx, dy);
    fly(B, -dx, -dy);
  }, [key, root]);
}
