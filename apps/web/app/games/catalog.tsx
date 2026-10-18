'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BirdMark, GameCover } from '@jackdaw/ui';
import { catalog, catalogEntry, CATEGORY_LABEL, unfitReason } from '@/lib/catalog';
import { GameDetail, StartLobby } from './detail';
import { ThemeButton } from '../theme-toggle';
import { FilterBar } from './filter-bar';
import { filterQuery, type Filters, hasFilters, matches, NO_FILTERS, readFilters } from './filters';

/** Wide enough for the games and the detail panel side by side. */
const WIDE = '(min-width: 1024px)';

export function Catalog() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = readFilters(params);
  const shown = catalog.filter((e) => matches(e.meta, filters));
  const selectedId = params.get('game');
  const selected = catalogEntry(selectedId) ?? shown[0] ?? catalog[0];

  function update(next: Filters, game = selectedId) {
    router.replace(`${pathname}${filterQuery(next, game)}`, { scroll: false });
  }

  function open(id: string) {
    if (window.matchMedia(WIDE).matches) update(filters, id);
    else router.push(`/games/${id}${filterQuery(filters)}`);
  }

  return (
    <div className="cat">
      <header className="cat-bar">
        <Link href="/" className="cat-bar__home" aria-label="Jackdaw home">
          <BirdMark width={44} height={44} weight={3} />
        </Link>
        <h1 className="jd-display cat-bar__title">The games</h1>
        <ThemeButton className="cat-bar__join" />
        <Link
          href="/"
          className="jd-plaque jd-plaque--small cat-bar__joinlink"
          aria-label="Join a lobby"
        >
          Join<span className="cat-bar__long"> a lobby</span>
        </Link>
      </header>

      <FilterBar filters={filters} onChange={(next) => update(next)} />

      <main className="cat-shelf" aria-label="Games">
        <div className="cat-count">
          <span>
            {shown.length === 1 ? '1 game' : `${shown.length} games`}
            {filters.players ? ` for ${filters.players} players` : ''}
          </span>
          {hasFilters(filters) && (
            <button type="button" className="cat-linkbtn" onClick={() => update(NO_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="cat-empty">
            No games match those filters.{' '}
            <button type="button" className="cat-linkbtn" onClick={() => update(NO_FILTERS)}>
              Show every game
            </button>
          </p>
        ) : (
          <ul className="cat-grid">
            {shown.map((e) => {
              const unfit = filters.players ? unfitReason(e.meta, filters.players) : null;
              return (
                <li key={e.meta.id}>
                  <GameCover
                    name={e.meta.name}
                    art={e.art}
                    players={[e.meta.minPlayers, e.meta.maxPlayers]}
                    minutes={e.meta.minutes}
                    tagline={e.meta.tagline}
                    kind={CATEGORY_LABEL[e.meta.category]}
                    soon={!e.playable}
                    unfit={unfit}
                    selected={e.meta.id === selected?.meta.id}
                    onClick={() => open(e.meta.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <p className="cat-foot">
          <Link href="/about">About Jackdaw and credits</Link>
        </p>
      </main>

      {selected && (
        <aside className="cat-panel" aria-label={`About ${selected.meta.name}`}>
          <div className="cat-panel__scroll">
            <GameDetail entry={selected} headingLevel={2} />
          </div>
          <StartLobby key={selected.meta.id} entry={selected} />
        </aside>
      )}
    </div>
  );
}
