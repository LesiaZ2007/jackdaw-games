'use client';

import type { CSSProperties } from 'react';
import { CENTRE, PREMIUM, SIZE, VALUE, type Board, type Placement } from '../board';

const PREMIUM_LABEL = { tw: '3W', dw: '2W', tl: '3L', dl: '2L' } as const;
const PREMIUM_NAME = {
  tw: 'triple word',
  dw: 'double word',
  tl: 'triple letter',
  dl: 'double letter',
} as const;

/** A letter tile: bone stock, the letter in ink and its value in the corner. */
export function Tile({
  letter,
  blank = false,
  className,
  style,
}: {
  /** '?' for an unplayed blank. */
  letter: string;
  blank?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const isBlank = blank || letter === '?';
  return (
    <span
      className={['wh-tile', isBlank && 'wh-tile--blank', className].filter(Boolean).join(' ')}
      style={style}
    >
      <span className="wh-tile__letter">{letter === '?' ? '' : letter}</span>
      {!isBlank && <span className="wh-tile__value">{VALUE[letter]}</span>}
    </span>
  );
}

/**
 * The printed board: 15 by 15 squares with the bonus squares in heraldic colours and a star in
 * the middle. Tiles already played, tiles being placed this turn (`pending`), and the last move
 * picked out (`recent`). Empty squares are buttons when `onSquare` is given.
 */
export function BoardGrid({
  board,
  pending = [],
  recent = [],
  onSquare,
  label = 'The board',
  dropIn,
}: {
  board: Board;
  pending?: Placement[];
  recent?: [number, number][];
  /**
   * The recent tiles drop onto the board one after another, this many milliseconds apart (the
   * TV, as a move lands).
   */
  dropIn?: number;
  onSquare?: (row: number, col: number) => void;
  label?: string;
}) {
  const pend = new Map(pending.map((p) => [`${p.row},${p.col}`, p]));
  const fresh = new Map(recent.map(([r, c], i) => [`${r},${c}`, i]));
  return (
    <div className="wh-board" role="group" aria-label={label}>
      {Array.from({ length: SIZE }, (_, r) =>
        Array.from({ length: SIZE }, (_, c) => {
          const key = `${r},${c}`;
          const cell = board[r]![c];
          const p = pend.get(key);
          const premium = PREMIUM[r]![c];
          const star = r === CENTRE && c === CENTRE;
          const name = cell
            ? `${cell.letter}${cell.blank ? ' (blank)' : ''}`
            : p
              ? `${p.letter}, placed this turn`
              : premium
                ? PREMIUM_NAME[premium]
                : 'empty';
          const body = cell ? (
            <Tile
              letter={cell.letter}
              blank={cell.blank}
              className={
                !fresh.has(key)
                  ? undefined
                  : dropIn !== undefined
                    ? 'wh-tile--recent wh-tile--drop'
                    : 'wh-tile--recent'
              }
              style={
                dropIn !== undefined && fresh.has(key)
                  ? { animationDelay: `${fresh.get(key)! * dropIn}ms` }
                  : undefined
              }
            />
          ) : p ? (
            <Tile letter={p.letter} blank={p.blank} className="wh-tile--pending" />
          ) : star ? (
            <span className="wh-sq__star" aria-hidden="true">
              ★
            </span>
          ) : premium ? (
            <span className="wh-sq__label" aria-hidden="true">
              {PREMIUM_LABEL[premium]}
            </span>
          ) : null;
          const cls = ['wh-sq', premium && `wh-sq--${premium}`].filter(Boolean).join(' ');
          return onSquare && !cell ? (
            <button
              key={key}
              type="button"
              className={cls}
              aria-label={`Row ${r + 1}, column ${c + 1}: ${name}`}
              onClick={() => onSquare(r, c)}
            >
              {body}
            </button>
          ) : (
            <span key={key} className={cls} aria-label={`Row ${r + 1}, column ${c + 1}: ${name}`}>
              {body}
            </span>
          );
        }),
      )}
    </div>
  );
}
