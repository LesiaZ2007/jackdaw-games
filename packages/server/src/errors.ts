import { isGameError, type ErrorBody } from '@jackdaw/engine';

/** An error with an HTTP status, raised by the runtime itself (not by game rules). */
export class RoomError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RoomError';
  }
}

const STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  BAD_OPTIONS: 400,
  UNKNOWN_GAME: 400,
  REJOIN_INVALID: 400,
  NOT_HOST: 403,
  NOT_A_PLAYER: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  BUSY: 503,
};

/**
 * Turn anything thrown while handling a request into a status and an ErrorBody. Rule
 * violations (game codes like NOT_YOUR_TURN, WRONG_STATUS, STALE…) are 409 Conflict.
 * Unexpected errors become a generic 500 so internals never reach the client.
 */
export function toErrorBody(e: unknown): { status: number; body: ErrorBody } {
  if (e instanceof RoomError) {
    return { status: e.status, body: { error: { code: e.code, message: e.message } } };
  }
  if (isGameError(e)) {
    return {
      status: STATUS_BY_CODE[e.code] ?? 409,
      body: { error: { code: e.code, message: e.message } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } },
  };
}
