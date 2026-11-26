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

/**
 * The phone's side of a live round (docs/maze/LIVE.md, "The phones and TV"). Your own chomper
 * is predicted with the same ChomperSim the server runs, so a turn shows at once; each snapshot
 * restarts it from the server's state and replays the turns the server hasn't applied yet, and
 * the difference is blended away. Everyone else is drawn INTERP_MS behind, between snapshots.
 */
export class LiveClient {
  private readonly me: string;
  private readonly m: MazeLayout;
  private readonly startedAt: number;
  private readonly offsetMs: number;
  private readonly sim: ChomperSim;
  private readonly bits: Uint8Array;
  private readonly taken = new Set<number>();
  private simT = 0;
  private seq = 0;
  private pending: { seq: number; dir: Dir }[] = [];
  private snaps: LiveSnapshot[] = [];
  private events: ContactEvent[] = [];
  /** Drawn minus predicted at `fixAt` (round ms), fading over BLEND_MS. */
  private fix = { dx: 0, dy: 0, at: 0 };

  constructor(o: { me: string; layout: MazeLayout; startedAt: number; offsetMs: number }) {
    this.me = o.me;
    this.m = o.layout;
    this.startedAt = o.startedAt;
    this.offsetMs = o.offsetMs;
    this.bits = new Uint8Array(pelletIndex(o.layout).size);
    const seat = Number(o.me.replace(/\D/g, '')) - 1;
    this.sim = new ChomperSim({
      m: o.layout,
      start: o.layout.starts[Math.max(0, seat)] ?? o.layout.starts[0]!,
      level: 1,
      powers: ['hunt'],
      ghosts: { ghosts: () => [] },
      fruit: false,
    });
  }

  /** A local turn, applied to your chomper at once. Returns its sequence number to send. */
  turn(d: Dir): number {
    this.seq++;
    this.pending.push({ seq: this.seq, dir: d });
    this.sim.input(d);
    return this.seq;
  }

  onSnapshot(s: LiveSnapshot): void {
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
    this.pending = this.pending.filter((p) => p.seq > ack);
    const [px, py] = this.drawnAt(this.simT);
    const until = this.simT;
    this.sim.resume({
      walker: own.walker,
      power: own.power,
      dyingUntil: own.dyingUntil,
      shieldUntil: own.shieldUntil,
    });
    const last = this.pending[this.pending.length - 1];
    if (last) this.sim.input(last.dir);
    this.simT = s.t;
    this.stepTo(until);
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

  private stepTo(t: number): void {
    while (this.simT + STEP_MS <= t) {
      this.simT += STEP_MS;
      this.sim.step(STEP_MS, this.simT);
    }
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
        // Through a tunnel (or a respawn) the gap is large: draw the newer spot.
        if (!ca || Math.abs(cb.x - ca.x) > this.m.w / 2 || Math.abs(cb.y - ca.y) > 2) return cb;
        return { ...cb, x: ca.x + (cb.x - ca.x) * k, y: ca.y + (cb.y - ca.y) * k };
      });
  }
}
