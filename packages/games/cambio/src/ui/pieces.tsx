'use client';

import type { CSSProperties } from 'react';
import { BirdMark } from '@jackdaw/ui';
import { cardOf, cardValue, isRed, type Suit } from '../cards';

const RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const rankOf = (id: number) => RANK[cardOf(id).rank - 1]!;

/** One plain suit, drawn flat in currentColor on a 24-unit square. */
const SUIT_PATH: Record<Suit, string> = {
  H: 'M12 21.5C5 16 2.5 12 2.5 8.3A5.3 5.3 0 0 1 12 5.6 5.3 5.3 0 0 1 21.5 8.3C21.5 12 19 16 12 21.5Z',
  D: 'M12 2.5L20 12 12 21.5 4 12Z',
  S: 'M12 2.5C17 8 21 11 21 14.6A4.6 4.6 0 0 1 13.2 18c.1 1.8.7 2.8 1.8 3.5H9c1.1-.7 1.7-1.7 1.8-3.5A4.6 4.6 0 0 1 3 14.6C3 11 7 8 12 2.5Z',
  C: 'M12 2.4a4.3 4.3 0 0 1 3.4 6.9 4.3 4.3 0 1 1-1.2 7.4c.1 1.9.7 3.2 1.9 4.8H7.9c1.2-1.6 1.8-2.9 1.9-4.8a4.3 4.3 0 1 1-1.2-7.4A4.3 4.3 0 0 1 12 2.4Z',
};

export function SuitMark({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

/** The lozengy rule on the back of every card: crossing diagonals in cream. */
const LATTICE = Array.from({ length: 13 }, (_, i) => {
  const x = i * 8 - 24;
  return `M${x} 0L${x + 44} 64M${x + 44} 0L${x} 64`;
}).join('');

/** The watching eye of a peek or a spy, in a small rubber-stamp ring. */
export function EyeMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12c3-5 6.5-7.5 10-7.5S19 7 22 12c-3 5-6.5 7.5-10 7.5S5 17 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.4" fill="currentColor" />
    </svg>
  );
}

function LockMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 10.5h12v10H6z" fill="currentColor" />
      <path
        d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export interface CardProps {
  /** The face to draw when it is turned up. Leave it out for a card you can't see. */
  id?: number | null;
  /** Turned face up. */
  up?: boolean;
  /** Its width, as any CSS length. */
  w?: string;
  /** A card you know, noted on its back as a small chip. */
  note?: number | null;
  /** A rubber-stamped eye over the card, with the words for screen readers. */
  eye?: string;
  /** A caller's card: locked. */
  lock?: boolean;
  /** Scoring: what it counts for, small in the corner opposite the rank. */
  value?: boolean;
  /** Scoring: flips up on its own after this many milliseconds. */
  flipAfter?: number;
  /** A legal target: pulses. */
  can?: boolean;
  /** The one you've picked. */
  picked?: boolean;
  slotKey?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
}

/**
 * A plain card: cream stock, charcoal ink, gules for hearts and diamonds. The rank is in the
 * corner and one large suit in the middle (no pip layouts, no court pictures). Red Kings carry a
 * tiny 0 and black Kings a tiny 13, since the difference matters. The back is purpure with a cream
 * lozengy rule and the jackdaw. Turning it up is a flip.
 */
export function GameCard({
  id,
  up = false,
  w,
  note,
  eye,
  lock,
  value,
  flipAfter,
  can,
  picked,
  slotKey,
  className,
  style,
  onClick,
  disabled,
  label,
}: CardProps) {
  const known = id !== undefined && id !== null;
  const c = known ? cardOf(id) : null;
  const classes = [
    'cmb-card',
    up && known && 'is-up',
    known && isRed(id) && 'cmb-card--red',
    can && 'cmb-card--can',
    picked && 'cmb-card--picked',
    flipAfter !== undefined && 'cmb-card--flip',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const vars = {
    ...(w ? { '--w': w } : {}),
    ...(flipAfter !== undefined ? { '--d': `${flipAfter}ms` } : {}),
    ...style,
  } as CSSProperties;
  const inner = (
    <>
      <span className="cmb-card__in" aria-hidden="true">
        <span className="cmb-card__back">
          <svg viewBox="0 0 50 70" preserveAspectRatio="none" focusable="false">
            <rect x="3" y="3" width="44" height="64" className="cmb-card__rule" />
            <svg x="5" y="5" width="40" height="60" viewBox="0 0 40 60" overflow="hidden">
              <path d={LATTICE} className="cmb-card__lozenge" />
            </svg>
          </svg>
          <span className="cmb-card__mark">
            <BirdMark weight={3.4} />
          </span>
          {note !== undefined && note !== null && (
            <span className={`cmb-note${isRed(note) ? ' cmb-note--red' : ''}`}>
              {rankOf(note)}
              <SuitMark suit={cardOf(note).suit} />
            </span>
          )}
        </span>
        {known && c && (
          <span className="cmb-card__face">
            <span className="cmb-card__corner">
              <b>{rankOf(id)}</b>
              <SuitMark suit={c.suit} />
            </span>
            <SuitMark suit={c.suit} className="cmb-card__big" />
            {c.rank === 13 && <span className="cmb-card__tag">{isRed(id) ? '0' : '13'}</span>}
            {value && <span className="cmb-card__value">{cardValue(id)}</span>}
          </span>
        )}
      </span>
      {eye && (
        <span className="cmb-card__eye" title={eye} aria-hidden="true">
          <EyeMark />
        </span>
      )}
      {lock && (
        <span className="cmb-card__lock" aria-hidden="true">
          <LockMark />
        </span>
      )}
    </>
  );
  const data = slotKey ? { 'data-cmb-slot': slotKey } : {};
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={vars}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        {...data}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={classes} style={vars} role="img" aria-label={label} {...data}>
      {inner}
    </span>
  );
}
