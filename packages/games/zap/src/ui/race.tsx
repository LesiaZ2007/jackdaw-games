'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, clockMs, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, since, type ZapTableView } from '../rules';

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

/** How many columns the TV's strip uses for this many racers. */
function stripColumns(n: number): number {
  if (n <= 2) return 1;
  if (n <= 6) return 2;
  return n <= 12 ? 3 : 4;
}

/**
 * The race as lines of ink on notebook paper, best first: one ruled line per racer, their token
 * riding the head of a pen stroke that grows with their progress (puzzles solved plus the share
 * of the one they're on), a tick at each puzzle boundary and a check once they've finished, then
 * their clock on the puzzle they're on or their finishing time and place.
 *
 * On a phone only the top three and you are shown, with "+n more" (the rest are hidden by CSS
 * from the laptop breakpoint up, where everyone fits).
 */
export function Race({
  t,
  players,
  me,
  now,
  reactions,
  size = 'phone',
  mineDrawn,
}: {
  t: ZapTableView;
  players: ScreenPlayer[];
  me?: string;
  now: () => number;
  reactions: Reaction[];
  size?: 'phone' | 'tv';
  /** Squares on your own line right now, fresher than what the server last heard. */
  mineDrawn?: number;
}) {
  useTick();
  const byId = new Map(players.map((p) => [p.id, p]));
  const order = ranking(t);
  const tv = size === 'tv';
  const shown = (id: string, i: number) => tv || i < 3 || id === me;
  const hidden = order.filter((id, i) => !shown(id, i)).length;
  return (
    <ol
      className={`zp-race zp-race--${size}`}
      aria-label="The race"
      style={tv ? ({ '--cols': stripColumns(order.length) } as CSSProperties) : undefined}
    >
      {order.map((id, i) => {
        const p = byId.get(id);
        const times = t.times[id] ?? [];
        const solved = Math.min(times.length, t.count);
        const done = solved === t.count;
        const running = !done && !t.over;
        const puzzle = t.puzzles[Math.min(solved, t.count - 1)];
        const cells = (puzzle ? puzzle.size : t.size) ** 2;
        const drawn = Math.min(
          cells,
          id === me && mineDrawn !== undefined ? mineDrawn : (t.drawn?.[id] ?? 0),
        );
        const progress = done ? 1 : Math.min(1, (solved + drawn / cells) / t.count);
        const name = id === me ? 'You' : (p?.name ?? 'Someone');
        return (
          <li
            key={id}
            className={`zp-ln${id === me ? ' is-me' : ''}${done ? ' is-done' : ''}${shown(id, i) ? '' : ' is-extra'}`}
          >
            <span className="zp-ln__name" title={p?.name}>
              {name}
            </span>
            <span className="zp-ln__track" style={{ '--p': progress } as CSSProperties}>
              <span
                className="zp-ln__bar"
                role="img"
                aria-label={`${name}: ${solved} of ${t.count} solved`}
              />
              {Array.from({ length: t.count + 1 }, (_, k) => (
                <span
                  key={k}
                  className="zp-ln__tick"
                  style={{ left: `${(k / t.count) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              <span className="zp-ln__head">
                {p && <Token avatar={p.avatar} size={tv ? 40 : 26} away={p.online === false} />}
                <PlayerReaction reactions={reactions} playerId={id} />
                {done && (
                  <svg className="zp-ln__check" viewBox="0 0 16 16" aria-hidden="true">
                    <circle cx="8" cy="8" r="7" />
                    <path d="M4.4 8.4l2.4 2.4 4.6-5" />
                  </svg>
                )}
              </span>
            </span>
            <span className="zp-ln__time">
              {done
                ? `${place(i)} ${clockMs(times.at(-1)! - t.startedAt)}`
                : running
                  ? clockMs(now() - since(t, id))
                  : `${solved}/${t.count}`}
            </span>
          </li>
        );
      })}
      {hidden > 0 && <li className="zp-ln zp-ln--more">+{hidden} more</li>}
    </ol>
  );
}
