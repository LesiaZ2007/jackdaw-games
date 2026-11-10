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

/**
 * The one table from error code to HTTP status, for errors raised by the runtime and by the
 * lobby rules alike. A code not listed is a rule violation (NOT_YOUR_TURN, WRONG_STATUS, STALE,
 * NAME_TAKEN…), which is 409 Conflict. Clients match on `code`, not on the status.
 */
export const STATUS_BY_CODE: Record<string, number> = {
  BAD_REQUEST: 400,
  BAD_OPTIONS: 400,
  UNKNOWN_GAME: 400,
  REJOIN_INVALID: 400,
  UNAUTHORIZED: 401,
  NOT_HOST: 403,
  NOT_A_PLAYER: 403,
  LOCKED: 403,
  ASK_HOST: 403,
  BLOCKED: 403,
  NOT_FOUND: 404,
  TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_SET_UP: 501,
  BUSY: 503,
};

/** The status for a code: the table's, or 409 for a rule violation. */
export function statusFor(code: string): number {
  return STATUS_BY_CODE[code] ?? 409;
}

/**
 * Turn anything thrown while handling a request into a status and an ErrorBody. Rule
 * violations (game codes like NOT_YOUR_TURN, WRONG_STATUS, STALE…) are 409 Conflict.
 * Unexpected errors become a generic 500 so internals never reach the client.
 */
export function toErrorBody(e: unknown): { status: number; body: ErrorBody } {
  if (e instanceof RoomError || isGameError(e)) {
    return {
      status: statusFor(e.code),
      body: { error: { code: e.code, message: e.message } },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } },
  };
}
