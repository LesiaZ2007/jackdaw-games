import { describe, expect, it } from 'vitest';
import type { GameMeta } from '@jackdaw/engine';
import { filterQuery, fitsLength, matches, NO_FILTERS, readFilters } from './filters';

const meta = (over: Partial<GameMeta>): GameMeta => ({
  id: 'x',
  name: 'X',
  tagline: '',
  minPlayers: 2,
  maxPlayers: 10,
  category: 'word',
  minutes: [15, 30],
  complexity: 1,
  ...over,
});

describe('catalog filters', () => {
  it('round-trips through the URL and ignores junk', () => {
    const f = readFilters(new URLSearchParams('players=6&kind=word&length=short&rules=2'));
    expect(f).toEqual({ players: 6, kind: 'word', length: 'short', rules: 2 });
    expect(filterQuery(f, 'avalon')).toBe('?players=6&kind=word&length=short&rules=2&game=avalon');
    expect(
      readFilters(new URLSearchParams('players=99&kind=chess&length=forever&rules=7')),
    ).toEqual(NO_FILTERS);
    expect(filterQuery(NO_FILTERS)).toBe('');
  });

  it('buckets lengths by overlap', () => {
    expect(fitsLength([2, 5], 'short')).toBe(true);
    expect(fitsLength([30, 60], 'medium')).toBe(true);
    expect(fitsLength([30, 60], 'long')).toBe(true);
    expect(fitsLength([8, 15], 'long')).toBe(false);
  });

  it('hides by kind, length and rules but not by player count', () => {
    const g = meta({ category: 'social-deduction', minutes: [30, 60], complexity: 2 });
    expect(matches(g, { ...NO_FILTERS, players: 3 })).toBe(true);
    expect(matches(g, { ...NO_FILTERS, kind: 'word' })).toBe(false);
    expect(matches(g, { ...NO_FILTERS, length: 'short' })).toBe(false);
    expect(matches(g, { ...NO_FILTERS, rules: 2 })).toBe(true);
  });
});
