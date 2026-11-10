import type { GameMeta } from '@jackdaw/engine';
import { avalonUi } from '@jackdaw/game-avalon/ui';
import { backgammonUi } from '@jackdaw/game-backgammon/ui';
import { battleshipUi } from '@jackdaw/game-battleship/ui';
import { monopolyUi } from '@jackdaw/game-monopoly/ui';
import { catanUi } from '@jackdaw/game-catan/ui';
import { codenamesUi } from '@jackdaw/game-codenames/ui';
import { kingsUi } from '@jackdaw/game-kings/ui';
import { mafiaUi } from '@jackdaw/game-mafia/ui';
import { cambioUi } from '@jackdaw/game-cambio/ui';
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
import type { GameAbout, GameArt, GameUi } from '@jackdaw/ui';
import { boxArt, kindOrder } from './games-lite';
import { games } from './registry';
import { upcoming } from './upcoming';

/**
 * Everything the catalog and lobby know about each game. Playable games come from the
 * registry (rules) plus their UI module (art, about, screens). Games still being built are
 * listed too, grayed as "Coming soon", so friends can see what's next.
 *
 * This module carries every game's rules and screens. The home page uses lib/games-lite.ts
 * instead, which has only what a box cover needs.
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
  cambio: cambioUi,
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

export { CATEGORY_LABEL, COMPLEXITY_LABEL, KINDS, unfitReason, type Kind } from './games-lite';

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
