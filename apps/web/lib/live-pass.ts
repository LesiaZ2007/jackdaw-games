// The browser side of live (Contact) Pac-Man: what the shell hands game screens as `livePass`
// (docs/maze/LIVE.md, "How it fits together").
import { KEYS, deviceStore } from './identity';

export type LivePassFn = () => Promise<{ pass: string; path: string } | null>;

const made = new Map<string, LivePassFn>();

/**
 * A screen's `livePass` for this lobby: it fetches a signed pass to the lobby's live room, as
 * this device's player or (`tv`) as a viewer. Undefined on a site without live rooms (only the
 * Cloudflare build sets NEXT_PUBLIC_LIVE=1). The same function comes back for the same lobby and
 * role, so a screen keeps its socket across renders.
 */
export function livePassFor(
  code: string,
  tv: boolean,
  live = process.env.NEXT_PUBLIC_LIVE === '1',
): LivePassFn | undefined {
  if (!live) return undefined;
  const key = `${code}:${tv ? 'tv' : 'phone'}`;
  let fn = made.get(key);
  if (!fn) {
    fn = async () => {
      const res = await fetch(`/api/lobby/${code}/live${tv ? '?tv=1' : ''}`, {
        method: 'POST',
        headers: tv ? {} : { 'x-player-token': deviceStore().getItem(KEYS.token) ?? '' },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const body = (await res.json().catch(() => null)) as {
        pass?: unknown;
        path?: unknown;
      } | null;
      return typeof body?.pass === 'string' && typeof body.path === 'string'
        ? { pass: body.pass, path: body.path }
        : null;
    };
    made.set(key, fn);
  }
  return fn;
}
