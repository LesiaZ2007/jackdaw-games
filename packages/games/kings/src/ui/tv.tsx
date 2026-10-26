'use client';

import {
  useCountdown,
  useMoment,
  useTheme,
  VerdictMoment,
  type GameUi,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { ranking, type KingsTableView } from '../rules';
import { clock } from '../time';
import { Board, type Mark } from './board';
import { Race } from './race';
import './kings.css';

/** The newest solve on the table: who, which puzzle, how long it took. */
export function latestSolve(t: KingsTableView) {
  let best: { id: string; n: number; at: number; ms: number } | null = null;
  for (const id of t.players) {
    const times = t.times[id] ?? [];
    times.forEach((at, i) => {
      if (!best || at > best.at)
        best = { id, n: i + 1, at, ms: at - (i === 0 ? t.startedAt : times[i - 1]!) };
    });
  }
  return best as { id: string; n: number; at: number; ms: number } | null;
}

const solvedCount = (t: KingsTableView) =>
  t.players.reduce((n, id) => n + (t.times[id]?.length ?? 0), 0);

/**
 * Kings on the TV: the puzzle the leader is on, blank (nobody's kings are ever shown while the
 * race runs), beside everyone's lane. Each solve is stamped across the screen for a moment.
 */
export const TvScreen: GameUi['TvScreen'] = ({ tableView, reactions, now, ...props }) => {
  const t = tableView as KingsTableView;
  const look = useTheme();
  const players = props.players as ScreenPlayer[];
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const closing = useCountdown(t.closesAt, now);
  const [fresh, dismiss] = useMoment(solvedCount(t));
  const last = latestSolve(t);
  const leader = ranking(t)[0]!;
  const on = Math.min(t.times[leader]?.length ?? 0, t.count - 1);
  const puzzle = t.puzzles[on] ?? t.puzzles[0]!;
  const done = (id: string) => (t.times[id]?.length ?? 0) === t.count;

  return (
    <div className="kg kg-tv" data-look={look}>
      <header className="kg-tv__head">
        <p className="kg-tv__title">
          {t.players.length === 1
            ? `${name(leader)}, puzzle ${on + 1} of ${t.count}`
            : `${t.count === 1 ? 'One puzzle' : `${t.count} puzzles`}, ${t.size}×${t.size}`}
        </p>
        {closing !== null ? (
          <span className="kg-tv__closing">Ends in {clock(closing * 1000)}</span>
        ) : (
          <span className="kg-tv__clock">{clock(now() - t.startedAt)}</span>
        )}
      </header>
      <div className="kg-tv__body">
        <figure className="kg-tv__board">
          <div className="kg-tv__fit">
            <Board
              puzzle={puzzle}
              marks={Array<Mark>(puzzle.size * puzzle.size).fill(0)}
              label={`Puzzle ${on + 1}`}
            />
          </div>
          <figcaption>
            {t.players.length === 1 ? 'The puzzle on now' : `Puzzle ${on + 1}, the leader’s`}
          </figcaption>
        </figure>
        <Race t={t} players={players} now={now} reactions={reactions} size="tv" />
      </div>
      {fresh !== null && last && (
        <VerdictMoment
          key={fresh}
          size="tv"
          outcome="reveal"
          title={
            done(last.id)
              ? `${name(last.id)} solved them all`
              : `${name(last.id)} solved puzzle ${last.n}`
          }
          detail={clock(last.ms)}
          avatar={players.find((p) => p.id === last.id)?.avatar}
          ms={2200}
          onDone={dismiss}
        />
      )}
    </div>
  );
};
