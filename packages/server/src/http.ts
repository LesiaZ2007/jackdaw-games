import { CreateLobbyRequest, LobbyCode, RedeemRejoinRequest } from '@jackdaw/engine';
import { RoomError, toErrorBody } from './errors';
import { isValidDisplayId, isValidToken, type RoomRuntime } from './runtime';

/**
 * Web-standard HTTP handlers (Request → Response) around the room runtime. Next.js route
 * handlers call these today; a Cloudflare Worker could call the same functions later.
 *
 *   POST /api/lobby                 create      header x-player-token, body CreateLobbyRequest
 *   GET  /api/lobby/:code?v=N       poll        header x-player-token (players) or x-display-id (TV)
 *   POST /api/lobby/:code           message     header x-player-token, body ClientMessage
 *   POST /api/lobby/:code/rejoin    rejoin      header x-player-token, body { rejoinCode }
 *   GET  /api/lobby/:code/stats     stats       full history and lobbyStats, for the Game stats menu
 */

export const TOKEN_HEADER = 'x-player-token';
export const DISPLAY_HEADER = 'x-display-id';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function errorResponse(e: unknown): Response {
  const { status, body } = toErrorBody(e);
  if (status >= 500 && !(e instanceof RoomError)) console.error('[jackdaw] request failed', e);
  return json(body, status);
}

function requireToken(req: Request): string {
  const token = req.headers.get(TOKEN_HEADER);
  if (!isValidToken(token))
    throw new RoomError(401, 'BAD_REQUEST', 'Missing or invalid player token.');
  return token;
}

function parseCode(raw: string): string {
  const code = LobbyCode.safeParse(raw);
  if (!code.success) throw new RoomError(404, 'NOT_FOUND', 'Lobby codes are 4 letters.');
  return code.data;
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new RoomError(400, 'BAD_REQUEST', 'The request body must be JSON.');
  }
}

export function createHttpHandlers(runtime: RoomRuntime) {
  return {
    async createLobby(req: Request): Promise<Response> {
      try {
        const token = requireToken(req);
        const body = CreateLobbyRequest.safeParse(await readJson(req));
        if (!body.success)
          throw new RoomError(400, 'BAD_REQUEST', body.error.issues[0]?.message ?? 'Bad request.');
        return json(await runtime.create({ token, ...body.data }), 201);
      } catch (e) {
        return errorResponse(e);
      }
    },

    async getLobby(req: Request, rawCode: string): Promise<Response> {
      try {
        const code = parseCode(rawCode);
        const token = req.headers.get(TOKEN_HEADER);
        const displayId = req.headers.get(DISPLAY_HEADER);
        const v = new URL(req.url).searchParams.get('v');
        const since = v !== null && /^\d+$/.test(v) ? Number(v) : null;
        return json(
          await runtime.poll(
            code,
            {
              token: isValidToken(token) ? token : null,
              displayId: isValidDisplayId(displayId) ? displayId : null,
            },
            since,
          ),
        );
      } catch (e) {
        return errorResponse(e);
      }
    },

    async postLobby(req: Request, rawCode: string): Promise<Response> {
      try {
        const code = parseCode(rawCode);
        const token = requireToken(req);
        return json(
          await runtime.post(code, token, await readJson(req), { origin: new URL(req.url).origin }),
        );
      } catch (e) {
        return errorResponse(e);
      }
    },

    async getStats(_req: Request, rawCode: string): Promise<Response> {
      try {
        return json(await runtime.stats(parseCode(rawCode)));
      } catch (e) {
        return errorResponse(e);
      }
    },

    async rejoin(req: Request, rawCode: string): Promise<Response> {
      try {
        const code = parseCode(rawCode);
        const token = requireToken(req);
        const body = RedeemRejoinRequest.safeParse(await readJson(req));
        if (!body.success)
          throw new RoomError(400, 'REJOIN_INVALID', 'Rejoin codes are 6 letters.');
        return json(await runtime.redeemRejoin(code, token, body.data.rejoinCode));
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}
