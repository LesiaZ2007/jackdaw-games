import type { GameCategory, GameMeta } from '@jackdaw/engine';
import { avalonUi } from '@jackdaw/game-avalon/ui';
import { backgammonUi } from '@jackdaw/game-backgammon/ui';
import { battleshipUi } from '@jackdaw/game-battleship/ui';
import { monopolyUi } from '@jackdaw/game-monopoly/ui';
import { catanUi } from '@jackdaw/game-catan/ui';
import { codenamesUi } from '@jackdaw/game-codenames/ui';
import { kingsUi } from '@jackdaw/game-kings/ui';
import { mafiaUi } from '@jackdaw/game-mafia/ui';
import { unoUi } from '@jackdaw/game-uno/ui';
import { pokerUi } from '@jackdaw/game-poker/ui';
import { riskUi } from '@jackdaw/game-risk/ui';
import { rpsUi } from '@jackdaw/game-rps/ui';
import { secretHitlerUi } from '@jackdaw/game-secret-hitler/ui';
import { wavelengthUi } from '@jackdaw/game-wavelength/ui';
import { wordhoardUi } from '@jackdaw/game-wordhoard/ui';
import { zapUi } from '@jackdaw/game-zap/ui';
import { fandangoUi } from '@jackdaw/game-fandango/ui';
import { solitaireUi } from '@jackdaw/game-solitaire/ui';
import type { GameAbout, GameUi, Heraldic } from '@jackdaw/ui';
import { games } from './registry';
import { upcoming } from './upcoming';
import type { GameArt } from '@jackdaw/ui';

/**
 * Everything the catalog and lobby know about each game. Playable games come from the
 * registry (rules) plus their UI module (art, about, screens). Games still being built are
 * listed too, greyed as "Coming soon", so friends can see what's next.
 */
export interface CatalogEntry {
  meta: GameMeta;
  art: GameArt;
  about: GameAbout;
  playable: boolean;
  /** Present only for playable games. */
  ui?: GameUi;
}

/** Client UI modules for registered games, by id. Add a game's `./ui` export here. */
export const gameUis: Record<string, GameUi> = {
  avalon: avalonUi,
  backgammon: backgammonUi,
  battleship: battleshipUi,
  monopoly: monopolyUi,
  catan: catanUi,
  codenames: codenamesUi,
  kings: kingsUi,
  mafia: mafiaUi,
  uno: unoUi,
  poker: pokerUi,
  risk: riskUi,
  rps: rpsUi,
  'secret-hitler': secretHitlerUi,
  wavelength: wavelengthUi,
  wordhoard: wordhoardUi,
  zap: zapUi,
  fandango: fandangoUi,
  solitaire: solitaireUi,
};

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

const kindOrder = (category: GameCategory) => KINDS.findIndex((k) => k.kind === category);

/**
 * A game's box is printed in its kind's color wherever it shows (2026-10-31: "each category has
 * its own color"), so a game never changes color between the home page, the catalog, the lobby
 * and the TV. Its field pattern and emblem stay its own.
 */
const boxArt = (art: GameArt, category: GameCategory): GameArt => ({
  ...art,
  band: KIND_INFO[category].tint,
});

/** Every game, playable ones first, each group by kind and then by name. */
export const catalog: CatalogEntry[] = [
  ...Object.values(games).flatMap((g) => {
    const ui = gameUis[g.meta.id];
    const art = ui && boxArt(ui.art, g.meta.category);
    return ui ? [{ meta: g.meta, art: art!, about: ui.about, playable: true, ui }] : [];
  }),
  ...upcoming
    .filter((u) => !games[u.meta.id])
    .map((u) => ({ ...u, art: boxArt(u.art, u.meta.category), playable: false })),
].sort(
  (a, b) =>
    Number(b.playable) - Number(a.playable) ||
    kindOrder(a.meta.category) - kindOrder(b.meta.category) ||
    a.meta.name.localeCompare(b.meta.name),
);

export function catalogEntry(id: string | null | undefined): CatalogEntry | undefined {
  return catalog.find((e) => e.meta.id === id);
}

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
