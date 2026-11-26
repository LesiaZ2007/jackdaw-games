import { ChomperSim, DYING_MS } from '../sim/chomper';
import type { MazeLayout } from '../sim/layouts';
import { opposite } from '../sim/layouts';
import { pelletIndex } from '../sim/pellets';
import { POINTS, speeds } from '../sim/powers';
import type { PowerKind } from '../sim/powers';
import { canEnter } from '../sim/walker';
import type { Dir, Walker } from '../sim/walker';
import { BUMP_SHIELD_MS, resolveContacts, settleContacts } from './contact';
import type { ContactEvent, Contender } from './contact';

/** The sim's own step: 60 per second, as on the phones. */
export const STEP_MS = 50 / 3;
export const MAX_PLAYERS = 4;
/**
 * A turn tagged with the junction where the phone's own chomper took it is honoured if the
 * server's chomper is at most this far past that junction (it is moved back and turned there).
 */
export const TURN_GRACE_TILES = 0.5;

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
  /** Where the sim stands, so a phone can carry on from it (prediction). */
  walker: Walker;
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
  /** Per player: the sequence number of the last turn applied. */
  acks: Record<string, number>;
}

interface Seat {
  id: string;
  /** Who holds the seat: a per-device id, so two phones with one name get two chompers. */
  key: string;
  name: string;
  seat: number;
  sim: ChomperSim;
  score: number;
  bumpUntil: number;
  /** Eaten: respawn once round time reaches this. */
  respawnAt: number;
  ack: number;
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

  /**
   * Seats a new device (up to MAX_PLAYERS) or gives a device its seat back (a rejoin, which
   * starts its turn count again); null when full. `key` defaults to the name.
   */
  join(name: string, key = name.trim().toLowerCase()): string | null {
    const had = this.seats.find((s) => s.key === key);
    if (had) {
      had.ack = 0;
      had.name = name.trim() || had.name;
      return had.id;
    }
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
    this.seats.push({
      id,
      key,
      name: name.trim(),
      seat,
      sim,
      score: 0,
      bumpUntil: 0,
      respawnAt: 0,
      ack: 0,
    });
    return id;
  }

  /**
   * A turn from a phone; `seq` (rising per phone) comes back in `acks` once applied. `at` is the
   * junction where the phone's own chomper took the turn: if this chomper went past it by at most
   * TURN_GRACE_TILES, it is moved back and turned there, carrying on by the distance it overshot;
   * otherwise the turn is queued as usual (taken at the next open junction).
   */
  input(id: string, dir: Dir, seq = 0, at?: readonly [number, number]): void {
    const s = this.seats.find((x) => x.id === id);
    if (!s) return;
    s.ack = Math.max(s.ack, seq);
    const over = at ? this.overshoot(s, dir, at) : null;
    if (over === null) {
      s.sim.input(dir);
      return;
    }
    const st = s.sim.state();
    s.sim.resume({
      walker: { tile: [at![0], at![1]], dir, next: null, prog: 0 },
      power: st.power,
      dyingUntil: st.dyingUntil,
      shieldUntil: st.shieldUntil,
    });
    const speed = speeds(1)[st.power?.kind === 'dash' ? 'dash' : 'chomper'];
    if (over > 0) this.collect(s, s.sim.step((over / speed) * 1000, this.t), this.t);
  }

  /** Every pellet and power spot taken so far (for a phone that joins mid-round); drains nothing. */
  board(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.takenBits.length; i++) if (this.takenBits[i]) out.push(i);
    return out;
  }

  /** One chomper as a snapshot would show it, without draining events. */
  peek(id: string): LiveChomper {
    return this.view(this.seats.find((s) => s.id === id)!);
  }

  /**
   * How far past junction `at` this chomper is, along a straight line it is still on, when that
   * is at most TURN_GRACE_TILES and `dir` is open there; null otherwise (queue the turn).
   */
  private overshoot(s: Seat, dir: Dir, at: readonly [number, number]): number | null {
    const st = s.sim.state();
    const heading = st.walker.dir;
    if (!heading || heading === dir || heading === opposite(dir)) return null;
    if (this.t < st.dyingUntil) return null;
    if (!canEnter(this.m, at, dir, false)) return null;
    const [x, y] = s.sim.position();
    const along = heading === 'left' || heading === 'right';
    if (along ? Math.abs(y - at[1]) > 1e-6 : Math.abs(x - at[0]) > 1e-6) return null;
    const d =
      heading === 'right'
        ? x - at[0]
        : heading === 'left'
          ? at[0] - x
          : heading === 'down'
            ? y - at[1]
            : at[1] - y;
    return d >= 0 && d <= TURN_GRACE_TILES ? d : null;
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
      acks: Object.fromEntries(this.seats.map((s) => [s.id, s.ack])),
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
      walker: st.walker,
    };
  }

  private stepOnce(t: number): void {
    for (const s of this.seats) {
      if (s.respawnAt && t >= s.respawnAt) {
        s.respawnAt = 0;
        s.sim.respawn(t);
      }
      this.collect(s, s.sim.step(STEP_MS, t), t);
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
    for (const e of settleContacts(resolveContacts(cs, t))) this.apply(e, t);
  }

  private collect(s: Seat, events: ReturnType<ChomperSim['step']>, t: number): void {
    for (const e of events)
      if (e.kind === 'pellet' || e.kind === 'power') this.claim(s, e.i, t, e.kind);
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
