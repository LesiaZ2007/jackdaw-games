'use client';

import { useMoment } from '@jackdaw/ui';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  PROGRESS_NAME,
  PROGRESS_TRACK,
  TRACKS,
  TRACK_NAME,
  type Progress,
  type Track,
} from '../ck';
import {
  CARDS,
  COMMODITIES,
  RESOURCES,
  countCards,
  type Card,
  type Cards,
  type Commodity,
  type DevCard,
  type Terrain,
} from '../types';
import { Motif } from './board';
import { DEV_NAME } from './common';
import { Gate } from './estate';
import { DevGlyph, Pip, ResourceGlyph } from './glyphs';
import { RESOURCE_NAME, TERRAIN_OF } from './palette';

/** The engraving behind each card's art: its terrain's, or (commodities) where it comes from. */
const MOTIF_OF: Record<Card, Terrain> = {
  lumber: 'forest',
  brick: 'hills',
  wool: 'pasture',
  grain: 'fields',
  ore: 'mountains',
  paper: 'forest',
  cloth: 'pasture',
  coin: 'mountains',
};

/** A pile never lies quite straight: each kind its own slight tilt, as if set down by hand. */
const TILT: Record<Card | DevCard, number> = {
  lumber: -1.4,
  brick: 1,
  wool: -0.6,
  grain: 1.5,
  ore: -1,
  paper: 0.8,
  cloth: -1.2,
  coin: 0.6,
  knight: -1.2,
  roadBuilding: 1.1,
  yearOfPlenty: -0.7,
  monopoly: 1.3,
  victoryPoint: -0.9,
};

/** How many cards of a kind show as a pile (the rest only count). */
const MAX_LAYERS = 4;

const DEV_ORDER: DevCard[] = ['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly', 'victoryPoint'];

/**
 * Your place at the table (2026-11-09: "a row for the progress cards and a row for the materials…
 * cloth/coin/paper in one row and the resources in another… less rounded, like the actual game"):
 * a walnut tray with your development or progress cards along the top, then (Cities & Knights)
 * each commodity standing beside the track it climbs, then your five resources. Each kind is a
 * neat pile with its count on a number disc; a kind you have none of keeps its place, faded.
 */
export function Tray({
  hand,
  got,
  gotKey,
  dev,
  progress,
  onCards,
  towers,
  lead,
  tail,
  left,
}: {
  hand: Cards;
  /** What the last roll paid you, shown rising over the hand. */
  got: Partial<Cards> | null;
  gotKey: number;
  /** The base game's development cards. */
  dev?: { card: DevCard; playable: boolean }[];
  /** Cities & Knights' progress cards. */
  progress?: { card: Progress; playable: boolean }[];
  /** Opens your cards, to play one. */
  onCards: () => void;
  /** Cities & Knights: each commodity's track, which stands beside it. */
  towers?: Partial<Record<Commodity, ReactNode>>;
  /** Before your cards on the top row (on a phone, your points). */
  lead?: ReactNode;
  /** After them (on a phone, your knights). */
  tail?: ReactNode;
  /** Cards left to draw: the development deck, or each progress deck. */
  left?: number | Record<Track, number>;
}) {
  // A new roll shows it again; a refresh doesn't.
  const [fresh, drop] = useMoment(gotKey);
  // `drop` is new each render (polls re-render often), so the timer holds the latest in a ref.
  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  });
  useEffect(() => {
    if (fresh === null) return;
    const t = setTimeout(() => dropRef.current(), 4600);
    return () => clearTimeout(t);
  }, [fresh]);
  const kinds = towers ? CARDS : RESOURCES;
  const total = kinds.reduce((n, r) => n + (hand[r] ?? 0), 0);
  const pile = (r: Card) => (
    <CardPile
      // A new count deals the pile again, so a change is felt.
      key={`${r}-${hand[r] ?? 0}`}
      res={r}
      n={hand[r] ?? 0}
      fresh={fresh !== null && !!got?.[r]}
      style={{ '--rot': `${TILT[r]}deg` } as CSSProperties}
    />
  );
  return (
    <div className={towers ? 'ctn-tray ctn-tray--goods' : 'ctn-tray'}>
      <div className="ctn-devrow">
        {lead && <span className="ctn-devrow__lead">{lead}</span>}
        {progress ? (
          <ProgressRow
            cards={progress}
            onCards={onCards}
            left={typeof left === 'object' ? left : undefined}
          />
        ) : (
          <DevRow
            cards={dev ?? []}
            onCards={onCards}
            left={typeof left === 'number' ? left : undefined}
          />
        )}
        {tail && <span className="ctn-devrow__tail">{tail}</span>}
      </div>
      <div className="ctn-hand" aria-label={`Your materials: ${total} cards`}>
        {fresh !== null && got && countCards(got) > 0 && (
          <p className="ctn-got" key={gotKey}>
            You got
            {CARDS.filter((r) => got[r]).map((r) => (
              <Pip key={r} res={r} n={got[r]} />
            ))}
          </p>
        )}
        {towers && (
          <div className="ctn-hand__row ctn-hand__row--goods">
            {COMMODITIES.map((c) => (
              <span key={c} className="ctn-good">
                {pile(c)}
                {towers[c]}
              </span>
            ))}
          </div>
        )}
        <div className="ctn-hand__row">{RESOURCES.map(pile)}</div>
      </div>
    </div>
  );
}

/** One kind of material: the top card face up, the others peeking out behind; none, a faded card. */
function CardPile({
  res,
  n,
  fresh,
  style,
}: {
  res: Card;
  n: number;
  fresh: boolean;
  style: CSSProperties;
}) {
  const under = Math.max(0, Math.min(n, MAX_LAYERS) - 1);
  return (
    <span
      className={['ctn-pile', fresh && 'is-fresh', !n && 'is-none'].filter(Boolean).join(' ')}
      style={style}
      role="img"
      aria-label={`${n} ${RESOURCE_NAME[res]}`}
    >
      {Array.from({ length: under }, (_, j) => (
        <span
          key={j}
          className="ctn-rcard ctn-rcard--under"
          style={{ '--l': under - j } as CSSProperties}
          aria-hidden="true"
        >
          <span className={`ctn-rcard__art ctn-fill--${TERRAIN_OF[res]}`} />
        </span>
      ))}
      {n > 0 ? (
        <ResourceCard res={res} />
      ) : (
        <span className="ctn-rcard ctn-rcard--slot" aria-hidden="true">
          <span className="ctn-rcard__art">
            <ResourceGlyph res={res} className="ctn-rcard__glyph" />
          </span>
          <span className="ctn-rcard__name">{RESOURCE_NAME[res]}</span>
        </span>
      )}
      {n > 0 && (
        <b className="ctn-rcard__n" aria-hidden="true">
          {n}
        </b>
      )}
    </span>
  );
}

/** A resource card: a sand rim, the terrain engraved behind the resource, a name ribbon. */
export function ResourceCard({ res }: { res: Card }) {
  const id = useId();
  const motif = MOTIF_OF[res];
  return (
    <span className="ctn-rcard" aria-hidden="true">
      <span className={`ctn-rcard__art ctn-fill--${TERRAIN_OF[res]}`}>
        <svg className="ctn-rcard__motif" aria-hidden="true">
          <defs>
            <pattern id={id} patternUnits="userSpaceOnUse" width="26" height="26">
              <g transform="scale(1.3)" className="ctn-motif ctn-rcard__ink">
                <Motif t={motif} />
              </g>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${id})`} />
        </svg>
        <ResourceGlyph res={res} className="ctn-rcard__glyph" />
      </span>
      <span className="ctn-rcard__name">{RESOURCE_NAME[res]}</span>
    </span>
  );
}

/** The base game's development cards, a pile per kind; a tap opens them to play one. */
function DevRow({
  cards,
  onCards,
  left,
}: {
  cards: { card: DevCard; playable: boolean }[];
  onCards: () => void;
  left?: number;
}) {
  const kinds = DEV_ORDER.filter((k) => cards.some((c) => c.card === k));
  return (
    <button
      type="button"
      className="ctn-devrow__cards"
      onClick={onCards}
      aria-label={`Your development cards: ${cards.length}. Open them`}
    >
      {kinds.length === 0 &&
        (left === undefined ? (
          <span className="ctn-pcard ctn-pcard--slot">No development cards</span>
        ) : (
          <Deck n={left} label="development cards left" />
        ))}
      {kinds.map((k) => {
        const n = cards.filter((c) => c.card === k).length;
        const live = cards.some((c) => c.card === k && c.playable);
        return (
          <span
            key={`${k}-${n}`}
            className={live ? 'ctn-pcard ctn-pcard--dev is-live' : 'ctn-pcard ctn-pcard--dev'}
            style={{ '--rot': `${TILT[k]}deg` } as CSSProperties}
            aria-hidden="true"
          >
            {n > 1 && <i className="ctn-pcard__under" />}
            <span className="ctn-pcard__band">
              <DevGlyph kind={k} />
            </span>
            <span className="ctn-pcard__name">{DEV_NAME[k]}</span>
            {n > 1 && <b className="ctn-pcard__n">{n}</b>}
          </span>
        );
      })}
    </button>
  );
}

/** Cities & Knights' progress cards, each in its track's colour; a tap opens them to play one. */
function ProgressRow({
  cards,
  onCards,
  left,
}: {
  cards: { card: Progress; playable: boolean }[];
  onCards: () => void;
  left?: Record<Track, number>;
}) {
  return (
    <button
      type="button"
      className="ctn-devrow__cards"
      onClick={onCards}
      aria-label={`Your progress cards: ${cards.length} of 4. Open them`}
    >
      {cards.map((c, i) => (
        <span
          key={`${c.card}-${i}`}
          className={`ctn-pcard ctn-pcard--${PROGRESS_TRACK[c.card]}${c.playable ? ' is-live' : ''}`}
          style={{ '--rot': `${(i % 2 ? 1 : -1) * (0.8 + (i % 3) * 0.4)}deg` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="ctn-pcard__band">
            <Gate />
          </span>
          <span className="ctn-pcard__name">{PROGRESS_NAME[c.card]}</span>
        </span>
      ))}
      {cards.length === 0 &&
        (left ? (
          TRACKS.map((tr) => (
            <Deck key={tr} n={left[tr]} track={tr} label={`${TRACK_NAME[tr]} cards left`} />
          ))
        ) : (
          <span className="ctn-pcard ctn-pcard--slot" aria-hidden="true">
            No progress cards
          </span>
        ))}
    </button>
  );
}

/**
 * A deck face down on the table, a few cards thick, with how many are left on it: shown in place
 * of your cards while you hold none.
 */
function Deck({ n, track, label }: { n: number; track?: Track; label: string }) {
  return (
    <span
      className={track ? `ctn-deck ctn-deck--${track}` : 'ctn-deck'}
      title={`${n} ${label}`}
      aria-hidden="true"
    >
      <i className="ctn-deck__card" />
      <i className="ctn-deck__card" />
      <span className="ctn-deck__top">
        {track ? <Gate /> : <DevGlyph kind="knight" />}
        <b>{n}</b>
      </span>
    </span>
  );
}
