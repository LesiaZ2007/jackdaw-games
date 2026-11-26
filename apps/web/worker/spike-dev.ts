// SPIKE (docs/maze/LIVE-PLAN-1.md): a standalone Worker for the live maze's feel check, run only
// with `pnpm --filter @jackdaw/web live:spike` (wrangler dev, never deployed). It serves the
// feel-check page from worker/.spike and sends /live/spike/<ROOM> sockets to the Durable Object.
// The real Contact mode mounts the Durable Object in the jackdaw Worker instead (next plan).
export { LiveSpikeRoom } from './spike-room';

const SPIKE = /^\/live\/spike\/([A-Z0-9]{1,8})$/;

interface Env extends LiveSpikeEnv {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/live/')) return env.ASSETS.fetch(req);
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket', { status: 426 });
    const room = SPIKE.exec(path)?.[1];
    if (!room) return new Response('Bad room', { status: 400 });
    return env.LIVE_SPIKE_ROOM.get(env.LIVE_SPIKE_ROOM.idFromName(room)).fetch(req);
  },
};
