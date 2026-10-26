'use client';

import type { CSSProperties } from 'react';
import {
  useCountdown,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { ranking, type ZapTableView } from '../rules';
import { clock } from '../time';
import { columnsFor, PlayerCard } from './card';
import { place, useTick } from './race';
import './zap.css';

interface Solve {
  id: string;
  n: number;
  at: number;
  ms: number;
}

/** Every solve so far, newest first. */
export function solves(t: ZapTableView): Solve[] {
  const out: Solve[] = [];
  for (const id of t.players) {
    const times = t.times[id] ?? [];
    times.forEach((at, i) =>
      out.push({ id, n: i + 1, at, ms: at - (i === 0 ? t.startedAt : times[i - 1]!) }),
    );
  }
  return out.sort((a, b) => b.at - a.at);
}

export function latestSolve(t: ZapTableView): Solve | null {
  return solves(t)[0] ?? null;
}

/**
 * Zap on the TV: a card for everyone in the race, each with the puzzle they're on, how much of it
 * their line covers (the line itself, only when one person plays alone), their clock, and a stamp
 * when they solve one. Above, the race clock and who leads; below, the latest solves.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as ZapTableView;
  const look = useTheme();
  useTick();
  const players = props.players as ScreenPlayer[];
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? 'Someone';
  const closing = useCountdown(t.closesAt, now);
  const order = ranking(t);
  const solo = t.players.length === 1;
  const all = solves(t);
  const finished = order.filter((id) => (t.times[id]?.length ?? 0) >= t.count);
  const [fresh, dismiss] = useMoment(finished.length);
  const lead = order[0]!;
  const leadSolved = t.times[lead]?.length ?? 0;
  const cols = columnsFor(t.players.length);
  const crowded = t.players.length > 8;

  return (
    <div className={`zp zp-tv${solo ? ' is-solo' : ''}`} data-look={look}>
      <header className="zp-tv__head">
        <div className="zp-tv__what">
          <p className="zp-tv__title">{solo ? `${name(lead)}’s puzzles` : 'The race'}</p>
          <p className="zp-tv__sub">
            {t.count === 1 ? 'One puzzle' : `${t.count} puzzles`} · {t.size}×{t.size}
          </p>
        </div>
        <div className={`zp-tv__clock${closing !== null ? ' is-closing' : ''}`}>
          <span>{closing !== null ? 'Ends in' : 'Race clock'}</span>
          <b>{closing !== null ? clock(closing * 1000) : clock(now() - t.startedAt)}</b>
        </div>
        <div className="zp-tv__lead">
          {solo ? (
            <>
              <span>Solved</span>
              <b>
                {leadSolved} of {t.count}
              </b>
            </>
          ) : leadSolved > 0 ? (
            <>
              <span>In the lead</span>
              <b>
                {name(lead)} · {leadSolved}/{t.count}
              </b>
            </>
          ) : (
            <>
              <span>Racing</span>
              <b>{t.players.length} players</b>
            </>
          )}
        </div>
      </header>

      <div
        className={`zp-tv__cards${crowded ? ' is-crowded' : ''}`}
        style={
          {
            '--cols': cols,
            '--rows': Math.ceil(t.players.length / cols),
          } as CSSProperties
        }
      >
        {order.map((id, i) => (
          <PlayerCard
            key={id}
            id={id}
            t={t}
            player={byId.get(id)}
            rank={i}
            path={solo ? (t.live?.[id] ?? []) : undefined}
            now={now}
            reactions={reactions}
            size="tv"
            compact={crowded}
          />
        ))}
      </div>

      <ol className="zp-ticker" aria-label="Latest">
        {all.length === 0 ? (
          <li className="is-hint">
            {solo
              ? 'One line through every square, the numbers in order.'
              : 'Everyone has the same puzzles. First to solve them all wins.'}
          </li>
        ) : (
          all.slice(0, 3).map((s) => (
            <li key={`${s.id}-${s.n}`}>
              <b>{name(s.id)}</b> solved puzzle {s.n} in {clock(s.ms)}
            </li>
          ))
        )}
      </ol>

      {fresh !== null && fresh > 0 && finished[fresh - 1] && (
        <VerdictMoment
          key={fresh}
          size="tv"
          outcome="reveal"
          title={
            solo
              ? `All ${t.count} solved`
              : `${name(finished[fresh - 1]!)} finished ${place(fresh - 1)}`
          }
          detail={clock((t.times[finished[fresh - 1]!]?.at(-1) ?? t.startedAt) - t.startedAt)}
          avatar={byId.get(finished[fresh - 1]!)?.avatar}
          ms={2600}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
