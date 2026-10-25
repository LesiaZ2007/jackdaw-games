import type { GameMeta } from '@jackdaw/engine';
import type { GameAbout, GameArt } from '@jackdaw/ui';
import { games } from './registry';

/**
 * Games still being built, listed in the catalog greyed as "Coming soon" (none right now). Plain
 * data with no React, so server code (page titles) can read it too. Werewolf and Spyfall were
 * listed here until they were dropped (2026-10-24).
 */
export const upcoming: { meta: GameMeta; art: GameArt; about: GameAbout }[] = [];

/** A game's metadata by id, playable or coming soon, for server code; undefined if unknown. */
export function knownGame(id: string): GameMeta | undefined {
  return games[id]?.meta ?? upcoming.find((u) => u.meta.id === id)?.meta;
}
