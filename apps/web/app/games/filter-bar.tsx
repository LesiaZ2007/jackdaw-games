'use client';

import type { GameCategory } from '@jackdaw/engine';
import { CATEGORY_LABEL, COMPLEXITY_LABEL } from '@/lib/catalog';
import { type Filters, LENGTH_LABEL, type Length, MAX_PLAYERS, MIN_PLAYERS } from './filters';
import './catalog.css';

const PLAYER_COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) =>
  String(MIN_PLAYERS + i),
);

/**
 * The game filters in one row along the top: how many are playing, the kind of game, how long,
 * and how heavy the rules are. Used by the home page's games and the full list.
 */
export function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  return (
    <div className="cat-filters" role="group" aria-label="Filter games">
      <Choice
        label="Players"
        value={filters.players ? String(filters.players) : null}
        options={PLAYER_COUNTS.map((n) => [n, n] as [string, string])}
        onChange={(players) => onChange({ ...filters, players: players ? Number(players) : null })}
      />
      <Choice
        label="Kind"
        value={filters.kind}
        options={Object.entries(CATEGORY_LABEL) as [GameCategory, string][]}
        onChange={(kind) => onChange({ ...filters, kind })}
      />
      <Choice
        label="Length"
        value={filters.length}
        options={Object.entries(LENGTH_LABEL) as [Length, string][]}
        onChange={(length) => onChange({ ...filters, length })}
      />
      <Choice
        label="Rules"
        value={filters.rules ? String(filters.rules) : null}
        options={Object.entries(COMPLEXITY_LABEL) as [string, string][]}
        onChange={(rules) =>
          onChange({ ...filters, rules: rules ? (Number(rules) as 1 | 2 | 3) : null })
        }
      />
    </div>
  );
}

/** A single-choice filter: a printed box with a native select (compact, one tap). */
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
    </div>
  );
}
