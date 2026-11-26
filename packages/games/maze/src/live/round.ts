import { ChomperSim, DYING_MS } from '../sim/chomper';
import type { MazeLayout } from '../sim/layouts';
import { opposite } from '../sim/layouts';
import { pelletIndex } from '../sim/pellets';
import { POINTS } from '../sim/powers';
import type { PowerKind } from '../sim/powers';
import type { Dir } from '../sim/walker';
import { BUMP_SHIELD_MS, resolveContacts } from './contact';
import type { ContactEvent, Contender } from './contact';

/** The sim's own step: 60 per second, as on the phones. */
export const STEP_MS = 50 / 3;
export const MAX_PLAYERS = 4;

export interface LiveChomper {
  id: string;
  name: string;
  seat: number;
  x: number;
  y: number;
  dir: Dir | null;
  score: number;
  power: { kind: PowerKind; untilMs: number } | null;
  dyingUntil: number;
  /** Spawn or bump shield, whichever lasts longer. */
  shieldUntil: number;
}

export interface LiveSnapshot {
  /** Round ms. */
  t: number;
  layoutId: string;
  chompers: LiveChomper[];
  /** Pellet and power-spot indexes taken after `sinceT` (all of them when it is 0). */
  taken: number[];
  /** Since the previous snapshot. */
  events: ContactEvent[];
}

interface Seat {
  id: string;
  name: string;
  seat: number;
  sim: ChomperSim;
  score: number;
  bumpUntil: number;
  /** Eaten: respawn once round time reaches this. */
  respawnAt: number;
}

const NO_GHOSTS = { ghosts: () => [] };

/**
 * One live Contact round, run by the server (docs/maze/LIVE.md, "The live round"). Pure: the
 * caller passes the clock. Milestone 1 (the feel check): chompers, pellets, Hunt and contact; no
 * ghosts, fruit, timer or several mazes yet.
 */
export class LiveRound {
  private readonly m: MazeLayout;
  private readonly startedAt: number;
  private readonly seats: Seat[] = [];
  private readonly takenAt: Float64Array;
  private readonly takenBits: Uint8Array;
  private t = 0;
  private events: ContactEvent[] = [];

  constructor(o: { layout: MazeLayout; startedAt: number }) {
    this.m = o.layout;
    this.startedAt = o.startedAt;
    const n = pelletIndex(o.layout).size;
    this.takenAt = new Float64Array(n);
    this.takenBits = new Uint8Array(n);
  }

  /** Seats a new name (up to MAX_PLAYERS) or returns that name's seat; null when full. */
  join(name: string): string | null {
    const key = name.trim().toLowerCase();
    const had = this.seats.find((s) => s.name.toLowerCase() === key);
    if (had) return had.id;
    const seat = this.seats.length;
    if (seat >= Math.min(MAX_PLAYERS, this.m.starts.length)) return null;
    const sim = new ChomperSim({
      m: this.m,
      start: this.m.starts[seat]!,
      level: 1,
      powers: ['hunt'],
      ghosts: NO_GHOSTS,
      taken: this.takenBits,
      fruit: false,
    });
    const id = `p${seat + 1}`;
    this.seats.push({ id, name: name.trim(), seat, sim, score: 0, bumpUntil: 0, respawnAt: 0 });
    return id;
  }

  input(id: string, dir: Dir): void {
    this.seats.find((s) => s.id === id)?.sim.input(dir);
  }

  /** Steps the sim in STEP_MS slices up to `now` (absolute ms), resolving contact after each. */
  advance(now: number): void {
    const target = now - this.startedAt;
    while (this.t + STEP_MS <= target) {
      this.t += STEP_MS;
      this.stepOnce(this.t);
    }
  }

  snapshot(sinceT: number): LiveSnapshot {
    const taken: number[] = [];
    for (let i = 0; i < this.takenAt.length; i++)
      if (this.takenBits[i] && this.takenAt[i]! > sinceT) taken.push(i);
    const events = this.events;
    this.events = [];
    return {
      t: this.t,
      layoutId: this.m.id,
      chompers: this.seats.map((s) => this.view(s)),
      taken,
      events,
    };
  }

  private view(s: Seat): LiveChomper {
    const [x, y, dir] = s.sim.position();
    const st = s.sim.state();
    return {
      id: s.id,
      name: s.name,
      seat: s.seat,
      x,
      y,
      dir,
      score: s.score,
      power: st.power ? { ...st.power } : null,
      dyingUntil: st.dyingUntil,
      shieldUntil: Math.max(st.shieldUntil, s.bumpUntil),
    };
  }

  private stepOnce(t: number): void {
    for (const s of this.seats) {
      if (s.respawnAt && t >= s.respawnAt) {
        s.respawnAt = 0;
        s.sim.respawn(t);
      }
      for (const e of s.sim.step(STEP_MS, t)) {
        if (e.kind === 'pellet' || e.kind === 'power') this.claim(s, e.i, t, e.kind);
      }
    }
    const cs: Contender[] = this.seats.map((s) => {
      const [x, y] = s.sim.position();
      const st = s.sim.state();
      return {
        id: s.id,
        x,
        y,
        hunting: st.power?.kind === 'hunt' && st.power.untilMs > t,
        immuneUntil: Math.max(st.dyingUntil, st.shieldUntil, s.bumpUntil, s.respawnAt ? t + 1 : 0),
        score: s.score,
      };
    });
    for (const e of resolveContacts(cs, t)) this.apply(e, t);
  }

  private claim(s: Seat, i: number, t: number, kind: 'pellet' | 'power'): void {
    if (this.takenBits[i]) return;
    this.takenBits[i] = 1;
    this.takenAt[i] = t;
    s.score += kind === 'power' ? POINTS.power : POINTS.pellet;
    for (const o of this.seats) if (o !== s) o.sim.take(this.takenBits);
  }

  private apply(e: ContactEvent, t: number): void {
    const get = (id: string) => this.seats.find((s) => s.id === id)!;
    if (e.kind === 'bump') {
      for (const s of [get(e.a), get(e.b)]) {
        s.score = Math.max(0, s.score - e.cost);
        s.bumpUntil = t + BUMP_SHIELD_MS;
        const dir = s.sim.position()[2];
        if (dir) s.sim.input(opposite(dir));
      }
    } else {
      const by = get(e.by);
      const eaten = get(e.eaten);
      by.score += e.gain;
      eaten.score = Math.max(0, eaten.score - e.cost);
      eaten.sim.resume({ walker: eaten.sim.state().walker, dyingUntil: t + DYING_MS });
      eaten.respawnAt = t + DYING_MS;
    }
    this.events.push(e);
  }
}
