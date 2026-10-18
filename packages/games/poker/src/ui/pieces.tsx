'use client';

import type { CSSProperties } from 'react';
import { cardText, rankOf, suitOf, type Card, type Suit } from '../cards';

const SUIT_PATH: Record<Suit, string> = {
  s: 'M12 2C9.5 5.5 4 8.6 4 13a4 4 0 0 0 6.6 3L9.5 22h5l-1.1-6A4 4 0 0 0 20 13c0-4.4-5.5-7.5-8-11z',
  h: 'M12 21.5C6.2 16.6 2 13 2 8.6A4.6 4.6 0 0 1 12 5.8a4.6 4.6 0 0 1 10 2.8c0 4.4-4.2 8-10 12.9z',
  d: 'M12 1.5l8 10.5-8 10.5L4 12z',
  c: 'M12 2.2a4.4 4.4 0 0 0-3.9 6.4 4.4 4.4 0 1 0 2.5 7.3L9.5 22h5l-1.1-6.1a4.4 4.4 0 1 0 2.5-7.3A4.4 4.4 0 0 0 12 2.2z',
};

export function SuitMark({ suit, size }: { suit: Suit; size?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

const RANK_LABEL: Record<string, string> = { T: '10' };

/**
 * A printed playing card: cream stock, the rank in the corner and the suit large in the middle,
 * red suits in gules. Face down it shows the deck's azure back. `w` is its width in any CSS unit.
 */
export function PlayingCard({
  card,
  w,
  down = false,
  dim = false,
  lift = false,
  className,
  style,
}: {
  card?: Card;
  w?: string;
  down?: boolean;
  /** Not part of the winning five. */
  dim?: boolean;
  /** Part of the winning five. */
  lift?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const vars = { ...(w ? { '--w': w } : {}), ...style } as CSSProperties;
  if (down || !card) {
    return (
      <span
        className={['pk-card pk-card--back', className].filter(Boolean).join(' ')}
        style={vars}
        role="img"
        aria-label="A face-down card"
      />
    );
  }
  const suit = suitOf(card);
  const red = suit === 'h' || suit === 'd';
  return (
    <span
      className={[
        'pk-card',
        red && 'pk-card--red',
        dim && 'pk-card--dim',
        lift && 'pk-card--lift',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={vars}
      role="img"
      aria-label={cardText(card)}
      data-rank={rankOf(card)}
    >
      <span className="pk-card__rank" aria-hidden="true">
        {RANK_LABEL[card[0]!] ?? card[0]}
      </span>
      <span className="pk-card__pip" aria-hidden="true">
        <SuitMark suit={suit} />
      </span>
      <span className="pk-card__suit" aria-hidden="true">
        <SuitMark suit={suit} />
      </span>
    </span>
  );
}

/** A small stack of chips with the amount beside it. */
export function ChipStack({
  amount,
  className,
  style,
}: {
  amount: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span className={['pk-chips', className].filter(Boolean).join(' ')} style={style}>
      <span className="pk-chips__pile" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <b>{amount.toLocaleString('en-GB')}</b>
    </span>
  );
}

/** "1,250". */
export const chips = (n: number) => n.toLocaleString('en-GB');
