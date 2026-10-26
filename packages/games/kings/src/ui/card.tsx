'use client';

import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useMoment, type ScreenPlayer } from '@jackdaw/ui';
import { since, type KingsTableView } from '../rules';
import { clock } from '../time';
import { Board, KingMark, type Mark } from './board';
import { place } from './race';

/** How the cards are laid out for this many players: as few rows as fit a 16:9 screen. */
export function columnsFor(n: number): number {
  if (n <= 4) return Math.max(1, n);
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 5;
}

/**
 * One player in the race: their place, token and clock, the puzzle they're on, a crown for each
 * king they've placed, and a pip for each puzzle solved. With `kings` their board shows where the
 * kings are (someone watching who has finished, or the TV when one person plays alone); without,
 * only how many. Each solve stamps "Solved" across the board for a moment.
 */
export function PlayerCard({
  id,
  t,
  player,
  rank,
  kings,
  me,
  now,
  reactions,
  size = 'phone',
  compact,
}: {
  id: string;
  t: KingsTableView;
  player?: ScreenPlayer;
  rank: number;
  kings?: readonly number[];
  me?: boolean;
  now: () => number;
  reactions: Reaction[];
  size?: 'phone' | 'tv';
  /** Many cards on one TV: no avatar, so the name and clock keep their room. */
  compact?: boolean;
}) {
  const times = t.times[id] ?? [];
  const solved = times.length;
  const done = solved >= t.count;
  const puzzle = t.puzzles[Math.min(solved, t.count - 1)] ?? t.puzzles[0]!;
  const [fresh, dismiss] = useMoment(solved);
  const lastMs = solved ? times[solved - 1]! - (solved > 1 ? times[solved - 2]! : t.startedAt) : 0;
  const placed = kings ? kings.length : (t.placed?.[id] ?? 0);
  const marks = Array<Mark>(puzzle.size * puzzle.size).fill(0);
  if (kings && !done) for (const k of kings) marks[k] = 2;
  const name = me ? 'You' : (player?.name ?? 'Someone');

  return (
    <article
      className={`kg-card kg-card--${size}${done ? ' is-done' : ''}${rank === 0 && solved > 0 ? ' is-lead' : ''}`}
      aria-label={`${name}: ${solved} of ${t.count} solved`}
    >
      <header className="kg-card__head">
        <span className="kg-card__place" aria-hidden="true">
          {rank + 1}
        </span>
        <span className="kg-card__tok">
          {player && size === 'tv' && !compact && (
            <Token avatar={player.avatar} size={60} away={!player.online} />
          )}
          <PlayerReaction reactions={reactions} playerId={id} />
        </span>
        <span className="kg-card__name">{name}</span>
        <span className="kg-card__time">
          {done
            ? clock(times.at(-1)! - t.startedAt)
            : t.over
              ? `${solved}/${t.count}`
              : clock(now() - since(t, id))}
        </span>
      </header>

      <div className="kg-card__board">
        {done ? (
          <div className="kg-card__done">
            <KingMark size="38%" />
            <b>{place(rank)}</b>
            <span>All {t.count} solved</span>
          </div>
        ) : (
          <Board
            puzzle={puzzle}
            marks={marks}
            label={`${name}, puzzle ${solved + 1}`}
            className="kg-board--mini"
          />
        )}
        {fresh !== null && fresh > 0 && (
          <span className="kg-stamp" key={fresh} onAnimationEnd={dismiss} role="status">
            <b>{done ? 'Finished' : 'Solved'}</b>
            <span>{clock(lastMs)}</span>
          </span>
        )}
      </div>

      <footer className="kg-card__foot">
        {!done && (
          <span className="kg-meter" aria-label={`${placed} of ${puzzle.size} kings placed`}>
            {Array.from({ length: puzzle.size }, (_, k) => (
              <span key={k} className={`kg-meter__crown${k < placed ? ' is-on' : ''}`}>
                <KingMark />
              </span>
            ))}
          </span>
        )}
        <span className="kg-card__count">
          {done ? 'Done' : `Puzzle ${solved + 1} of ${t.count}`}
        </span>
      </footer>
    </article>
  );
}
