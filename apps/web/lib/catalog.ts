import type { GameCategory, GameMeta } from '@jackdaw/engine';
import { avalonUi } from '@jackdaw/game-avalon/ui';
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
import type { GameAbout, GameUi } from '@jackdaw/ui';
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
};

/** The order games are listed in: grouped loosely by kind. */
const KIND_ORDER: GameCategory[] = ['social-deduction', 'word', 'card', 'board', 'mini'];

/** Every game, playable ones first, each group by kind and then by name. */
export const catalog: CatalogEntry[] = [
  ...Object.values(games).flatMap((g) => {
    const ui = gameUis[g.meta.id];
    return ui ? [{ meta: g.meta, art: ui.art, about: ui.about, playable: true, ui }] : [];
  }),
  ...upcoming.filter((u) => !games[u.meta.id]).map((u) => ({ ...u, playable: false })),
].sort(
  (a, b) =>
    Number(b.playable) - Number(a.playable) ||
    KIND_ORDER.indexOf(a.meta.category) - KIND_ORDER.indexOf(b.meta.category) ||
    a.meta.name.localeCompare(b.meta.name),
);

export function catalogEntry(id: string | null | undefined): CatalogEntry | undefined {
  return catalog.find((e) => e.meta.id === id);
}

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  'social-deduction': 'Hidden roles',
  word: 'Word and party',
  card: 'Card',
  board: 'Board',
  mini: 'Mini game',
};

export const COMPLEXITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

/** Why a game can't be played with this many players, or null if it can. */
export function unfitReason(meta: GameMeta, players: number): string | null {
  if (players >= meta.minPlayers && players <= meta.maxPlayers) return null;
  return meta.minPlayers === meta.maxPlayers
    ? `Needs exactly ${meta.minPlayers} players`
    : `Needs ${meta.minPlayers} to ${meta.maxPlayers} players`;
}
