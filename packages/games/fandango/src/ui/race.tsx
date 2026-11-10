'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, since, type FandangoReveal, type FandangoTableView } from '../rules';
import { clock } from '../time';
import { MoonMark, SunMark } from './board';

/** Re-render every half second, for running clocks. */
export function useTick(ms = 500) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

const PLACE = ['1st', '2nd', '3rd'];
export const place = (i: number) => PLACE[i] ?? `${i + 1}th`;

/** One racer on the sky track: how far along (puzzles solved plus the share of this one filled). */
export interface Racer {
  id: string;
  name: string;
  avatar: ScreenPlayer['avatar'];
  online: boolean;
  /** 0 to 1 of the whole race. */
  progress: number;
  done: boolean;
  solved: number;
  me: boolean;
}

/** Everyone in the race, best first, with how far each has got. */
export function racersOf(t: FandangoTableView, players: ScreenPlayer[], me?: string): Racer[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return ranking(t).flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const solved = t.times[id]?.length ?? 0;
    const done = solved >= t.count;
    const puzzle = t.puzzles[Math.min(solved, t.count - 1)];
    const open = puzzle ? puzzle.given.filter((g) => !g).length : 0;
    const share = done || open === 0 ? 0 : Math.min(open, t.drawn?.[id] ?? 0) / open;
    return [
      {
        id,
        name: id === me ? 'You' : p.name,
        avatar: p.avatar,
        online: p.online,
        progress: Math.min(1, (solved + share) / t.count),
        done,
        solved,
        me: id === me,
      },
    ];
  });
}

/** The same, from the results: how many each solved. */
export function racersOfReveal(
  rv: FandangoReveal,
  players: ScreenPlayer[],
  me?: string | null,
): Racer[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  return rv.order.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const solved = Math.min(rv.count, rv.times[id]?.length ?? 0);
    return [
      {
        id,
        name: id === me ? 'You' : p.name,
        avatar: p.avatar,
        online: true,
        progress: solved / rv.count,
        done: solved >= rv.count,
        solved,
        me: id === me,
      },
    ];
  });
}

/** The arc runs between these two positions (percent of the track's width). */
const X0 = 14;
const X1 = 86;

/** Where each racer sits along the arc, nudged apart so tokens stay readable. */
function spread(racers: Racer[], gap: number): number[] {
  const xs = racers.map((r) => X0 + (X1 - X0) * (r.done ? 1 : Math.min(1, r.progress)));
  const idx = racers.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]! || b - a);
  for (let k = 1; k < idx.length; k++) {
    xs[idx[k]!] = Math.max(xs[idx[k]!]!, xs[idx[k - 1]!]! + gap);
  }
  for (let k = idx.length - 1; k >= 0; k--) {
    const cap = k === idx.length - 1 ? X1 : xs[idx[k + 1]!]! - gap;
    xs[idx[k]!] = Math.min(xs[idx[k]!]!, cap);
  }
  return xs;
}

const TICKS = Array.from({ length: 13 }, (_, j) => {
  const a = (Math.PI * j) / 12;
  const s = j % 3 === 0 ? 1.13 : 1.07;
  const p = (k: number) =>
    `${(50 + 36 * k * Math.cos(a)).toFixed(2)} ${(72 - 52 * k * Math.sin(a)).toFixed(2)}`;
  return `M${p(1)}L${p(s)}`;
});

/**
 * The race as a sky: a printed arc from dawn to dusk, a low sun at one end and a moon at the
 * other, and every racer's token placed along it by how much of the race they've done. Anyone who
 * has finished sits at the dusk end with a check.
 */
export function Sky({ racers, size = 'phone' }: { racers: Racer[]; size?: 'phone' | 'tv' }) {
  const xs = spread(racers, size === 'tv' ? 6 : 4.5);
  return (
    <div className={`fd-sky fd-sky--${size}`} role="group" aria-label="The race, dawn to dusk">
      <svg className="fd-sky__art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path className="fd-sky__arc" d="M14 72A36 52 0 0 1 86 72" />
        <path className="fd-sky__horizon" d="M2 72H98" />
        <path className="fd-sky__ticks" d={TICKS.join('')} />
      </svg>
      <span className="fd-sky__sun">
        <SunMark />
      </span>
      <span className="fd-sky__moon">
        <MoonMark />
      </span>
      {racers.map((r, i) => {
        const x = xs[i]!;
        const lift = Math.max(0, Math.sin((Math.PI * (x - X0)) / (X1 - X0)));
        return (
          <span
            key={r.id}
            className={`fd-sky__tok${r.me ? ' is-me' : ''}${r.done ? ' is-done' : ''}`}
            role="img"
            aria-label={`${r.name}: ${r.solved} solved`}
            style={
              {
                left: `${x.toFixed(2)}%`,
                bottom: `calc(var(--sky-base) + ${lift.toFixed(3)} * var(--sky-amp))`,
              } as CSSProperties
            }
          >
            <span className="fd-sky__face">
              <Token avatar={r.avatar} size={size === 'tv' ? 56 : 28} away={!r.online} />
              {r.done && (
                <svg className="fd-sky__check" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" />
                  <path d="M4.4 8.4l2.4 2.4 4.6-5" />
                </svg>
              )}
            </span>
            {size === 'tv' && <span className="fd-sky__name">{r.name}</span>}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Everyone's lane in the race, best first: their token, and either the clock on the puzzle
 * they're on or their finishing time and place. The sky track above shows how far along.
 */
export function Race({
  t,
  players,
  me,
  now,
  reactions,
  size = 'phone',
}: {
  t: FandangoTableView;
  players: ScreenPlayer[];
  me?: string;
  now: () => number;
  reactions: Reaction[];
  size?: 'phone' | 'tv';
}) {
  useTick();
  const byId = new Map(players.map((p) => [p.id, p]));
  const order = ranking(t);
  return (
    <ol className={`fd-race fd-race--${size}`} aria-label="The race">
      {order.map((id, i) => {
        const p = byId.get(id);
        const times = t.times[id] ?? [];
        const done = times.length === t.count;
        const running = !done && !t.over;
        return (
          <li key={id} className={`fd-lane${id === me ? ' is-me' : ''}${done ? ' is-done' : ''}`}>
            <span className="fd-lane__tok">
              {p && (
                <Token avatar={p.avatar} size={size === 'tv' ? 64 : 28} away={p.online === false} />
              )}
              <PlayerReaction reactions={reactions} playerId={id} />
            </span>
            <span className="fd-lane__name">{id === me ? 'You' : (p?.name ?? 'Someone')}</span>
            <span className="fd-lane__time">
              {done
                ? `${place(i)} · ${clock(times.at(-1)! - t.startedAt)}`
                : running
                  ? `On ${times.length + 1} of ${t.count} · ${clock(now() - since(t, id))}`
                  : `${times.length} of ${t.count}`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
