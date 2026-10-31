'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BirdMark, GameCover, Glyph } from '@jackdaw/ui';
import { catalog, SHELVES, unfitReason, type CatalogEntry } from '@/lib/catalog';
import { packShelves } from '@/lib/shelf-layout';
import { FilterBar } from './games/filter-bar';
import { hasFilters, matches, NO_FILTERS, type Filters } from './games/filters';
import './shelves.css';

/** Columns on wide screens. Each shelf takes one per game, so short shelves sit side by side. */
const COLS = 6;

const shelfOf = (e: CatalogEntry) => SHELVES.find((s) => s.kind === e.meta.category)!;

/** Empty columns after a shelf's last box on a wide screen, when it spans `span` columns. */
const rest = (count: number, span: number) => span - (count % span || span);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The games on shelves, one per kind (2026-10-31: "carousels or categories for each type of
 * game", then "more dynamic, less empty whitespace", and "stay looking good when I add games").
 * Wide screens pack the shelves into full rows of six columns, pairing short kinds, with a
 * face-down box that draws a game at random in the biggest gap (lib/shelf-layout.ts). Narrower
 * screens stack the shelves in order and swipe each one sideways. The contents line sticks to
 * the top and marks the shelf in view.
 */
export function GameShelves() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const shown = catalog.filter((e) => matches(e.meta, filters));
  const shelves = SHELVES.map((s) => ({
    ...s,
    games: shown.filter((e) => e.meta.category === s.kind),
  })).filter((s) => s.games.length > 0);

  const pool = shown.filter(
    (e) => e.playable && !(filters.players && unfitReason(e.meta, filters.players)),
  );
  // Wide screens: full rows of six whatever the counts (see shelf-layout.ts).
  const slots = packShelves(
    shelves.map((s) => s.games.length),
    COLS,
    pool.length > 0,
  );

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
    <div className="home-games">
      <FilterBar filters={filters} onChange={setFilters} />
      <nav className="shelf-index" aria-label="Kinds of game">
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
          {shown.length === 1 ? '1 game' : `${shown.length} games`}
          {filters.players ? ` for ${filters.players}` : ''}
          {hasFilters(filters) && (
            <button type="button" className="cat-linkbtn" onClick={clear}>
              Clear
            </button>
          )}
        </p>
      </nav>

      {shelves.length === 0 ? (
        <p className="cat-empty">
          No games match those filters.{' '}
          <button type="button" className="cat-linkbtn" onClick={clear}>
            Show every game
          </button>
        </p>
      ) : (
        <div className="shelves" ref={wrap}>
          {slots.map(({ item, span }) => {
            if (item === 'draw') return <DrawBox key="draw" pool={pool} span={span} />;
            const s = shelves[item]!;
            return (
              <section
                key={s.kind}
                id={`shelf-${s.kind}`}
                data-kind={s.kind}
                className="shelf"
                style={
                  {
                    '--tint': `var(--${s.tint})`,
                    '--span': span,
                    // narrower screens stack the shelves in their own order, not the packed one
                    '--order': item,
                  } as React.CSSProperties
                }
                aria-labelledby={`shelf-${s.kind}-title`}
              >
                <header className="shelf__head">
                  <span className="shelf__shield" aria-hidden="true">
                    <Glyph id={s.glyph} size={30} />
                  </span>
                  <div className="shelf__titles">
                    <h3 id={`shelf-${s.kind}-title`}>{s.title}</h3>
                    <p>{s.line}</p>
                  </div>
                  <Link className="shelf__all" href={`/games?kind=${s.kind}`}>
                    All {s.games.length}
                    <span aria-hidden="true">›</span>
                  </Link>
                </header>
                <div className="shelf__case">
                  <ul className="shelf__row">
                    {s.games.map((e, i) => (
                      <li key={e.meta.id} style={{ '--i': i } as React.CSSProperties}>
                        <Cover entry={e} players={filters.players} />
                      </li>
                    ))}
                    {rest(s.games.length, span) > 0 && (
                      // wide screens: a bookend closes the gap after the last box
                      <li
                        className="shelf__bookend"
                        style={
                          {
                            '--i': s.games.length,
                            gridColumn: `span ${rest(s.games.length, span)}`,
                          } as React.CSSProperties
                        }
                      >
                        <Link href={`/games?kind=${s.kind}`} tabIndex={-1}>
                          <span className="shelf__bookend-seal" aria-hidden="true">
                            <Glyph id={s.glyph} />
                          </span>
                          <span className="shelf__bookend-label">
                            See all {s.title.toLowerCase()}
                            <span aria-hidden="true"> ›</span>
                          </span>
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * A game's box, printed in its shelf's colour rather than its own (2026-10-31: "each category
 * has its own color", as one colour a game was "kind of chaotic"). Its field and emblem stay,
 * so the boxes on a shelf still tell apart.
 */
function Cover({ entry: e, players }: { entry: CatalogEntry; players: number | null }) {
  return (
    <GameCover
      name={e.meta.name}
      art={{ ...e.art, band: shelfOf(e).tint }}
      players={[e.meta.minPlayers, e.meta.maxPlayers]}
      minutes={e.meta.minutes}
      tagline={e.meta.tagline}
      soon={!e.playable}
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
function DrawBox({ pool, span }: { pool: CatalogEntry[]; span: number }) {
  const [drawn, setDrawn] = useState<CatalogEntry | null>(null);
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
    <section
      className={`shelf-draw${span > 1 ? ' shelf-draw--wide' : ''}`}
      style={{ '--span': span } as React.CSSProperties}
      aria-label="Draw a game"
    >
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
        <p className="shelf-draw__title">Can&rsquo;t choose?</p>
        <p>Let the deck decide.</p>
        {current && (
          <button type="button" className="cat-linkbtn" onClick={draw}>
            Draw again
          </button>
        )}
      </div>
    </section>
  );
}
