// SPIKE (docs/maze/LIVE-PLAN-1.md): one Durable Object per spike room. It owns the sockets and a
// 50 ms loop around the pure LiveRound; everything the game decides lives in LiveRound.
import { LiveRound, layoutsOf, type Dir } from '@jackdaw/game-maze/live';

const BROADCAST_MS = 50;
const DIRS: readonly string[] = ['up', 'down', 'left', 'right'];

interface Conn {
  ws: CfWebSocket;
  id: string | null;
  /** Turns this socket sent in the current second (a simple flood guard). */
  sent: number;
}

export class LiveSpikeRoom {
  private round: LiveRound | null = null;
  private startedAt = 0;
  private readonly conns = new Set<Conn>();
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastT = 0;
  private second = 0;

  constructor(_state: unknown, _env: unknown) {}

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    const conn: Conn = { ws: server, id: null, sent: 0 };
    this.conns.add(conn);
    server.addEventListener('message', (e) => this.onMessage(conn, e.data));
    const gone = () => this.drop(conn);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client } as CfResponseInit);
  }

  private onMessage(conn: Conn, data: string | ArrayBuffer): void {
    if (typeof data !== 'string' || data.length > 200) return;
    let msg: { t?: unknown; name?: unknown; d?: unknown; n?: unknown };
    try {
      msg = JSON.parse(data) as typeof msg;
    } catch {
      return;
    }
    if (msg.t === 'join' && typeof msg.name === 'string' && !conn.id) {
      const name = msg.name.trim().slice(0, 16) || 'Wren';
      if (!this.round) {
        this.startedAt = Date.now();
        this.lastT = 0;
        this.round = new LiveRound({ layout: layoutsOf('Medium')[0]!, startedAt: this.startedAt });
      }
      const id = this.round.join(name);
      if (!id) {
        conn.ws.close(4000, 'full');
        return;
      }
      for (const other of this.conns)
        if (other !== conn && other.id === id) other.ws.close(4001, 'Playing on another device');
      conn.id = id;
      this.send(conn, {
        t: 'hello',
        id,
        serverNow: Date.now(),
        startedAt: this.startedAt,
        layoutId: layoutsOf('Medium')[0]!.id,
      });
      this.loop ??= setInterval(() => this.tick(), BROADCAST_MS);
      return;
    }
    if (msg.t === 'dir' && conn.id && this.round && DIRS.includes(msg.d as string)) {
      if (++conn.sent > 30) return;
      this.round.input(conn.id, msg.d as Dir, typeof msg.n === 'number' ? msg.n : 0);
    }
  }

  private tick(): void {
    if (!this.round) return;
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    if (sec !== this.second) {
      this.second = sec;
      for (const c of this.conns) c.sent = 0;
    }
    this.round.advance(now);
    // One snapshot per broadcast: snapshot() drains the contact events (ledger, Task 2).
    const s = this.round.snapshot(this.lastT);
    this.lastT = s.t;
    const frame = JSON.stringify({ t: 'snap', s, serverNow: now });
    for (const c of this.conns) if (c.id) this.sendRaw(c, frame);
  }

  private drop(conn: Conn): void {
    this.conns.delete(conn);
    if (this.conns.size > 0) return;
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.round = null;
  }

  private send(conn: Conn, msg: unknown): void {
    this.sendRaw(conn, JSON.stringify(msg));
  }

  private sendRaw(conn: Conn, frame: string): void {
    try {
      conn.ws.send(frame);
    } catch {
      this.drop(conn);
    }
  }
}
