// The live (Contact) Pac-Man room: one Durable Object per lobby session (docs/maze/LIVE.md).
// It holds the phones' WebSockets and runs LiveHub on a 50 ms loop; the game itself lives in
// @jackdaw/game-maze/live. Reports go to the lobby through this Worker's own binding.
import { LiveHub, signBody, verifyPass, type LiveCheckpoint } from '@jackdaw/game-maze/live';

const TICK_MS = 50;
/** If no report gets through, retry this often. */
const RETRY_MS = 2_000;

export interface LiveEnv {
  LIVE_ROOM: CfDurableObjectNamespace;
  WORKER_SELF_REFERENCE?: { fetch(req: Request): Promise<Response> };
  JACKDAW_LIVE_SECRET?: string;
  JACKDAW_LINK_SECRET?: string;
}

export const liveSecretOf = (env: LiveEnv): string | null =>
  env.JACKDAW_LIVE_SECRET || env.JACKDAW_LINK_SECRET || null;

export class LiveRoom {
  private hub: LiveHub | null = null;
  private code = '';
  private session = '';
  private loop: ReturnType<typeof setInterval> | null = null;
  private posting = false;
  private queued: LiveCheckpoint | null = null;
  private nextTry = 0;

  constructor(
    _state: unknown,
    private readonly env: LiveEnv,
  ) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket', { status: 426 });
    const url = new URL(req.url);
    // Only pages on this site may open a room (a pass alone isn't enough from elsewhere).
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host)
      return new Response('Wrong site', { status: 403 });
    const secret = liveSecretOf(this.env);
    const pass = secret
      ? await verifyPass(url.searchParams.get('pass') ?? '', secret, Date.now())
      : null;
    const [, , code, session] = url.pathname.split('/');
    if (!pass || pass.code !== code || pass.session !== session)
      return new Response('Bad pass', { status: 403 });
    // A session can hold several rounds: the next round's first pass starts a fresh hub.
    if (this.hub && pass.setup.round < this.hub.roundNo)
      return new Response('That round is over', { status: 403 });
    if (this.hub && pass.setup.round > this.hub.roundNo) {
      this.hub = null;
      this.queued = null;
    }
    if (!this.hub) {
      this.hub = new LiveHub(pass.setup);
      this.code = pass.code;
      this.session = pass.session;
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const hub = this.hub;
    const conn = hub.connect(
      pass.who,
      (f) => server.send(f),
      (c, why) => server.close(c, why),
      Date.now(),
    );
    if (conn) {
      server.addEventListener('message', (e) => {
        if (typeof e.data === 'string') hub.message(conn, e.data, Date.now());
      });
      const gone = () => hub.drop(conn);
      server.addEventListener('close', gone);
      server.addEventListener('error', gone);
    }
    // The round keeps its own clock whoever is connected, until the lobby has its result.
    this.loop ??= setInterval(() => this.tick(), TICK_MS);
    return new Response(null, { status: 101, webSocket: client } as CfResponseInit);
  }

  private tick(): void {
    const hub = this.hub;
    if (!hub) return;
    const report = hub.tick(Date.now());
    if (report) this.queued = report;
    if (this.queued && !this.posting && Date.now() >= this.nextTry) void this.post(this.queued);
    if (hub.stopped() && this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  private async post(report: LiveCheckpoint): Promise<void> {
    const secret = liveSecretOf(this.env);
    const self = this.env.WORKER_SELF_REFERENCE;
    const hub = this.hub;
    if (!secret || !self || !hub) return;
    this.posting = true;
    try {
      const body = JSON.stringify({ code: this.code, sessionId: this.session, result: report });
      const res = await self.fetch(
        new Request(`https://live.internal/api/lobby/${this.code}/live-result`, {
          method: 'POST',
          body,
          headers: {
            'content-type': 'application/json',
            'x-live-signature': await signBody(body, secret),
          },
        }),
      );
      hub.reported(res.status);
      if (res.ok || res.status === 409) {
        if (this.queued === report) this.queued = null;
      } else this.nextTry = Date.now() + RETRY_MS;
    } catch (e) {
      console.error('[jackdaw] live report failed', e);
      this.nextTry = Date.now() + RETRY_MS;
    } finally {
      this.posting = false;
    }
  }
}
