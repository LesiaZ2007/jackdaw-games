import type { GameMeta, GameRegistry } from '@jackdaw/engine';
import { avalon } from '@jackdaw/game-avalon';
import { codenames } from '@jackdaw/game-codenames';
import { poker } from '@jackdaw/game-poker';
import { rps } from '@jackdaw/game-rps';
import { secretHitler } from '@jackdaw/game-secret-hitler';
import { wordhoard } from '@jackdaw/game-wordhoard';

/**
 * The one place games are registered. The room runtime runs these modules, and the catalog
 * lists their metadata. Adding a game = add its module here (screens are registered separately
 * on the client, so the server never imports React).
 */
export const games: GameRegistry = {
  [avalon.meta.id]: avalon,
  [codenames.meta.id]: codenames,
  [poker.meta.id]: poker,
  [rps.meta.id]: rps,
  [secretHitler.meta.id]: secretHitler,
  [wordhoard.meta.id]: wordhoard,
};

/** Catalog metadata for every registered game, in display order. */
export const catalog: GameMeta[] = Object.values(games).map((g) => g.meta);

export function gameMeta(id: string | null | undefined): GameMeta | null {
  return (id && games[id]?.meta) || null;
}
