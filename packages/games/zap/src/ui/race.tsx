'use client';

import { useEffect, useState } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, since, type ZapTableView } from '../rules';
import { clock } from '../time';

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

/**
 * Everyone's lane in the race, best first: their token, a pip for each puzzle (filled once
 * solved), and either the clock on the puzzle they're on or their finishing time and place.
 */
export function Race({
  t,
  players,
  me,
  now,
  reactions,
  size = 'phone',
}: {
  t: ZapTableView;
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
    <ol className={`zp-race zp-race--${size}`} aria-label="The race">
      {order.map((id, i) => {
        const p = byId.get(id);
        const times = t.times[id] ?? [];
        const done = times.length === t.count;
        const running = !done && !t.over;
        return (
          <li key={id} className={`zp-lane${id === me ? ' is-me' : ''}${done ? ' is-done' : ''}`}>
            <span className="zp-lane__tok">
              {p && (
                <Token avatar={p.avatar} size={size === 'tv' ? 64 : 34} away={p.online === false} />
              )}
              <PlayerReaction reactions={reactions} playerId={id} />
            </span>
            <span className="zp-lane__name">{id === me ? 'You' : (p?.name ?? 'Someone')}</span>
            {t.count <= 20 && (
              <span className="zp-pips" aria-label={`${times.length} of ${t.count} solved`}>
                {Array.from({ length: t.count }, (_, k) => (
                  <span key={k} className={`zp-pip${k < times.length ? ' is-on' : ''}`} />
                ))}
              </span>
            )}
            <span className="zp-lane__time">
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
