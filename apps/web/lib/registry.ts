import type { GameMeta, GameRegistry } from '@jackdaw/engine';
import { avalon } from '@jackdaw/game-avalon';
import { catan } from '@jackdaw/game-catan';
import { codenames } from '@jackdaw/game-codenames';
import { uno } from '@jackdaw/game-uno';
import { poker } from '@jackdaw/game-poker';
import { risk } from '@jackdaw/game-risk';
import { rps } from '@jackdaw/game-rps';
import { secretHitler } from '@jackdaw/game-secret-hitler';
import { wavelength } from '@jackdaw/game-wavelength';
import { wordhoard } from '@jackdaw/game-wordhoard';

/**
 * The one place games are registered. The room runtime runs these modules, and the catalog
 * lists their metadata. Adding a game = add its module here (screens are registered separately
 * on the client, so the server never imports React).
 */
export const games: GameRegistry = {
  [avalon.meta.id]: avalon,
  [catan.meta.id]: catan,
  [codenames.meta.id]: codenames,
  [uno.meta.id]: uno,
  [poker.meta.id]: poker,
  [risk.meta.id]: risk,
  [rps.meta.id]: rps,
  [secretHitler.meta.id]: secretHitler,
  [wavelength.meta.id]: wavelength,
  [wordhoard.meta.id]: wordhoard,
};

/** Catalog metadata for every registered game, in display order. */
export const catalog: GameMeta[] = Object.values(games).map((g) => g.meta);

export function gameMeta(id: string | null | undefined): GameMeta | null {
  return (id && games[id]?.meta) || null;
}
