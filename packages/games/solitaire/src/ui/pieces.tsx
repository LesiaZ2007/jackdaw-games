'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ScreenPlayer } from '@jackdaw/ui';
import { cardText, isRed, suitOf, SUITS, type Card, type Suit } from '../cards';
import type { FoundationView, SeatView, Source } from '../rules';

const SUIT_PATH: Record<Suit, string> = {
  s: 'M12 2C9.5 5.5 4 8.6 4 13a4 4 0 0 0 6.6 3L9.5 22h5l-1.1-6A4 4 0 0 0 20 13c0-4.4-5.5-7.5-8-11z',
  h: 'M12 21.5C6.2 16.6 2 13 2 8.6A4.6 4.6 0 0 1 12 5.8a4.6 4.6 0 0 1 10 2.8c0 4.4-4.2 8-10 12.9z',
  d: 'M12 1.5l8 10.5-8 10.5L4 12z',
  c: 'M12 2.2a4.4 4.4 0 0 0-3.9 6.4 4.4 4.4 0 1 0 2.5 7.3L9.5 22h5l-1.1-6.1a4.4 4.4 0 1 0 2.5-7.3A4.4 4.4 0 0 0 12 2.2z',
};

export function SuitMark({ suit }: { suit: Suit }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={SUIT_PATH[suit]} fill="currentColor" />
    </svg>
  );
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** A player's tint, for their deck's backs and the tab on cards they put up. */
export const tintOf = (players: ScreenPlayer[], id: string) =>
  `var(--tint-${players.find((p) => p.id === id)?.avatar.tint ?? 'slate'}, var(--sable))`;

/**
 * A printed playing card. The rank and a small suit run along the top edge, so a card fanned in a
 * column still reads; the suit is large below. Face down it shows the deck's back in its owner's
 * tint. Its width comes from `--w` (set by whatever holds it).
 */
export function PlayingCard({
  card,
  down = false,
  back,
  tab,
  className,
  style,
  onTap,
  label,
}: {
  card?: Card;
  down?: boolean;
  /** The back's colour (a player's tint). */
  back?: string;
  /** A tab along the foot in this colour: whose deck the card came from. */
  tab?: string;
  className?: string;
  style?: CSSProperties;
  onTap?: () => void;
  label?: string;
}) {
  const vars = { ...(back ? { '--back': back } : {}), ...(tab ? { '--tab': tab } : {}), ...style };
  if (down || !card) {
    return (
      <span
        className={cx('sol-card sol-card--back', className)}
        style={vars as CSSProperties}
        aria-hidden="true"
      />
    );
  }
  const suit = suitOf(card);
  const body: ReactNode = (
    <>
      <span className="sol-card__index" aria-hidden="true">
        <b>{card[0] === 'T' ? '10' : card[0]}</b>
        <SuitMark suit={suit} />
      </span>
      <span className="sol-card__pip" aria-hidden="true">
        <SuitMark suit={suit} />
      </span>
      {tab && <span className="sol-card__tab" aria-hidden="true" />}
    </>
  );
  const cls = cx('sol-card', isRed(card) && 'sol-card--red', className);
  if (onTap) {
    return (
      <button
        type="button"
        className={cls}
        style={vars as CSSProperties}
        onClick={onTap}
        aria-label={label ?? cardText(card)}
      >
        {body}
      </button>
    );
  }
  return (
    <span className={cls} style={vars as CSSProperties} role="img" aria-label={cardText(card)}>
      {body}
    </span>
  );
}

/** An empty place for a card: a dashed outline with a faint mark in it. */
export function Slot({ children, className }: { children?: ReactNode; className?: string }) {
  return <span className={cx('sol-card sol-slot', className)}>{children}</span>;
}

/** The shared foundations in suit order (each suit's tallest first), keeping their indexes. */
export function sortedPiles(fs: readonly FoundationView[]) {
  return fs
    .map((f, i) => ({ ...f, i }))
    .sort(
      (a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.count - a.count || a.i - b.i,
    );
}

/**
 * The middle everyone builds on: every foundation's top card, by suit, each with a tab in the
 * tint of whoever put it there. The pile that just took a card lands it.
 */
export function Middle({
  foundations,
  players,
  landed,
  hint,
}: {
  foundations: readonly FoundationView[];
  players: ScreenPlayer[];
  /** The index of the pile that just took a card, and a key that moves on with each card. */
  landed?: { pile: number; n: number } | null;
  /** Light up the piles this card could go on. */
  hint?: boolean;
}) {
  const piles = sortedPiles(foundations);
  return (
    <div className="sol-middle" aria-label="The middle">
      {piles.length === 0 && <p className="sol-middle__empty">Aces go up here</p>}
      {piles.map((f) => (
        <span
          key={f.i}
          className={cx('sol-pile', f.count === 13 && 'sol-pile--done', hint && 'sol-pile--hint')}
          title={`${f.count} ${f.count === 1 ? 'card' : 'cards'}`}
        >
          <PlayingCard
            key={landed?.pile === f.i ? `n${landed.n}` : f.top}
            card={f.top}
            tab={tintOf(players, f.by)}
            className={landed?.pile === f.i ? 'sol-land' : undefined}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Seven columns, covered cards first, each fanned to fit the height of its box (a size
 * container): the face-up run spreads as far as the space allows, up to a third of a card.
 */
export function Tableau({
  seat,
  back,
  onCard,
  marked,
  bump,
}: {
  seat: SeatView;
  back: string;
  /** Tap on a face-up card (players only). */
  onCard?: (from: Source, card: Card) => void;
  /** A card to point at (a hint). */
  marked?: Card | null;
  /** A card that just refused to move: shake it. */
  bump?: Card | null;
}) {
  return (
    <div className="sol-tableau">
      {seat.cols.map((col, ci) => (
        <div
          key={ci}
          className="sol-col"
          style={{ '--d': col.down, '--u': Math.max(col.up.length, 1) } as CSSProperties}
        >
          {col.down === 0 && col.up.length === 0 && (
            <Slot>
              <b>K</b>
            </Slot>
          )}
          {Array.from({ length: col.down }, (_, i) => (
            <PlayingCard
              key={`d${i}`}
              down
              back={back}
              className="sol-at"
              style={{ '--i': i, '--j': 0 } as CSSProperties}
            />
          ))}
          {col.up.map((card, j) => (
            <PlayingCard
              key={card}
              card={card}
              className={cx(
                'sol-at',
                marked === card && 'sol-mark',
                bump === card && 'sol-bump',
                j === col.up.length - 1 && 'sol-top',
              )}
              style={{ '--i': col.down, '--j': j } as CSSProperties}
              onTap={onCard ? () => onCard(ci, card) : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** The stock (tap to turn it) and the waste beside it, its top cards fanned. */
export function StockWaste({
  seat,
  back,
  onDraw,
  onWaste,
  marked,
  bump,
}: {
  seat: SeatView;
  back: string;
  onDraw?: () => void;
  onWaste?: (card: Card) => void;
  marked?: 'stock' | Card | null;
  bump?: Card | null;
}) {
  const top = seat.waste.at(-1);
  const stockLabel =
    seat.stock > 0
      ? `Turn the stock: ${seat.stock} left`
      : seat.wasteCount > 0
        ? 'Turn the waste back over'
        : 'The stock is empty';
  return (
    <div className="sol-sw">
      <button
        type="button"
        className={cx('sol-stock', marked === 'stock' && 'sol-mark')}
        onClick={onDraw}
        disabled={!onDraw || (seat.stock === 0 && seat.wasteCount === 0)}
        aria-label={stockLabel}
      >
        {seat.stock > 0 ? (
          <PlayingCard down back={back} />
        ) : (
          <Slot>{seat.wasteCount > 0 ? <b aria-hidden="true">↻</b> : null}</Slot>
        )}
        <span className="sol-count">{seat.stock}</span>
      </button>
      <div className="sol-waste">
        {seat.waste.length === 0 && <Slot />}
        {seat.waste.map((card, i) => (
          <PlayingCard
            key={card}
            card={card}
            className={cx(
              'sol-fan',
              card === top && marked === card && 'sol-mark',
              card === top && bump === card && 'sol-bump',
            )}
            style={{ '--k': i } as CSSProperties}
            onTap={card === top && onWaste ? () => onWaste(card) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
