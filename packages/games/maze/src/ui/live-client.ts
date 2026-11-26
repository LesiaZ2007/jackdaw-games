import { ChomperSim } from '../sim/chomper';
import type { MazeLayout } from '../sim/layouts';
import { pelletIndex } from '../sim/pellets';
import type { Dir } from '../sim/walker';
import { STEP_MS, type ContactEvent, type LiveChomper, type LiveSnapshot } from '../live';

/** Others are drawn this far behind the newest snapshot, so they glide between snapshots. */
export const INTERP_MS = 100;
/** A correction of your own chomper this big (in tiles) jumps instead of blending. */
export const SNAP_TILES = 1.5;
/** A smaller correction of your own chomper is blended in over this long. */
const BLEND_MS = 150;
/** Snapshots kept for drawing others. */
const KEPT = 8;
/** Another chomper can't travel this far between two snapshots: draw it as a jump. */
const TELEPORT_TILES = 1;

/** A turn to send: its sequence number, direction and where your chomper took it. */
export interface LiveTurn {
  n: number;
  d: Dir;
  at: [number, number];
}

interface Pending extends LiveTurn {
  /** Round ms when your chomper took it. */
  t: number;
}

/**
 * The phone's side of a live round (docs/maze/LIVE.md, "The phones and TV").
 *
 * Your own chomper is predicted with the same ChomperSim the server runs, so a swipe shows at
 * once. A swipe waits (as `queued`) for the junction where it can be taken; when your chomper
 * takes it, the turn goes in the outbox with that junction, so the server turns you at the same
 * place (LiveRound.input). Each snapshot restarts your chomper from the server's state and
 * replays the turns the server hasn't applied yet; the difference in position is blended away.
 * Everyone else is drawn INTERP_MS behind, between snapshots.
 */
export class LiveClient {
  private readonly me: string;
  private readonly m: MazeLayout;
  private readonly startedAt: number;
  private offsetMs: number;
  private readonly sim: ChomperSim;
  private readonly bits: Uint8Array;
  private readonly taken = new Set<number>();
  private simT = 0;
  private seq = 0;
  private queued: Dir | null = null;
  private pending: Pending[] = [];
  private outbox: LiveTurn[] = [];
  private snaps: LiveSnapshot[] = [];
  private events: ContactEvent[] = [];
  /** Drawn minus predicted at `fix.at` (round ms), fading over BLEND_MS. */
  private fix = { dx: 0, dy: 0, at: 0 };

  constructor(o: {
    me: string;
    layout: MazeLayout;
    startedAt: number;
    offsetMs: number;
    /** Pellets taken before this phone joined. */
    taken?: readonly number[];
  }) {
    this.me = o.me;
    this.m = o.layout;
    this.startedAt = o.startedAt;
    this.offsetMs = o.offsetMs;
    this.bits = new Uint8Array(pelletIndex(o.layout).size);
    for (const i of o.taken ?? []) {
      this.taken.add(i);
      this.bits[i] = 1;
    }
    const seat = Number(o.me.replace(/\D/g, '')) - 1;
    this.sim = new ChomperSim({
      m: o.layout,
      start: o.layout.starts[Math.max(0, seat)] ?? o.layout.starts[0]!,
      level: 1,
      powers: ['hunt'],
      ghosts: { ghosts: () => [] },
      taken: this.bits,
      fruit: false,
    });
  }

  /** A swipe: your chomper takes it at the next open junction (a reverse at once). */
  turn(d: Dir): void {
    this.queued = d;
    this.sim.input(d);
  }

  /** Turns your chomper has taken since the last call, to send to the server. */
  takeOutbox(): LiveTurn[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  /**
   * A snapshot from the server. `offsetSample` is its serverNow minus the local clock when it
   * arrived; the largest seen is the best estimate of the clock offset.
   */
  onSnapshot(s: LiveSnapshot, offsetSample?: number): void {
    if (offsetSample !== undefined && offsetSample > this.offsetMs) this.offsetMs = offsetSample;
    this.snaps.push(s);
    if (this.snaps.length > KEPT) this.snaps.shift();
    this.events.push(...s.events);
    for (const i of s.taken) {
      this.taken.add(i);
      this.bits[i] = 1;
    }
    this.sim.take(this.bits);
    const own = s.chompers.find((c) => c.id === this.me);
    if (!own) return;
    const ack = s.acks[this.me] ?? 0;
    this.pending = this.pending.filter((p) => p.n > ack);
    const [px, py] = this.drawnAt(this.simT);
    const until = this.simT;
    this.sim.resume({
      walker: own.walker,
      power: own.power,
      dyingUntil: own.dyingUntil,
      shieldUntil: own.shieldUntil,
    });
    // The server's own queued turn (a late one it is still waiting to take), then ours on top.
    if (own.walker.next) this.sim.input(own.walker.next);
    this.simT = s.t;
    this.replayTo(until);
    const [nx, ny] = this.sim.position();
    const dx = px - nx;
    const dy = py - ny;
    this.fix = Math.hypot(dx, dy) >= SNAP_TILES ? { dx: 0, dy: 0, at: 0 } : { dx, dy, at: until };
  }

  /** What to draw at local time `now`: your chomper predicted, others INTERP_MS behind. */
  frame(now: number): {
    t: number;
    chompers: LiveChomper[];
    taken: Set<number>;
    events: ContactEvent[];
  } {
    const t = now + this.offsetMs - this.startedAt;
    this.stepTo(t);
    const latest = this.snaps[this.snaps.length - 1];
    const ownServer = latest?.chompers.find((c) => c.id === this.me);
    const [x, y] = this.drawnAt(t);
    const st = this.sim.state();
    const own: LiveChomper = {
      ...(ownServer ?? {
        id: this.me,
        name: '',
        seat: 0,
        score: 0,
        power: null,
        dyingUntil: 0,
        shieldUntil: 0,
      }),
      x,
      y,
      dir: this.sim.position()[2],
      walker: st.walker,
    };
    const others = this.othersAt(t - INTERP_MS);
    const taken = new Set(this.taken);
    for (let i = 0; i < this.bits.length; i++) if (!this.sim.has(i)) taken.add(i);
    const events = this.events;
    this.events = [];
    return { t, chompers: [own, ...others], taken, events };
  }

  /** Steps your chomper live: a turn it takes goes in the outbox. */
  private stepTo(t: number): void {
    while (this.simT + STEP_MS <= t) {
      const before = this.sim.position()[2];
      this.simT += STEP_MS;
      this.sim.step(STEP_MS, this.simT);
      const after = this.sim.position()[2];
      if (after && after !== before) this.took(after);
    }
  }

  /**
   * After a resume: steps to `t` again, retaking the pending turns in order (each as its own
   * queued turn, so it is taken at the first junction where it fits) and then the waiting swipe.
   */
  private replayTo(t: number): void {
    const queue = [...this.pending];
    const want = () => queue[0]?.d ?? this.queued;
    const next = want();
    if (next) this.sim.input(next);
    while (this.simT + STEP_MS <= t) {
      const before = this.sim.position()[2];
      this.simT += STEP_MS;
      this.sim.step(STEP_MS, this.simT);
      const after = this.sim.position()[2];
      if (after && after !== before && queue[0]?.d === after) {
        queue.shift();
        const w = want();
        if (w) this.sim.input(w);
      }
    }
  }

  /** Your chomper just took a turn to `d`: record it and send it, with where it happened. */
  private took(d: Dir): void {
    const turns = this.sim.state().turns;
    const last = turns[turns.length - 1];
    if (!last) return;
    if (this.queued === d) this.queued = null;
    const turn: Pending = { n: ++this.seq, d, at: [last[1], last[2]], t: this.simT };
    this.pending.push(turn);
    this.outbox.push({ n: turn.n, d: turn.d, at: turn.at });
  }

  private drawnAt(t: number): [number, number] {
    const [x, y] = this.sim.position();
    const k = this.fix.at ? Math.max(0, 1 - (t - this.fix.at) / BLEND_MS) : 0;
    return [x + this.fix.dx * k, y + this.fix.dy * k];
  }

  private othersAt(t: number): LiveChomper[] {
    const snaps = this.snaps;
    if (!snaps.length) return [];
    let a = snaps[0]!;
    let b = snaps[snaps.length - 1]!;
    if (t <= a.t) b = a;
    else if (t >= b.t) a = b;
    else
      for (let i = 1; i < snaps.length; i++)
        if (snaps[i]!.t >= t) {
          a = snaps[i - 1]!;
          b = snaps[i]!;
          break;
        }
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    return b.chompers
      .filter((c) => c.id !== this.me)
      .map((cb) => {
        const ca = a.chompers.find((c) => c.id === cb.id);
        // Through a tunnel or a respawn the gap is too big to glide across: draw the newer spot.
        if (!ca || Math.hypot(cb.x - ca.x, cb.y - ca.y) > TELEPORT_TILES) return cb;
        return { ...cb, x: ca.x + (cb.x - ca.x) * k, y: ca.y + (cb.y - ca.y) * k };
      });
  }
}
