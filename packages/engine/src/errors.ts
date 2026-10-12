/**
 * Thrown by game modules and the lobby state machine when an action isn't allowed.
 * `code` is stable and machine-readable (NOT_YOUR_TURN); `message` is shown to the player.
 */
export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export function isGameError(e: unknown): e is GameError {
  return e instanceof GameError;
}
