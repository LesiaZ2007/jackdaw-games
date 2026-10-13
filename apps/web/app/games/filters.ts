import type { GameCategory, GameMeta } from '@jackdaw/engine';

/** Catalog filters, as they appear in the URL (?players=6&kind=word&length=short&rules=1). */
export interface Filters {
  players: number | null;
  kind: GameCategory | null;
  length: Length | null;
  rules: 1 | 2 | 3 | null;
}

export type Length = 'short' | 'medium' | 'long';

export const LENGTH_LABEL: Record<Length, string> = {
  short: 'Under 15 min',
  medium: '15 to 45 min',
  long: 'Over 45 min',
};

const KINDS: GameCategory[] = ['social-deduction', 'word', 'card', 'board'];
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 15;

type Params = { get(name: string): string | null };

export function readFilters(params: Params): Filters {
  const players = Number(params.get('players'));
  const kind = params.get('kind') as GameCategory | null;
  const length = params.get('length') as Length | null;
  const rules = Number(params.get('rules'));
  return {
    players:
      Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS
        ? players
        : null,
    kind: kind && KINDS.includes(kind) ? kind : null,
    length: length && length in LENGTH_LABEL ? length : null,
    rules: rules === 1 || rules === 2 || rules === 3 ? rules : null,
  };
}

/** The query string for a set of filters (plus the selected game on wide screens). */
export function filterQuery(f: Filters, game?: string | null): string {
  const q = new URLSearchParams();
  if (f.players) q.set('players', String(f.players));
  if (f.kind) q.set('kind', f.kind);
  if (f.length) q.set('length', f.length);
  if (f.rules) q.set('rules', String(f.rules));
  if (game) q.set('game', game);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** A game fits a length bucket when its typical range overlaps it. */
export function fitsLength([min, max]: [number, number], length: Length): boolean {
  if (length === 'short') return min < 15;
  if (length === 'medium') return min <= 45 && max >= 15;
  return max > 45;
}

/** Kind, length and rules filters hide games; the player count only greys them (with a reason). */
export function matches(meta: GameMeta, f: Filters): boolean {
  if (f.kind && meta.category !== f.kind) return false;
  if (f.length && !fitsLength(meta.minutes, f.length)) return false;
  if (f.rules && meta.complexity !== f.rules) return false;
  return true;
}

export const NO_FILTERS: Filters = { players: null, kind: null, length: null, rules: null };

export function hasFilters(f: Filters): boolean {
  return Boolean(f.players || f.kind || f.length || f.rules);
}
