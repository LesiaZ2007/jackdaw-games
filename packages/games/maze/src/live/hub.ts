import type { Dir } from '../sim/walker';
import type { LiveSetup } from './pass';
import { LiveRound, type LiveCheckpoint } from './round';
import { roundOptionsFrom } from './setup';

/** The lobby hears from the room this often while it plays, and once more at the end. */
export const REPORT_EVERY_MS = 10_000;
const DIRS: readonly string[] = ['up', 'down', 'left', 'right'];
/** Turns one phone may send in a second. */
const TURNS_PER_SECOND = 30;

export interface HubConn {
  /** Seat id in the round (p1…), or null for the TV. */
  seat: string | null;
  send(frame: string): void;
  close(code: number, reason: string): void;
  turns: number;
  second: number;
  open: boolean;
}

/**
 * Everything a live room's Durable Object does apart from I/O (docs/maze/LIVE.md, "The live
 * round"): who may connect, turns in, one snapshot out to everyone per tick, and the reports
 * for the lobby. Pure apart from the callbacks; the caller passes the clock.
 */
export class LiveHub {
  private readonly round: LiveRound;
  private readonly seatOf = new Map<string, string>();
  private readonly lobbyOf = new Map<string, string>();
  private readonly conns = new Set<HubConn>();
  private readonly setup: LiveSetup;
  private lastT = 0;
  private lastReport: number;
  private finalSent = false;
  private done = false;

  /** The lobby round this hub plays (a session can hold several). */
  get roundNo(): number {
    return this.setup.round;
  }

  constructor(setup: LiveSetup) {
    this.setup = setup;
    this.round = new LiveRound(roundOptionsFrom(setup));
    for (const s of setup.seats) {
      const seat = this.round.join(s.name, s.id, { bot: !!s.bot });
      if (seat) {
        this.seatOf.set(s.id, seat);
        this.lobbyOf.set(seat, s.id);
      }
    }
    this.lastReport = setup.startAt;
  }

  /** A socket for lobby player `who` (or 'tv'); null (and closed) if they aren't seated. */
  connect(
    who: string,
    send: HubConn['send'],
    close: HubConn['close'],
    now: number,
  ): HubConn | null {
    const seat = who === 'tv' ? null : (this.seatOf.get(who) ?? undefined);
    if (seat === undefined) {
      close(4003, 'Not in this round');
      return null;
    }
    if (seat) {
      for (const c of this.conns)
        if (c.seat === seat) {
          c.open = false;
          this.conns.delete(c);
          c.close(4001, 'Playing on another device');
        }
      this.round.join(this.setup.seats.find((s) => s.id === who)!.name, who);
    }
    const conn: HubConn = { seat, send, close, turns: 0, second: 0, open: true };
    this.conns.add(conn);
    this.put(conn, {
      t: 'hello',
      id: seat,
      serverNow: now,
      startedAt: this.setup.startAt,
      layouts: this.setup.layouts,
      maze: this.round.mazeIndex(),
      taken: this.round.board(),
      seats: Object.fromEntries(this.lobbyOf),
    });
    return conn;
  }

  message(conn: HubConn, data: string, now = 0): void {
    if (!conn.open || !conn.seat || data.length > 200) return;
    let msg: { t?: unknown; n?: unknown; d?: unknown; at?: unknown };
    try {
      msg = JSON.parse(data) as typeof msg;
    } catch {
      return;
    }
    if (msg.t !== 'turn' || !DIRS.includes(msg.d as string)) return;
    const sec = Math.floor(now / 1000);
    if (sec !== conn.second) {
      conn.second = sec;
      conn.turns = 0;
    }
    if (++conn.turns > TURNS_PER_SECOND) return;
    const at =
      Array.isArray(msg.at) &&
      msg.at.length === 2 &&
      msg.at.every((v) => typeof v === 'number' && Number.isFinite(v))
        ? (msg.at as [number, number])
        : undefined;
    this.round.input(conn.seat, msg.d as Dir, typeof msg.n === 'number' ? msg.n : 0, at);
  }

  drop(conn: HubConn): void {
    conn.open = false;
    this.conns.delete(conn);
  }

  /**
   * Advances to `now` and sends everyone one snapshot. Returns a report for the lobby when one is
   * due (every REPORT_EVERY_MS, and the final one once the round is over), else null.
   */
  tick(now: number): LiveCheckpoint | null {
    if (this.done) return null;
    this.round.advance(now);
    const s = this.round.snapshot(this.lastT);
    this.lastT = s.t;
    const frame = JSON.stringify({ t: 'snap', s, serverNow: now });
    for (const c of this.conns) if (c.open) c.send(frame);
    const over = this.round.isOver();
    if ((over && !this.finalSent) || (!over && now - this.lastReport >= REPORT_EVERY_MS)) {
      this.lastReport = now;
      if (over) this.finalSent = true;
      return this.round.checkpoint(this.setup.round, (seat) => this.lobbyOf.get(seat));
    }
    return null;
  }

  /** The lobby's answer to a report: 409 means the session is over there, so stop. */
  reported(status: number): void {
    if (status === 409) this.done = true;
    else if (this.finalSent && status >= 200 && status < 300) this.done = true;
    else if (this.finalSent) this.finalSent = false;
  }

  isOver(): boolean {
    return this.round.isOver();
  }

  /** Nothing more to do: the final report was taken, or the lobby moved on. */
  stopped(): boolean {
    return this.done;
  }

  connections(): number {
    return this.conns.size;
  }

  private put(conn: HubConn, msg: unknown): void {
    try {
      conn.send(JSON.stringify(msg));
    } catch {
      this.drop(conn);
    }
  }
}
