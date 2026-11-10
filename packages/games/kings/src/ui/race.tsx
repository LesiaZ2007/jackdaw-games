'use client';

import { useEffect, useState } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, type ScreenPlayer } from '@jackdaw/ui';
import { ranking, since, type KingsTableView } from '../rules';
import { clock } from '../time';
import { KingMark } from './board';

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

/** The puzzle's title on a heraldic ribbon, and the clock on a shield. */
export function Court({ title, time, label }: { title: string; time: string; label: string }) {
  return (
    <div className="kg-court">
      <p className="kg-ribbon">{title}</p>
      <div className="kg-shield" role="timer" aria-label={label}>
        <span className="kg-shield__in">{time}</span>
      </div>
    </div>
  );
}

/**
 * The coronation: everyone's lane in the race, best first. Each has their token and name, a crown
 * for every king on the puzzle they're on (filled once placed), and either how far along they are
 * with the clock on that puzzle or their finishing time and place; a gold crown and a check once
 * the set is done. With `limit`, only that many lanes (always including you) and a "+n more".
 */
export function Race({
  t,
  players,
  me,
  now,
  reactions,
  size = 'phone',
  limit,
}: {
  t: KingsTableView;
  players: ScreenPlayer[];
  me?: string;
  now: () => number;
  reactions: Reaction[];
  size?: 'phone' | 'tv';
  limit?: number;
}) {
  useTick();
  const byId = new Map(players.map((p) => [p.id, p]));
  const order = ranking(t);
  let shown = order;
  if (limit !== undefined && order.length > limit) {
    shown = order.slice(0, limit);
    if (me && !shown.includes(me)) shown = [...order.slice(0, limit - 1), me];
  }
  return (
    <div className="kg-raceWrap">
      <ol className={`kg-race kg-race--${size}`} aria-label="The race">
        {shown.map((id) => {
          const i = order.indexOf(id);
          const p = byId.get(id);
          const times = t.times[id] ?? [];
          const done = times.length === t.count;
          const running = !done && !t.over;
          const placed = t.placed?.[id] ?? 0;
          return (
            <li key={id} className={`kg-lane${id === me ? ' is-me' : ''}${done ? ' is-done' : ''}`}>
              <span className="kg-lane__tok">
                {p && (
                  <Token
                    avatar={p.avatar}
                    size={size === 'tv' ? 64 : 30}
                    away={p.online === false}
                  />
                )}
                <PlayerReaction reactions={reactions} playerId={id} />
              </span>
              <span className="kg-lane__name" title={p?.name}>
                {id === me ? 'You' : (p?.name ?? 'Someone')}
              </span>
              <span
                className="kg-pips"
                aria-label={done ? 'All solved' : `${placed} of ${t.size} kings placed`}
              >
                {done ? (
                  <>
                    <KingMark gold />
                    <span className="kg-check" aria-hidden="true" />
                  </>
                ) : (
                  Array.from({ length: t.size }, (_, k) => (
                    <KingMark key={k} hollow={k >= placed} />
                  ))
                )}
              </span>
              <span className="kg-lane__time">
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
      {shown.length < order.length && (
        <p className="kg-race__more">+{order.length - shown.length} more</p>
      )}
    </div>
  );
}
