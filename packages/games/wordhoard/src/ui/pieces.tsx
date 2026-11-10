'use client';

import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { Icon } from '@jackdaw/ui';
import { CENTRE, PREMIUM, SIZE, VALUE, type Board, type Placement } from '../board';

const PREMIUM_LABEL = { tw: '3W', dw: '2W', tl: '3L', dl: '2L' } as const;
const PREMIUM_NAME = {
  tw: 'triple word',
  dw: 'double word',
  tl: 'triple letter',
  dl: 'double letter',
} as const;

type Premium = keyof typeof PREMIUM_LABEL;

/**
 * The engraved mark on a bonus square, drawn in the square's ink: a fleuron for a triple word, a
 * lozenge for a double word, three pips for a triple letter and two for a double letter.
 */
export function Ornament({ kind }: { kind: Premium }) {
  return (
    <svg className="wh-orn" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {kind === 'tw' && (
        <g fill="currentColor">
          <path d="M12 2c2.8 2.6 3.2 6.4 0 11-3.2-4.6-2.8-8.4 0-11z" />
          <ellipse cx="6.6" cy="11.6" rx="2.3" ry="4.4" transform="rotate(-35 6.6 11.6)" />
          <ellipse cx="17.4" cy="11.6" rx="2.3" ry="4.4" transform="rotate(35 17.4 11.6)" />
          <rect x="6" y="15.6" width="12" height="2.4" />
          <path d="M10.4 18h3.2L12 22.4z" />
        </g>
      )}
      {kind === 'dw' && (
        <g>
          <path
            d="M12 2.5 21.5 12 12 21.5 2.5 12z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
          <path d="M12 7.6 16.4 12 12 16.4 7.6 12z" fill="currentColor" />
        </g>
      )}
      {kind === 'tl' && (
        <g fill="currentColor">
          <circle cx="12" cy="6.6" r="3.4" />
          <circle cx="6.2" cy="16.6" r="3.4" />
          <circle cx="17.8" cy="16.6" r="3.4" />
        </g>
      )}
      {kind === 'dl' && (
        <g fill="currentColor">
          <circle cx="6.4" cy="12" r="4" />
          <circle cx="17.6" cy="12" r="4" />
        </g>
      )}
    </svg>
  );
}

/** The four bonus squares in a row, each as a swatch with its mark, so nobody has to squint. */
export function Legend() {
  const items: [Premium, string][] = [
    ['tw', '3× word'],
    ['dw', '2× word'],
    ['tl', '3× letter'],
    ['dl', '2× letter'],
  ];
  return (
    <ul className="wh-legend" aria-label="Bonus squares">
      {items.map(([k, text]) => (
        <li key={k}>
          <span className={`wh-legend__sw wh-sq--${k}`} aria-hidden="true">
            <Ornament kind={k} />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

/**
 * The board's printed frame: a 2px ink border, the inner rule, and a fleuron in each corner. The
 * board scrolls inside it (when zoomed); the frame and its corners stay put.
 */
export function BoardFrame({
  zoomed = false,
  children,
}: {
  zoomed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={zoomed ? 'wh-boardwrap is-zoomed' : 'wh-boardwrap'}>
      <div className="wh-boardscroll">{children}</div>
      <Icon.fleuron className="wh-corner tl" />
      <Icon.fleuron className="wh-corner tr" />
      <Icon.fleuron className="wh-corner bl" />
      <Icon.fleuron className="wh-corner br" />
    </div>
  );
}

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
 * The printed board: 15 by 15 squares with the bonus squares in heraldic colors and a star in
 * the middle. Tiles already played, tiles being placed this turn (`pending`), and the last move
 * picked out (`recent`). Empty squares are buttons when `onSquare` is given, marked with
 * `data-square="row,col"` so a dragged tile can find the square it's dropped on.
 */
export function BoardGrid({
  board,
  pending = [],
  recent = [],
  onSquare,
  onPendingDown,
  label = 'The board',
  dropIn,
  scored,
}: {
  board: Board;
  pending?: Placement[];
  recent?: [number, number][];
  /**
   * The recent tiles drop onto the board one after another, this many milliseconds apart (the
   * TV, as a move lands).
   */
  dropIn?: number;
  /** A word was just played for this many points: its tiles flash gold and the score rises. */
  scored?: number;
  onSquare?: (row: number, col: number) => void;
  /** A finger or pointer went down on a tile placed this turn (to drag it somewhere else). */
  onPendingDown?: (e: PointerEvent, row: number, col: number) => void;
  label?: string;
}) {
  const pend = new Map(pending.map((p) => [`${p.row},${p.col}`, p]));
  const fresh = new Map(recent.map(([r, c], i) => [`${r},${c}`, i]));
  const mid = scored !== undefined ? recent[Math.floor(recent.length / 2)] : undefined;
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
                    : scored !== undefined
                      ? 'wh-tile--recent wh-tile--scored'
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
            <>
              <Ornament kind={premium} />
              <span className="wh-sq__label" aria-hidden="true">
                {PREMIUM_LABEL[premium]}
              </span>
            </>
          ) : null;
          const cls = [
            'wh-sq',
            premium && `wh-sq--${premium}`,
            premium && !cell && !p && !star && 'wh-sq--mark',
          ]
            .filter(Boolean)
            .join(' ');
          return onSquare && !cell ? (
            <button
              key={key}
              type="button"
              className={cls}
              aria-label={`Row ${r + 1}, column ${c + 1}: ${name}`}
              data-square={key}
              onClick={() => onSquare(r, c)}
              onPointerDown={p && onPendingDown ? (e) => onPendingDown(e, r, c) : undefined}
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
      {mid && scored !== undefined && (
        <span
          className="wh-board__pop"
          aria-hidden="true"
          style={{
            left: `${((mid[1] + 0.5) / SIZE) * 100}%`,
            top: `${((mid[0] + 0.5) / SIZE) * 100}%`,
            ...(dropIn !== undefined
              ? { animationDelay: `${recent.length * dropIn + 200}ms` }
              : {}),
          }}
        >
          +{scored}
        </span>
      )}
    </div>
  );
}
