import type { GameMeta, GameRegistry } from '@jackdaw/engine';
import { avalon } from '@jackdaw/game-avalon';
import { rps } from '@jackdaw/game-rps';
import { secretHitler } from '@jackdaw/game-secret-hitler';

/**
 * The one place games are registered. The room runtime runs these modules, and the catalog
 * lists their metadata. Adding a game = add its module here (screens are registered separately
 * on the client, so the server never imports React).
 */
export const games: GameRegistry = {
  [avalon.meta.id]: avalon,
  [rps.meta.id]: rps,
  [secretHitler.meta.id]: secretHitler,
};

/** Catalog metadata for every registered game, in display order. */
export const catalog: GameMeta[] = Object.values(games).map((g) => g.meta);

export function gameMeta(id: string | null | undefined): GameMeta | null {
  return (id && games[id]?.meta) || null;
}
