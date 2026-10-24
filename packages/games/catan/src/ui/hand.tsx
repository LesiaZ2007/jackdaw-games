'use client';

import { useMoment } from '@jackdaw/ui';
import { useEffect, useRef } from 'react';
import { RESOURCES, countCards, type Cards } from '../types';
import { Pip, ResourceGlyph } from './glyphs';
import { RESOURCE_NAME, TERRAIN_OF } from './palette';

/** Your resource cards: card stock, the terrain's colour behind its glyph, a count chit. */
export function Hand({
  hand,
  got,
  gotKey,
}: {
  hand: Cards;
  /** What the last roll paid you, shown rising over the hand. */
  got: Partial<Cards> | null;
  gotKey: number;
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
    const t = setTimeout(() => dropRef.current(), 2800);
    return () => clearTimeout(t);
  }, [fresh]);
  return (
    <div className="cn-hand" aria-label="Your cards">
      {fresh !== null && got && countCards(got) > 0 && (
        <p className="cn-got" key={gotKey}>
          You got
          {RESOURCES.filter((r) => got[r]).map((r) => (
            <Pip key={r} res={r} n={got[r]} />
          ))}
        </p>
      )}
      {RESOURCES.map((r) => (
        <ResourceCard key={r} res={r} n={hand[r]} />
      ))}
    </div>
  );
}

export function ResourceCard({ res, n }: { res: (typeof RESOURCES)[number]; n: number }) {
  return (
    <span className={n ? 'cn-rcard' : 'cn-rcard is-none'} aria-label={`${n} ${RESOURCE_NAME[res]}`}>
      <span className={`cn-rcard__art cn-fill--${TERRAIN_OF[res]}`}>
        <ResourceGlyph res={res} />
      </span>
      <span className="cn-rcard__name">{RESOURCE_NAME[res]}</span>
      {n > 0 && <b className="cn-rcard__n">{n}</b>}
    </span>
  );
}
