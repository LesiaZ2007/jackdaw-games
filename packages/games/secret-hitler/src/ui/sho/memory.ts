import type { GameState } from './types';

/**
 * The last game state this phone showed, so the end screen can play the last moves (the final
 * vote, policy or execution) before the victory popup, as secret-hitler.online does. The game
 * ends on the server in the same move, so the game screen itself never sees the final state.
 */
let last: GameState | null = null;

export function remember(gameState: GameState) {
  last = gameState;
}

/** The remembered state, if it was this table. */
export function recall(playerOrder: string[]): GameState | null {
  if (!last || last.playerOrder.join('\n') !== playerOrder.join('\n')) return null;
  return last;
}
