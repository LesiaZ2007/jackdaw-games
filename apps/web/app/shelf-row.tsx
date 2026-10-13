'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameCover, Icon } from '@jackdaw/ui';
import { CATEGORY_LABEL } from '@/lib/catalog';
import type { Shelf } from '@/lib/shelves';

/**
 * One carousel of game covers. Phones swipe; pointer devices also get back and forward plaques,
 * which page by the visible width and grey out at either end.
 */
export function ShelfRow({ shelf }: { shelf: Shelf }) {
  const track = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEnds({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure]);

  function page(dir: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' });
  }

  const titleId = `shelf-${shelf.id}`;
  const scrolls = !(ends.start && ends.end);

  return (
    <section className="shelf-row" aria-labelledby={titleId}>
      <header className="shelf-row__head">
        <div>
          <h3 id={titleId} className="jd-display shelf-row__title">
            {shelf.title}
          </h3>
          <p className="shelf-row__blurb">{shelf.blurb}</p>
        </div>
        {scrolls && (
          <div className="shelf-row__pager">
            <button
              type="button"
              className="jd-iconbtn"
              onClick={() => page(-1)}
              disabled={ends.start}
              aria-label={`Earlier in ${shelf.title}`}
            >
              <Icon.back />
            </button>
            <button
              type="button"
              className="jd-iconbtn shelf-row__next"
              onClick={() => page(1)}
              disabled={ends.end}
              aria-label={`More in ${shelf.title}`}
            >
              <Icon.back />
            </button>
          </div>
        )}
      </header>
      <ul ref={track} className="shelf-row__track">
        {shelf.games.map((g) => (
          <li key={g.meta.id}>
            <GameCover
              name={g.meta.name}
              art={g.art}
              players={[g.meta.minPlayers, g.meta.maxPlayers]}
              minutes={g.meta.minutes}
              tagline={g.meta.tagline}
              kind={CATEGORY_LABEL[g.meta.category]}
              soon={!g.playable}
              href={`/games/${g.meta.id}`}
              link={Link}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
