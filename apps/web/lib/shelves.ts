import type { CatalogEntry } from './catalog';

export interface Shelf {
  id: string;
  title: string;
  /** One plain line under the title saying what the row has in common. */
  blurb: string;
  games: CatalogEntry[];
}

interface ShelfRule {
  id: string;
  title: string;
  blurb: string;
  test: (e: CatalogEntry) => boolean;
  /** Rows with fewer games than this are left out (a lone card isn't much of a shelf). */
  min?: number;
}

const RULES: ShelfRule[] = [
  {
    id: 'ready',
    title: 'Ready to play',
    blurb: 'Open a lobby and start one of these tonight.',
    test: (e) => e.playable,
    min: 1,
  },
  {
    id: 'roles',
    title: 'Hidden roles and bluffing',
    blurb: 'Someone at the table is lying. Work out who.',
    test: (e) => e.meta.category === 'social-deduction',
  },
  {
    id: 'quick',
    title: 'Quick games',
    blurb: 'Fifteen minutes or less, for while the pizza arrives.',
    test: (e) => e.meta.minutes[0] <= 15 && e.meta.minutes[1] <= 15,
  },
  {
    id: 'few',
    title: 'Fine with three',
    blurb: 'Good when only a few of you made it.',
    test: (e) => e.meta.minPlayers <= 3,
  },
  {
    id: 'words',
    title: 'Words and party',
    blurb: 'Clues, guesses and shouting.',
    test: (e) => e.meta.category === 'word',
  },
  {
    id: 'soon',
    title: 'Coming soon',
    blurb: 'Being built for the compendium now.',
    test: (e) => !e.playable,
    min: 1,
  },
];

/** The home page's carousels: catalog games grouped by what they're good for. */
export function shelvesFor(catalog: CatalogEntry[]): Shelf[] {
  return RULES.flatMap(({ test, min = 2, ...rule }) => {
    const games = catalog.filter(test);
    return games.length >= min ? [{ ...rule, games }] : [];
  });
}
