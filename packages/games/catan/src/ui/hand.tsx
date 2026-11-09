'use client';

import { useMoment } from '@jackdaw/ui';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { PROGRESS_NAME, PROGRESS_TRACK, type Progress } from '../ck';
import {
  CARDS,
  RESOURCES,
  countCards,
  type Card,
  type Cards,
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

/** A pile never lies quite straight: each kind its own small tilt, as if dropped on the table. */
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
 * Your place at the table (2026-11-09: "bigger, and as if they're stacked on one another… a row
 * for the progress cards and a row for the materials… feel like an actual board game"): a
 * walnut tray with your development or progress cards in one row and your materials in the
 * other. Each kind of material is a pile a few cards deep with its count on a number disc; a
 * kind you have none of keeps its place as an empty, faded card. Cards overlap like a held hand
 * when there are many kinds, so they never get thin.
 */
export function Tray({
  hand,
  got,
  gotKey,
  goods = false,
  dev,
  progress,
  onCards,
  towers,
}: {
  hand: Cards;
  /** What the last roll paid you, shown rising over the hand. */
  got: Partial<Cards> | null;
  gotKey: number;
  /** Cities & Knights: the three commodities count too. */
  goods?: boolean;
  /** The base game's development cards. */
  dev?: { card: DevCard; playable: boolean }[];
  /** Cities & Knights' progress cards. */
  progress?: { card: Progress; playable: boolean }[];
  /** Opens your cards, to play one. */
  onCards: () => void;
  /** Cities & Knights: your tracks, at the start of the progress cards' row. */
  towers?: ReactNode;
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
  const kinds = goods ? CARDS : RESOURCES;
  const total = kinds.reduce((n, r) => n + (hand[r] ?? 0), 0);
  return (
    <div className={goods ? 'ctn-tray ctn-tray--goods' : 'ctn-tray'}>
      <div className="ctn-devrow">
        {towers}
        {progress ? (
          <ProgressRow cards={progress} onCards={onCards} />
        ) : (
          <DevRow cards={dev ?? []} onCards={onCards} />
        )}
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
        <div className="ctn-hand__fan" style={{ '--k': kinds.length } as CSSProperties}>
          {kinds.map((r, i) => (
            <CardPile
              // A new count deals the pile again, so a change is felt.
              key={`${r}-${hand[r] ?? 0}`}
              res={r}
              n={hand[r] ?? 0}
              fresh={fresh !== null && !!got?.[r]}
              // Held cards lie over the empty places beside them.
              style={
                {
                  '--rot': `${TILT[r]}deg`,
                  zIndex: (hand[r] ?? 0) > 0 ? 10 + i : i,
                } as CSSProperties
              }
            />
          ))}
        </div>
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
}: {
  cards: { card: DevCard; playable: boolean }[];
  onCards: () => void;
}) {
  const kinds = DEV_ORDER.filter((k) => cards.some((c) => c.card === k));
  return (
    <button
      type="button"
      className="ctn-devrow__cards"
      onClick={onCards}
      aria-label={`Your development cards: ${cards.length}. Open them`}
    >
      {kinds.length === 0 && (
        <span className="ctn-pcard ctn-pcard--slot">No development cards</span>
      )}
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
}: {
  cards: { card: Progress; playable: boolean }[];
  onCards: () => void;
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
      {cards.length === 0 && (
        <span className="ctn-pcard ctn-pcard--slot" aria-hidden="true">
          No progress cards
        </span>
      )}
    </button>
  );
}
