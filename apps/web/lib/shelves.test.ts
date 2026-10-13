import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from './catalog';
import { shelvesFor } from './shelves';

const game = (id: string, over: Partial<CatalogEntry['meta']> = {}, playable = false) =>
  ({
    meta: {
      id,
      name: id,
      tagline: '',
      minPlayers: 4,
      maxPlayers: 8,
      category: 'board',
      minutes: [20, 40],
      complexity: 1,
      ...over,
    },
    art: { band: 'gules', field: 'paly', glyph: 'rps' },
    about: { description: '', steps: [] },
    playable,
  }) as CatalogEntry;

describe('shelvesFor', () => {
  it('groups games by what they are good for, in a fixed order', () => {
    const shelves = shelvesFor([
      game('rps', { minPlayers: 2, minutes: [2, 5] }, true),
      game('spy', {
        category: 'social-deduction',
        minPlayers: 3,
        maxPlayers: 15,
        minutes: [8, 15],
      }),
      game('wolf', { category: 'social-deduction', maxPlayers: 15 }),
    ]);
    expect(shelves.map((s) => [s.id, s.games.map((g) => g.meta.id)])).toEqual([
      ['ready', ['rps']],
      ['roles', ['spy', 'wolf']],
      ['quick', ['rps', 'spy']],
      ['few', ['rps', 'spy']],
      ['soon', ['spy', 'wolf']],
    ]);
  });

  it('drops rows that would be empty or hold a single card', () => {
    const ids = shelvesFor([game('codenames', { category: 'word' })]).map((s) => s.id);
    expect(ids).toEqual(['soon']);
  });
});
