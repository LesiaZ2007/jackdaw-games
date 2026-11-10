'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BirdMark, GameCover, Glyph } from '@jackdaw/ui';
import { boxes, KINDS, unfitReason, type BoxEntry } from '@/lib/games-lite';
import { FilterBar } from './games/filter-bar';
import { filterQuery, hasFilters, matches, NO_FILTERS, type Filters } from './games/filters';
import './shelves.css';

/** Columns on wide screens. */
const COLS = 6;

/**
 * Columns a shelf's label takes on a wide screen: whatever its boxes leave of the last row, so
 * every row is full however many games a kind has. A kind that fills its rows exactly gets a
 * label across the whole row above them.
 */
const labelSpan = (count: number) => COLS - (count % COLS);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const countOf = (n: number) => (n === 1 ? '1 game' : `${n} games`);

/**
 * The games on shelves, one per kind and always in the same order (2026-10-31: "carousels or
 * categories for each type of game", "less empty whitespace", "stay looking good when I add
 * games"; 2026-11-09: "not super organized"). On a wide screen each shelf is one row of six:
 * its label, then its boxes, so rows line up and nothing is left empty. Narrower screens put
 * the label on top and swipe the boxes sideways. The contents line sticks to the top and marks
 * the shelf in view. Last comes a face-down box that draws a game at random.
 */
export function GameShelves() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const shown = boxes.filter((e) => matches(e.meta, filters));
  const shelves = KINDS.map((k) => ({
    ...k,
    games: shown.filter((e) => e.meta.category === k.kind),
  })).filter((s) => s.games.length > 0);

  const pool = shown.filter((e) => !(filters.players && unfitReason(e.meta, filters.players)));

  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState<string[]>([]);
  const kinds = shelves.map((s) => s.kind).join();

  // Which shelves are in the middle band of the screen, for the contents line.
  useEffect(() => {
    const els = wrap.current?.querySelectorAll<HTMLElement>('.shelf') ?? [];
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const kind = (e.target as HTMLElement).dataset.kind!;
          if (e.isIntersecting) seen.add(kind);
          else seen.delete(kind);
        }
        setInView([...seen]);
      },
      { rootMargin: '-35% 0px -45% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [kinds]);

  // Boxes rise onto each shelf the first time it scrolls into view.
  useEffect(() => {
    const root = wrap.current;
    if (!root || reduceMotion()) return;
    const els = [...root.querySelectorAll<HTMLElement>('.shelf, .shelf-draw')].filter(
      (el) => !el.classList.contains('is-in'),
    );
    root.classList.add('is-armed');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [kinds]);

  function jump(kind: string) {
    document
      .getElementById(`shelf-${kind}`)
      ?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  const clear = () => setFilters(NO_FILTERS);

  return (
    <>
      <header className="home-shelves__head">
        <h2 id="home-shelves-title" className="jd-display">
          The games
        </h2>
        {/* the full list opens with the same filters */}
        <Link href={`/games${filterQuery(filters)}`} className="jd-plaque jd-plaque--small">
          See all games
        </Link>
      </header>
      <div className="home-games">
        <FilterBar filters={filters} onChange={setFilters} />
        <nav className="shelf-index" aria-label="Jump to a shelf">
          <ol>
            {shelves.map((s) => (
              <li key={s.kind}>
                <button
                  type="button"
                  style={{ '--tint': `var(--${s.tint})` } as React.CSSProperties}
                  aria-current={inView.includes(s.kind) ? 'true' : undefined}
                  onClick={() => jump(s.kind)}
                >
                  {s.title}
                  <span>{s.games.length}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className={`shelf-index__count${hasFilters(filters) ? ' is-filtered' : ''}`}>
            {countOf(shown.length)}
            {filters.players ? ` for ${filters.players}` : ''}
            {hasFilters(filters) && (
              <button type="button" className="jd-link" onClick={clear}>
                Clear filters
              </button>
            )}
          </p>
        </nav>

        {shelves.length === 0 ? (
          <p className="cat-empty">
            No games match those filters.{' '}
            <button type="button" className="jd-link" onClick={clear}>
              Show every game
            </button>
          </p>
        ) : (
          <div className="shelves" ref={wrap}>
            {shelves.map((s) => (
              <section
                key={s.kind}
                id={`shelf-${s.kind}`}
                data-kind={s.kind}
                className={labelSpan(s.games.length) === COLS ? 'shelf shelf--band' : 'shelf'}
                style={
                  {
                    '--tint': `var(--${s.tint})`,
                    '--label-span': labelSpan(s.games.length),
                  } as React.CSSProperties
                }
                aria-labelledby={`shelf-${s.kind}-title`}
              >
                <header className="shelf__label">
                  <span className="shelf__shield" aria-hidden="true">
                    <Glyph id={s.glyph} size={30} />
                  </span>
                  <div className="shelf__titles">
                    <h3 id={`shelf-${s.kind}-title`} className="jd-display">
                      {s.title}
                    </h3>
                    <p>{s.line}</p>
                  </div>
                  <p className="shelf__count">{countOf(s.games.length)}</p>
                  {/* the kind's emblem again, large and faint, where a wide label has room */}
                  <span className="shelf__mark" aria-hidden="true">
                    <Glyph id={s.glyph} size={200} />
                  </span>
                </header>
                {/* role: the row is display: contents on wide screens, which can drop list semantics */}
                <ul className="shelf__row" role="list">
                  {s.games.map((e, i) => (
                    <li key={e.meta.id} style={{ '--i': i } as React.CSSProperties}>
                      <Cover entry={e} players={filters.players} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <DrawBox pool={pool} />
          </div>
        )}
      </div>
    </>
  );
}

function Cover({ entry: e, players }: { entry: BoxEntry; players: number | null }) {
  return (
    <GameCover
      name={e.meta.name}
      art={e.art}
      players={[e.meta.minPlayers, e.meta.maxPlayers]}
      minutes={e.meta.minutes}
      tagline={e.meta.tagline}
      unfit={players ? unfitReason(e.meta, players) : null}
      href={`/games/${e.meta.id}`}
      link={Link}
    />
  );
}

/**
 * A face-down box at the end of the shelves: tap it and it shuffles, then turns over a game
 * that fits the filters. Draw again for another.
 */
function DrawBox({ pool }: { pool: BoxEntry[] }) {
  const [drawn, setDrawn] = useState<BoxEntry | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A drawn game the filters have since ruled out goes back face down.
  const current = drawn && pool.includes(drawn) ? drawn : null;
  if (pool.length === 0) return null;

  function draw() {
    // Never the same game twice running, unless it's the only one.
    const others = pool.length > 1 ? pool.filter((e) => e !== current) : pool;
    const next = others[Math.floor(Math.random() * others.length)]!;
    if (reduceMotion()) return setDrawn(next);
    setShuffling(true);
    setDrawn(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setShuffling(false);
      setDrawn(next);
    }, 650);
  }

  return (
    <section className="shelf-draw" aria-labelledby="shelf-draw-title">
      <div className="shelf-draw__box">
        {current ? (
          <div className="shelf-draw__face" key={current.meta.id}>
            <Cover entry={current} players={null} />
          </div>
        ) : (
          <button
            type="button"
            className={`shelf-draw__back${shuffling ? ' is-shuffling' : ''}`}
            onClick={draw}
            disabled={shuffling}
          >
            <span className="shelf-draw__mark jd-field-lozengy" aria-hidden="true">
              <span>
                <BirdMark weight={2.6} />
              </span>
            </span>
            <span className="shelf-draw__label">{shuffling ? 'Shuffling…' : 'Draw a game'}</span>
          </button>
        )}
      </div>
      <div className="shelf-draw__text">
        <h3 id="shelf-draw-title" className="jd-display">
          Can&rsquo;t choose?
        </h3>
        <p>Let the deck decide. It only deals games that fit your filters.</p>
        {current && (
          <button type="button" className="jd-plaque jd-plaque--small" onClick={draw}>
            Draw again
          </button>
        )}
      </div>
    </section>
  );
}
