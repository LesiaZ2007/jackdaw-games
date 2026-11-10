'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A page of the puzzle book: paper with a ruled frame, a perforated top edge, a running head
 * ("Zap · Puzzle 3 of 5" left, the time right, set like a page number) and the board under it.
 * A solved page turns the win color and takes a "Solved" stamp in its margin.
 */
export function Page({
  title,
  clock,
  clockLabel,
  solved = false,
  stampText = 'Solved',
  children,
}: {
  title: string;
  clock?: ReactNode;
  clockLabel?: string;
  solved?: boolean;
  stampText?: string;
  children: ReactNode;
}) {
  return (
    <div className={`zp-page${solved ? ' is-solved' : ''}`}>
      <header className="zp-page__head">
        <p className="zp-page__title">{title}</p>
        {clock !== undefined && (
          <span className="zp-clock" aria-label={clockLabel}>
            {clock}
          </span>
        )}
      </header>
      {children}
      {solved && (
        <span className="zp-page__stamp" role="status">
          {stampText}
        </span>
      )}
    </div>
  );
}

/**
 * Turns the page when `turnKey` changes (the public puzzle index): the old page lifts and slides
 * away to the left while the new one settles in from the right. A first render, such as a
 * refresh, never plays it, and with reduced motion the page just changes.
 */
export function TurnPage({ turnKey, children }: { turnKey: number; children: ReactNode }) {
  const last = useRef(children);
  const seen = useRef(turnKey);
  const [old, setOld] = useState<ReactNode | null>(null);

  // Declared before the one that records `children`, so on a new key it still holds the old page.
  useLayoutEffect(() => {
    if (seen.current === turnKey) return;
    seen.current = turnKey;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setOld(calm ? null : last.current);
  }, [turnKey]);
  useLayoutEffect(() => {
    last.current = children;
  });

  // If the animation event never arrives (a hidden tab), the old page is dropped anyway.
  useEffect(() => {
    if (old === null) return;
    const t = setTimeout(() => setOld(null), 700);
    return () => clearTimeout(t);
  }, [old]);

  return (
    <div className="zp-turn">
      {old !== null && (
        <div
          className="zp-turn__old"
          aria-hidden="true"
          inert
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setOld(null);
          }}
        >
          {old}
        </div>
      )}
      <div className={`zp-turn__new${old !== null ? ' is-turning' : ''}`}>{children}</div>
    </div>
  );
}
