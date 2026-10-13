'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { GameCategory } from '@jackdaw/engine';
import { BirdMark, BoxLid } from '@jackdaw/ui';
import {
  catalog,
  catalogEntry,
  CATEGORY_LABEL,
  COMPLEXITY_LABEL,
  unfitReason,
} from '@/lib/catalog';
import { GameDetail, StartLobby } from './detail';
import {
  filterQuery,
  type Filters,
  hasFilters,
  LENGTH_LABEL,
  type Length,
  matches,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NO_FILTERS,
  readFilters,
} from './filters';

/** Wide enough for filters, shelf and the detail panel side by side. */
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
        <Link href="/" className="jd-plaque jd-plaque--small cat-bar__join">
          Join a lobby
        </Link>
      </header>

      <aside className="cat-filters" aria-label="Filter games">
        <PlayerStepper
          value={filters.players}
          onChange={(players) => update({ ...filters, players })}
        />
        <Choice
          label="Kind"
          value={filters.kind}
          options={Object.entries(CATEGORY_LABEL) as [GameCategory, string][]}
          onChange={(kind) => update({ ...filters, kind })}
        />
        <Choice
          label="Length"
          value={filters.length}
          options={Object.entries(LENGTH_LABEL) as [Length, string][]}
          onChange={(length) => update({ ...filters, length })}
        />
        <Choice
          label="Rules"
          value={filters.rules ? String(filters.rules) : null}
          options={Object.entries(COMPLEXITY_LABEL) as [string, string][]}
          onChange={(rules) =>
            update({ ...filters, rules: rules ? (Number(rules) as 1 | 2 | 3) : null })
          }
        />
      </aside>

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
                <li key={e.meta.id} className={e.playable ? undefined : 'cat-soon'}>
                  <BoxLid
                    name={e.meta.name}
                    art={e.art}
                    players={[e.meta.minPlayers, e.meta.maxPlayers]}
                    minutes={e.meta.minutes}
                    tagline={e.meta.tagline}
                    unfit={unfit}
                    selected={e.meta.id === selected?.meta.id}
                    onClick={() => open(e.meta.id)}
                  />
                  {!e.playable && <span className="cat-soon__stamp">Coming soon</span>}
                </li>
              );
            })}
          </ul>
        )}
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

function PlayerStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const down = () => onChange(value === null ? null : value <= MIN_PLAYERS ? null : value - 1);
  const up = () => onChange(value === null ? MIN_PLAYERS + 2 : Math.min(MAX_PLAYERS, value + 1));
  return (
    <div className="cat-filter cat-filter--stepper" role="group" aria-label="Number of players">
      <span className="jd-label">Players</span>
      <span className="cat-stepper">
        <button type="button" onClick={down} disabled={value === null} aria-label="Fewer players">
          −
        </button>
        <output aria-live="polite">{value ?? 'Any'}</output>
        <button
          type="button"
          onClick={up}
          disabled={value === MAX_PLAYERS}
          aria-label="More players"
        >
          +
        </button>
      </span>
    </div>
  );
}

/**
 * A single-choice filter. Phones get a native select (compact, one tap); wide screens get the
 * same choice as a printed checklist in the left column.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: [T, string][];
  onChange: (v: T | null) => void;
}) {
  const id = `filter-${label.toLowerCase()}`;
  return (
    <div className="cat-filter">
      <label className="jd-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="cat-select"
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || null) as T | null)}
      >
        <option value="">Any</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <fieldset className="cat-checks">
        <legend className="sr-only">{label}</legend>
        {[['' as T, 'Any'] as [T, string], ...options].map(([v, text]) => (
          <label key={v || 'any'}>
            <input
              type="radio"
              name={id}
              checked={(value ?? '') === v}
              onChange={() => onChange((v || null) as T | null)}
            />
            <span>{text}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
