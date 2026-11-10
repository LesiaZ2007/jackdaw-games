import type { GameCategory, GameMeta } from '@jackdaw/engine';
import { meta as avalon } from '@jackdaw/game-avalon/meta';
import { meta as backgammon } from '@jackdaw/game-backgammon/meta';
import { meta as battleship } from '@jackdaw/game-battleship/meta';
import { meta as catan } from '@jackdaw/game-catan/meta';
import { meta as codenames } from '@jackdaw/game-codenames/meta';
import { meta as fandango } from '@jackdaw/game-fandango/meta';
import { meta as kings } from '@jackdaw/game-kings/meta';
import { meta as mafia } from '@jackdaw/game-mafia/meta';
import { meta as monopoly } from '@jackdaw/game-monopoly/meta';
import { meta as poker } from '@jackdaw/game-poker/meta';
import { meta as risk } from '@jackdaw/game-risk/meta';
import { meta as rps } from '@jackdaw/game-rps/meta';
import { meta as secretHitler } from '@jackdaw/game-secret-hitler/meta';
import { meta as solitaire } from '@jackdaw/game-solitaire/meta';
import { meta as uno } from '@jackdaw/game-uno/meta';
import { meta as wavelength } from '@jackdaw/game-wavelength/meta';
import { meta as wordhoard } from '@jackdaw/game-wordhoard/meta';
import { meta as zap } from '@jackdaw/game-zap/meta';
import type { Field, GameArt, Heraldic } from '@jackdaw/ui';

/**
 * The games as the home page needs them: name, sizes and box art, and nothing else. It imports
 * each game's `meta` only (a few lines of data), never its rules, bot or screens, so the first
 * page a visitor loads doesn't carry every game. The full catalog (lib/catalog.ts), with each
 * game's screens and write-up, is for the lobby and the game pages. A test keeps the two in step.
 */

export interface Kind {
  kind: GameCategory;
  /** Short label for a cover's tag and the filters, e.g. "Board". */
  label: string;
  /** The heading over a group of them, e.g. "Board games". */
  title: string;
  line: string;
  /** The tincture this kind is printed in, wherever a game's box shows. */
  tint: Heraldic;
  /** The glyph on its shield. */
  glyph: string;
}

/**
 * The kinds of game. A Record, so a new kind won't typecheck until it has an entry (and can't
 * drop off the home page).
 */
const KIND_INFO: Record<GameCategory, Omit<Kind, 'kind'>> = {
  'social-deduction': {
    label: 'Hidden roles',
    title: 'Hidden roles',
    line: 'Lie, accuse, survive.',
    tint: 'gules',
    glyph: 'avalon',
  },
  board: {
    label: 'Board',
    title: 'Board games',
    line: 'Long evenings and big maps.',
    tint: 'vert',
    glyph: 'hexes',
  },
  card: {
    label: 'Card',
    title: 'Card games',
    line: 'Shuffle up and deal.',
    tint: 'azure',
    glyph: 'cards',
  },
  word: {
    label: 'Word and party',
    title: 'Word and party',
    line: 'Clues, guesses and shouting.',
    tint: 'purpure',
    glyph: 'tiles',
  },
  mini: {
    label: 'Mini game',
    title: 'Mini games',
    line: 'A quick round between the big ones.',
    tint: 'tenne',
    glyph: 'bolt',
  },
};

/**
 * The kinds in the one order every list uses: the home shelves, the catalog, the lobby's picker
 * and the filters.
 */
export const KINDS: Kind[] = (
  ['social-deduction', 'board', 'card', 'word', 'mini'] satisfies GameCategory[]
).map((kind) => ({ kind, ...KIND_INFO[kind] }));

export const kindOrder = (category: GameCategory) => KINDS.findIndex((k) => k.kind === category);

/**
 * A game's box is printed in its kind's color wherever it shows (2026-10-31: "each category has
 * its own color"), so a game never changes color between the home page, the catalog, the lobby
 * and the TV. Its field pattern and emblem stay its own.
 */
export const boxArt = (art: Pick<GameArt, 'field' | 'glyph'>, category: GameCategory): GameArt => ({
  ...art,
  band: KIND_INFO[category].tint,
});

/** Short kind labels, in the shared order. */
export const CATEGORY_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label])) as Record<
  GameCategory,
  string
>;

export const COMPLEXITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

/** Why a game can't be played with this many players, or null if it can. */
export function unfitReason(meta: GameMeta, players: number): string | null {
  if (players >= meta.minPlayers && players <= meta.maxPlayers) return null;
  return meta.minPlayers === meta.maxPlayers
    ? `Needs exactly ${meta.minPlayers} players`
    : `Needs ${meta.minPlayers} to ${meta.maxPlayers} players`;
}

/** A game's box: enough to print its cover. */
export interface BoxEntry {
  meta: GameMeta;
  art: GameArt;
}

/** Each playable game's field and emblem (the same pair its screens module declares as `art`). */
const BOXES: [GameMeta, Field, string][] = [
  [avalon, 'wavy', 'avalon'],
  [backgammon, 'paly', 'tables'],
  [battleship, 'fretty', 'ship'],
  [catan, 'semee', 'hexes'],
  [codenames, 'checky', 'grid'],
  [fandango, 'semee', 'sunmoon'],
  [kings, 'checky', 'crown'],
  [mafia, 'fretty', 'fedora'],
  [monopoly, 'fretty', 'house'],
  [poker, 'lozengy', 'cards'],
  [risk, 'checky', 'banners'],
  [rps, 'paly', 'rps'],
  [secretHitler, 'lozengy', 'ballot'],
  [solitaire, 'bendy', 'patience'],
  [uno, 'checky', 'uno'],
  [wavelength, 'bendy', 'dial'],
  [wordhoard, 'semee', 'tiles'],
  [zap, 'bendy', 'bolt'],
];

/** Every playable game's box, by kind and then by name: the order of the full catalog. */
export const boxes: BoxEntry[] = BOXES.map(([meta, field, glyph]) => ({
  meta,
  art: boxArt({ field, glyph }, meta.category),
})).sort(
  (a, b) =>
    kindOrder(a.meta.category) - kindOrder(b.meta.category) ||
    a.meta.name.localeCompare(b.meta.name),
);
