import {
  CreateLobbyRequest,
  LobbyCode,
  RedeemRejoinRequest,
  REJOIN_CODE_LENGTH,
} from '@jackdaw/engine';
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
 *   POST /api/lobby/:code/push      push        header x-player-token, body { subscription | null }
 */

export const TOKEN_HEADER = 'x-player-token';
export const DISPLAY_HEADER = 'x-display-id';

/** Request bodies are tiny (a message, a name); anything bigger is refused before parsing. */
export const MAX_BODY_BYTES = 32 * 1024;

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
    throw new RoomError(401, 'UNAUTHORIZED', 'Missing or invalid player token.');
  return token;
}

function parseCode(raw: string): string {
  const code = LobbyCode.safeParse(raw);
  if (!code.success) throw new RoomError(404, 'NOT_FOUND', 'Lobby codes are 4 letters.');
  return code.data;
}

async function readJson(req: Request): Promise<unknown> {
  const tooLarge = () => new RoomError(413, 'TOO_LARGE', 'That request is too large.');
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new RoomError(400, 'BAD_REQUEST', 'The request body must be JSON.');
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new RoomError(400, 'BAD_REQUEST', 'The request body must be JSON.');
  }
}

/**
 * The client's address as Vercel (or any proxy in front) reports it. Without any address header
 * every such request shares one 'unknown' bucket, so the address limits still apply.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unknown'
  );
}

export function createHttpHandlers(runtime: RoomRuntime) {
  /**
   * Runs a request for one lobby. An address that keeps asking for lobbies that don't exist
   * (guessing codes) is turned away for a while.
   */
  async function forLobby(
    req: Request,
    handle: (ip: string) => Promise<Response>,
  ): Promise<Response> {
    const ip = clientIp(req);
    try {
      runtime.checkAddress(ip);
      return await handle(ip);
    } catch (e) {
      if (e instanceof RoomError && e.code === 'NOT_FOUND') runtime.noteMiss(ip);
      return errorResponse(e);
    }
  }

  return {
    async createLobby(req: Request): Promise<Response> {
      try {
        const token = requireToken(req);
        const body = CreateLobbyRequest.safeParse(await readJson(req));
        if (!body.success)
          throw new RoomError(400, 'BAD_REQUEST', body.error.issues[0]?.message ?? 'Bad request.');
        return json(await runtime.create({ token, ...body.data, ip: clientIp(req) }), 201);
      } catch (e) {
        return errorResponse(e);
      }
    },

    async getLobby(req: Request, rawCode: string): Promise<Response> {
      return forLobby(req, async (ip) => {
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
              ip,
            },
            since,
          ),
        );
      });
    },

    async postLobby(req: Request, rawCode: string): Promise<Response> {
      return forLobby(req, async (ip) => {
        const code = parseCode(rawCode);
        const token = requireToken(req);
        return json(
          await runtime.post(code, token, await readJson(req), {
            origin: new URL(req.url).origin,
            ip,
          }),
        );
      });
    },

    async getStats(req: Request, rawCode: string): Promise<Response> {
      return forLobby(req, async (ip) => {
        const token = req.headers.get(TOKEN_HEADER);
        return json(
          await runtime.stats(parseCode(rawCode), {
            token: isValidToken(token) ? token : null,
            ip,
          }),
        );
      });
    },

    async setPush(req: Request, rawCode: string): Promise<Response> {
      return forLobby(req, async (ip) => {
        const code = parseCode(rawCode);
        const token = requireToken(req);
        const body = await readJson(req);
        if (typeof body !== 'object' || body === null || Array.isArray(body))
          throw new RoomError(400, 'BAD_REQUEST', 'The request body must be a JSON object.');
        const { subscription } = body as { subscription?: unknown };
        await runtime.setPush(code, token, subscription ?? null, { ip });
        return json({ ok: true });
      });
    },

    async rejoin(req: Request, rawCode: string): Promise<Response> {
      return forLobby(req, async (ip) => {
        const code = parseCode(rawCode);
        const token = requireToken(req);
        const body = RedeemRejoinRequest.safeParse(await readJson(req));
        if (!body.success) {
          runtime.noteMiss(ip);
          throw new RoomError(
            400,
            'REJOIN_INVALID',
            `Rejoin codes are ${REJOIN_CODE_LENGTH} letters.`,
          );
        }
        return json(await runtime.redeemRejoin(code, token, body.data.rejoinCode, { ip }));
      });
    },
  };
}
