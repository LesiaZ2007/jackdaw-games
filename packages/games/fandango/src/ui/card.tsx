'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Reaction } from '@jackdaw/engine';
import { PlayerReaction, Token, useMoment, type ScreenPlayer } from '@jackdaw/ui';
import { since, type FandangoTableView } from '../rules';
import { clock } from '../time';
import { Board, PairMark } from './board';
import { place } from './race';

/** How the cards are laid out for this many players: as few rows as fit a 16:9 screen. */
export function columnsFor(n: number): number {
  if (n <= 4) return Math.max(1, n);
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 5;
}

/**
 * One player in the race: their place, token and clock, the puzzle they're on, and a bar for how
 * much of it they've filled. With `cells` their board shows their marks (someone watching who
 * has finished, or the TV when one person plays alone); without, only how far they've got.
 * Each solve stamps "Solved" across the board for a moment.
 */
export function PlayerCard({
  id,
  t,
  player,
  rank,
  cells,
  me,
  now,
  reactions,
  size = 'phone',
  compact,
}: {
  id: string;
  t: FandangoTableView;
  player?: ScreenPlayer;
  rank: number;
  cells?: readonly number[];
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
  const open = puzzle.given.filter((g) => !g).length;
  const drawn = Math.min(open, cells ? cells.filter(Boolean).length : (t.drawn?.[id] ?? 0));
  const name = me ? 'You' : (player?.name ?? 'Someone');

  return (
    <article
      className={`fd-card fd-card--${size}${done ? ' is-done' : ''}${rank === 0 && solved > 0 ? ' is-lead' : ''}`}
      aria-label={`${name}: ${solved} of ${t.count} solved`}
    >
      <header className="fd-card__head">
        <span className="fd-card__place" aria-hidden="true">
          {rank + 1}
        </span>
        <span className="fd-card__tok">
          {player && size === 'tv' && !compact && (
            <Token avatar={player.avatar} size={60} away={!player.online} />
          )}
          <PlayerReaction reactions={reactions} playerId={id} />
        </span>
        <span className="fd-card__name">{name}</span>
        <span className="fd-card__time">
          {done
            ? clock(times.at(-1)! - t.startedAt)
            : t.over
              ? `${solved}/${t.count}`
              : clock(now() - since(t, id))}
        </span>
      </header>

      <div className="fd-card__board">
        {done ? (
          <div className="fd-card__done">
            <PairMark />
            <b>{place(rank)}</b>
            <span>All {t.count} solved</span>
          </div>
        ) : (
          <Board
            puzzle={puzzle}
            cells={cells ?? []}
            label={`${name}, puzzle ${solved + 1}`}
            className="fd-board--mini"
          />
        )}
        {fresh !== null && fresh > 0 && (
          <span className="fd-stamp" key={fresh} onAnimationEnd={dismiss} role="status">
            <b>{done ? 'Finished' : 'Solved'}</b>
            <span>{clock(lastMs)}</span>
          </span>
        )}
      </div>

      <footer className="fd-card__foot">
        {!done && (
          <span
            className="fd-meter"
            role="img"
            aria-label={`${drawn} of ${open} squares filled`}
            style={{ '--done': drawn / open } as CSSProperties}
          >
            <span />
          </span>
        )}
        <span className="fd-card__count">
          {done ? 'Done' : `Puzzle ${solved + 1} of ${t.count}`}
        </span>
      </footer>
    </article>
  );
}

const GAP = 16;
/** Room a card takes beyond its board: padding and border across, header and footer down. */
const CHROME_W = 24;
const CHROME_H = 100;
/** Below this, fitting everyone on screen makes boards too small to read; scroll instead. */
const MIN_BOARD = 200;

/** The best grid for `n` cards in a w×h box: the column count giving the biggest boards. */
export function fitCards(n: number, w: number, h: number): { cols: number; board: number } {
  let best = { cols: 1, board: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const board = Math.floor(
      Math.min((w - GAP * (cols - 1)) / cols - CHROME_W, (h - GAP * (rows - 1)) / rows - CHROME_H),
    );
    if (board > best.board) best = { cols, board };
  }
  return best;
}

/**
 * The cards someone watches. On a laptop they're sized to fill the space, so a few opponents get
 * big boards; with too many for that, or on a phone, they scroll.
 */
export function Spectate({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = box && box.w >= 520 && count > 0 ? fitCards(count, box.w, box.h) : null;
  const fitted = fit !== null && fit.board >= MIN_BOARD;
  return (
    <div
      ref={ref}
      className={`fd-spectate${fitted ? ' is-fit' : ''}`}
      style={
        fitted
          ? ({
              '--cols': fit.cols,
              '--rows': Math.ceil(count / fit.cols),
              '--card-w': `${fit.board + CHROME_W}px`,
              '--card-h': `${fit.board + CHROME_H}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
