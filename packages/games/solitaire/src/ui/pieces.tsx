'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { ScreenPlayer } from '@jackdaw/ui';
import { cardText, isRed, rankOf, suitOf, SUITS, type Card, type Suit } from '../cards';
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

/** Where the pips go on each number card, on a 50 by 70 card. Ones below the middle are upside down. */
const L = 17;
const C = 25;
const R = 33;
const PIPS: Record<number, [number, number][]> = {
  2: [
    [C, 12],
    [C, 58],
  ],
  3: [
    [C, 12],
    [C, 35],
    [C, 58],
  ],
  4: [
    [L, 12],
    [R, 12],
    [L, 58],
    [R, 58],
  ],
  5: [
    [L, 12],
    [R, 12],
    [C, 35],
    [L, 58],
    [R, 58],
  ],
  6: [
    [L, 12],
    [R, 12],
    [L, 35],
    [R, 35],
    [L, 58],
    [R, 58],
  ],
  7: [
    [L, 12],
    [R, 12],
    [C, 23.5],
    [L, 35],
    [R, 35],
    [L, 58],
    [R, 58],
  ],
  8: [
    [L, 12],
    [R, 12],
    [C, 23.5],
    [L, 35],
    [R, 35],
    [C, 46.5],
    [L, 58],
    [R, 58],
  ],
  9: [
    [L, 12],
    [R, 12],
    [L, 27.3],
    [R, 27.3],
    [C, 35],
    [L, 42.7],
    [R, 42.7],
    [L, 58],
    [R, 58],
  ],
  10: [
    [L, 12],
    [R, 12],
    [C, 19.7],
    [L, 27.3],
    [R, 27.3],
    [L, 42.7],
    [R, 42.7],
    [C, 50.3],
    [L, 58],
    [R, 58],
  ],
};

/** The court cards' pictures, drawn on 24 units: a crown, a coronet and a plumed cap. */
const COURT: Record<string, string> = {
  K: 'M3 18L5 7l4.5 5L12 4l2.5 8L19 7l2 11zM3 19.5h18V22H3z',
  Q: 'M4 18c2-7 5-9 8-12 3 3 6 5 8 12zM4 19.5h16V22H4zM12 1.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z',
  J: 'M4 18c0-7 4-9 8-9s8 2 8 9zM3 19.5h18V22H3zM14 9c2-5 6-7 8-6.5-2 2.5-5 5.5-7 7.5z',
};

/** A suit mark of size `size` centred on (x, y), upside down when `flip`. */
function Pip({
  suit,
  x,
  y,
  size,
  flip,
}: {
  suit: Suit;
  x: number;
  y: number;
  size: number;
  flip?: boolean;
}) {
  const at = `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`;
  return <path d={SUIT_PATH[suit]} transform={flip ? `rotate(180 ${x} ${y}) ${at}` : at} />;
}

/** The corner index: the rank with its suit under it. */
function Index({ card, suit }: { card: Card; suit: Suit }) {
  const ten = card[0] === 'T';
  return (
    <>
      <text
        x="6"
        y="10.5"
        textAnchor="middle"
        fontSize={ten ? 9 : 11}
        letterSpacing={ten ? -0.8 : 0}
      >
        {ten ? '10' : card[0]}
      </text>
      <Pip suit={suit} x={6} y={15.5} size={6.5} />
    </>
  );
}

/**
 * A full printed face (2026-10-30: "the full card pictures"): the index in two corners, the
 * pips laid out as on a real card, and a framed picture on the jack, queen and king.
 */
function Face({ card }: { card: Card }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const court = COURT[card[0]!];
  return (
    <svg className="sol-card__face" viewBox="0 0 50 70" aria-hidden="true" fill="currentColor">
      <Index card={card} suit={suit} />
      <g transform="rotate(180 25 35)">
        <Index card={card} suit={suit} />
      </g>
      {rank === 1 && <Pip suit={suit} x={25} y={35} size={22} />}
      {PIPS[rank]?.map(([x, y], i) => (
        <Pip key={i} suit={suit} x={x} y={y} size={9} flip={y > 35} />
      ))}
      {court && (
        <>
          <rect
            x="12"
            y="8"
            width="26"
            height="54"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.9"
          />
          <rect
            x="14"
            y="10"
            width="22"
            height="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
          />
          {[false, true].map((flip) => (
            <g key={String(flip)} transform={flip ? 'rotate(180 25 35)' : undefined}>
              <path d={court} transform="translate(17 13) scale(0.667)" />
              <Pip suit={suit} x={25} y={29} size={6} />
            </g>
          ))}
          <path d="M14 35h22" stroke="currentColor" strokeWidth="0.4" />
        </>
      )}
    </svg>
  );
}

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** A player's tint, for their deck's backs and the tab on cards they put up. */
export const tintOf = (players: ScreenPlayer[], id: string) =>
  `var(--tint-${players.find((p) => p.id === id)?.avatar.tint ?? 'slate'}, var(--sable))`;

/**
 * A printed playing card. On laptops and TVs it has the full face (see `Face`). On phones,
 * where cards are small, it's the rank in the corner and the suit large in the middle (2026-10-30:
 * "on phones, it should only be the suit"), and a card with another fanned over it shows a tiny
 * suit in its top right corner instead ("if it's under another card, have a tiny symbol"). Face down it shows the deck's
 * back in its owner's tint. Its width comes from `--w` (set by whatever holds it).
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
  covered = false,
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
  /** Another card is fanned over it, hiding the middle. */
  covered?: boolean;
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
      <Face card={card} />
      <span className="sol-card__simple">
        <b className="sol-card__rank" aria-hidden="true">
          {card[0] === 'T' ? '10' : card[0]}
        </b>
        <span className={covered ? 'sol-card__corner' : 'sol-card__pip'} aria-hidden="true">
          <SuitMark suit={suit} />
        </span>
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
              covered={j < col.up.length - 1}
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
            covered={card !== top}
            onTap={card === top && onWaste ? () => onWaste(card) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
