// Live (Contact) Pac-Man's two routes, kept apart from Next so they can be tested with an
// in-memory runtime (docs/maze/LIVE.md, "How it fits together").
import { LIVE_GRACE_MS, type MazeTableView } from '@jackdaw/game-maze';
import { liveSetupFrom, signPass, verifyBody, type LivePass } from '@jackdaw/game-maze/live';
import { toErrorBody, type RoomRuntime } from '@jackdaw/server';

/** A pass outlives the round's planned end by this much, so a phone can still reconnect. */
const PASS_SPARE_MS = LIVE_GRACE_MS + 60_000;
/** The TV polls as this display while it fetches its pass. */
const TV_DISPLAY = 'live-tv-pass';

type Out = { status: number; body: unknown };
const fail = (status: number, code: string, message: string): Out => ({
  status,
  body: { error: { code, message } },
});

/** The secret live rooms sign with: JACKDAW_LIVE_SECRET, else the linked games' secret. */
export function liveSecret(): string | null {
  return process.env.JACKDAW_LIVE_SECRET || process.env.JACKDAW_LINK_SECRET || null;
}

/** Live rooms run only on the Cloudflare deployment (NEXT_PUBLIC_LIVE=1 is set by its build). */
export const liveOn = (): boolean => process.env.NEXT_PUBLIC_LIVE === '1';

/**
 * A signed pass to the lobby's live round, for a seated phone (its token) or the TV. The pass
 * carries the round's public setup, so the Durable Object can start the round from it.
 */
export async function issueLivePass(
  runtime: RoomRuntime,
  code: string,
  who: { token?: string | null; tv?: boolean },
  secret: string,
  now: number,
): Promise<Out> {
  let snap;
  try {
    snap = who.tv
      ? await runtime.poll(code, { displayId: TV_DISPLAY })
      : await runtime.poll(code, { token: who.token ?? null });
  } catch (e) {
    const { status, body } = toErrorBody(e);
    return { status, body };
  }
  if ('unchanged' in snap || snap.status !== 'in_game' || !snap.session)
    return fail(409, 'NOT_LIVE', "There's no live round right now.");
  const playerId = who.tv ? 'tv' : snap.me;
  if (!playerId) return fail(403, 'NOT_A_PLAYER', "You're not in this lobby.");
  const tv = snap.tableView as MazeTableView;
  const setup = liveSetupFrom(tv, snap.players);
  if (!setup) return fail(409, 'NOT_LIVE', "This round isn't played live.");
  if (playerId !== 'tv' && !setup.seats.some((s) => s.id === playerId))
    return fail(403, 'NOT_A_PLAYER', "You're watching this round.");
  const pass: LivePass = {
    code: snap.code,
    session: snap.session.id,
    who: playerId,
    exp: Math.max(now, setup.endAt) + PASS_SPARE_MS,
    setup,
  };
  return {
    status: 200,
    body: { pass: await signPass(pass, secret), path: `/live/${snap.code}/${snap.session.id}` },
  };
}

/**
 * A live room's report (signed with the shared secret): `{ code, sessionId, result }`, applied
 * as the game's server-only `liveResult`. 409 tells the room its session is over.
 */
export async function takeLiveResult(
  runtime: RoomRuntime,
  code: string,
  body: string,
  signature: string | null,
  secret: string,
): Promise<Out> {
  if (!signature || !(await verifyBody(body, signature, secret)))
    return fail(401, 'BAD_SIGNATURE', 'Not signed by a live room.');
  let msg: { code?: unknown; sessionId?: unknown; result?: unknown };
  try {
    msg = JSON.parse(body) as typeof msg;
  } catch {
    return fail(400, 'BAD_REQUEST', 'Not JSON.');
  }
  if (msg.code !== code || typeof msg.sessionId !== 'string')
    return fail(400, 'BAD_REQUEST', 'Wrong lobby or session.');
  try {
    await runtime.serverAction(code, msg.sessionId, msg.result);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    const { status, body: err } = toErrorBody(e);
    return { status, body: err };
  }
}
