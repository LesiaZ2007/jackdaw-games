import { createRng, type Rng } from '@jackdaw/engine';
import { ChomperSim, DYING_MS, FRUIT_MS } from '../sim/chomper';
import { GhostSim, aimTile, ghostSeed } from '../sim/ghosts';
import type { GhostInput, GhostView } from '../sim/ghosts';
import type { MazeLayout } from '../sim/layouts';
import { opposite } from '../sim/layouts';
import { pelletIndex } from '../sim/pellets';
import { ATTACK_POWERS, FRUIT, POINTS, POWER_MS, speeds } from '../sim/powers';
import type { PowerKind } from '../sim/powers';
import { canEnter } from '../sim/walker';
import type { Dir, Vec, Walker } from '../sim/walker';
import { liveSteer } from './bot';
import { BUMP_SHIELD_MS, TOUCH_TILES, resolveContacts, settleContacts } from './contact';
import type { ContactEvent, Contender } from './contact';

/** The sim's own step: 60 per second, as on the phones. */
export const STEP_MS = 50 / 3;
/** Seats per round (every maze has eight starts). */
export const MAX_PLAYERS = 8;
/**
 * A turn tagged with the junction where the phone's own chomper took it is honoured if the
 * server's chomper is at most this far past that junction (it is moved back and turned there).
 */
export const TURN_GRACE_TILES = 0.5;
/** Ghosts re-aim at everyone's tile this often. */
const AIM_MS = 250;
/** A cleared maze flashes this long before the next one starts. */
export const MAZE_PAUSE_MS = 3_000;
/** In Mixed, a power spot comes back this long after it's taken, as a random enabled kind. */
const SPOT_BACK_MS = 12_000;
/** Bonus fruit pops up after this many pellets (everyone's) on a maze. */
const FRUIT_EVERY = 70;
/** Steal takes this share of the target's score, at most STEAL_MAX. */
const STEAL_SHARE = 0.15;
const STEAL_MAX = 200;

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
  /** Slowed by someone's Freeze until then. */
  frozenUntil?: number;
  /** Fogged by someone until then (only this player's own screen is fogged). */
  fogUntil?: number;
  /** A computer player. */
  bot?: boolean;
  /** Where the sim stands, so a phone can carry on from it (prediction). */
  walker: Walker;
}

/** Something everyone should hear about: a ghost caught someone, an attack landed, a maze ended. */
export type LiveNotice =
  | { kind: 'caught'; id: string; cost: number }
  | { kind: 'ghost'; id: string; points: number }
  | { kind: 'fruit'; id: string; points: number }
  | {
      kind: 'attack';
      by: string;
      attack: 'freeze' | 'steal' | 'fog';
      targets: string[];
      amount?: number;
    }
  | { kind: 'cleared'; maze: number };

export interface LiveSnapshot {
  /** Round ms. */
  t: number;
  layoutId: string;
  /** 0-based maze in the round. */
  maze?: number;
  chompers: LiveChomper[];
  /** Pellet and power-spot indexes taken after `sinceT` (all of them when it is 0). */
  taken: number[];
  /** Since the previous snapshot. */
  events: ContactEvent[];
  /** Per player: the sequence number of the last turn applied. */
  acks: Record<string, number>;
  ghosts?: GhostView[];
  /** Every power spot (pellet index), what it holds and whether it's on the board. */
  spots?: { i: number; kind: PowerKind; up: boolean }[];
  fruit?: { fruit: number; untilMs: number } | null;
  notices?: LiveNotice[];
  /** Between mazes: the next maze starts at this round ms. */
  pauseUntil?: number;
  over?: boolean;
}

export interface LiveRoundOptions {
  /** One maze (tests), or `layouts` for several. */
  layout?: MazeLayout;
  layouts?: MazeLayout[];
  /** Absolute ms when play starts (round ms 0). */
  startedAt: number;
  /** Seeds the ghosts and the power spots' comebacks. */
  seed?: number;
  /** Enabled power-ups (spot k holds powers[k % n], rotating by maze). Default Hunt only. */
  powers?: PowerKind[];
  /** Mixed power-ups: spots come back about 12 s after they're taken. */
  mixed?: boolean;
  /** Ghosts in the maze. Off by default (the feel check had none). */
  ghosts?: boolean;
  /** Bonus fruit. Off by default. */
  fruit?: boolean;
  /** Round ms of the bell; the round is over then. */
  endMs?: number | null;
}

/** What the lobby gets: the same shape as the maze rules' `liveResult` server action. */
export interface LiveCheckpoint {
  type: 'liveResult';
  round: number;
  seq: number;
  final: boolean;
  players: Record<
    string,
    {
      score: number;
      pellets: number;
      ghosts: number;
      caught: number;
      fruit: number;
      powers: number;
      bumps: number;
      eats: number;
    }
  >;
  log: { actor?: string; text: string; tag?: string; tone?: 'good' | 'bad' }[];
}

interface Seat {
  id: string;
  /** Who holds the seat: a per-device id, so two phones with one name get two chompers. */
  key: string;
  name: string;
  seat: number;
  bot: boolean;
  sim: ChomperSim;
  score: number;
  bumpUntil: number;
  /** A knock-back to (re)apply before the next step, so a turn arriving meanwhile can't undo it. */
  knock: Dir | null;
  /** Caught or eaten: respawn once round time reaches this. */
  respawnAt: number;
  ack: number;
  stats: {
    pellets: number;
    ghosts: number;
    caught: number;
    fruit: number;
    powers: number;
    bumps: number;
    eats: number;
  };
}

/**
 * One live Contact round, run by the server (docs/maze/LIVE.md, "The live round"). Pure: the
 * caller passes the clock. Chompers, pellets owned by whoever reaches them first, contact (bumps
 * and eats), ghosts aimed at the real chompers, power-ups and attacks, fruit, several mazes, the
 * bell and bots.
 */
export class LiveRound {
  private readonly layouts: MazeLayout[];
  private readonly startedAt: number;
  private readonly seed: number;
  private readonly powers: PowerKind[];
  private readonly mixed: boolean;
  private readonly ghostsOn: boolean;
  private readonly fruitOn: boolean;
  private readonly endMs: number | null;
  private readonly rng: Rng;
  private readonly seats: Seat[] = [];
  private maze = 0;
  private m: MazeLayout;
  private takenAt: Float64Array;
  private takenBits: Uint8Array;
  private ghostSim: GhostSim | null = null;
  private ghostInput: GhostInput = { aims: [], events: [] };
  private lastAim = -Infinity;
  private spotBack = new Map<number, { at: number; kind: PowerKind }>();
  private spotKinds = new Map<number, PowerKind>();
  private fruit: { fruit: number; untilMs: number } | null = null;
  private fruitN = 0;
  private eatenOnMaze = 0;
  private pauseUntil = 0;
  private touching = new Set<string>();
  private t = 0;
  private over = false;
  private events: ContactEvent[] = [];
  private notices: LiveNotice[] = [];
  private log: LiveCheckpoint['log'] = [];
  private seq = 0;

  constructor(o: LiveRoundOptions) {
    this.layouts = o.layouts ?? (o.layout ? [o.layout] : []);
    if (!this.layouts.length) throw new Error('A live round needs a maze.');
    this.startedAt = o.startedAt;
    this.seed = o.seed ?? 1;
    this.powers = o.powers?.length ? o.powers : ['hunt'];
    this.mixed = o.mixed ?? false;
    this.ghostsOn = o.ghosts ?? false;
    this.fruitOn = o.fruit ?? false;
    this.endMs = o.endMs ?? null;
    this.rng = createRng(this.seed ^ 0x5eed);
    this.m = this.layouts[0]!;
    const n = pelletIndex(this.m).size;
    this.takenAt = new Float64Array(n);
    this.takenBits = new Uint8Array(n);
    this.startMaze(0, 0);
  }

  /**
   * Seats a new device (up to MAX_PLAYERS) or gives a device its seat back (a rejoin, which
   * starts its turn count again); null when full. `key` defaults to the name.
   */
  join(name: string, key = name.trim().toLowerCase(), o: { bot?: boolean } = {}): string | null {
    const had = this.seats.find((s) => s.key === key);
    if (had) {
      had.ack = 0;
      had.name = name.trim() || had.name;
      return had.id;
    }
    const seat = this.seats.length;
    if (seat >= Math.min(MAX_PLAYERS, this.m.starts.length)) return null;
    const id = `p${seat + 1}`;
    const s: Seat = {
      id,
      key,
      name: name.trim(),
      seat,
      bot: !!o.bot,
      sim: null as unknown as ChomperSim,
      score: 0,
      bumpUntil: 0,
      knock: null,
      respawnAt: 0,
      ack: 0,
      stats: { pellets: 0, ghosts: 0, caught: 0, fruit: 0, powers: 0, bumps: 0, eats: 0 },
    };
    s.sim = this.simFor(s, this.t);
    this.seats.push(s);
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
    if (!s || s.bot) return;
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
    const speed = speeds(this.maze + 1)[st.power?.kind === 'dash' ? 'dash' : 'chomper'];
    if (over > 0) this.collect(s, s.sim.step((over / speed) * 1000, this.t), this.t);
  }

  /** Every pellet and power spot taken so far on this maze (for a phone joining mid-round). */
  board(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.takenBits.length; i++) if (this.takenBits[i]) out.push(i);
    return out;
  }

  /** One chomper as a snapshot would show it, without draining events. */
  peek(id: string): LiveChomper {
    return this.view(this.seats.find((s) => s.id === id)!);
  }

  /** The round is over: the bell rang or the last maze was cleared. */
  isOver(): boolean {
    return this.over;
  }

  /** Round ms now. */
  now(): number {
    return this.t;
  }

  /** Steps the sim in STEP_MS slices up to `now` (absolute ms), resolving contact after each. */
  advance(now: number): void {
    const target = now - this.startedAt;
    while (!this.over && this.t + STEP_MS <= target) {
      this.t += STEP_MS;
      if (this.endMs !== null && this.t >= this.endMs) {
        this.finish();
        break;
      }
      if (this.pauseUntil) {
        if (this.t < this.pauseUntil) continue;
        this.startMaze(this.maze + 1, this.t);
      }
      this.stepOnce(this.t);
    }
  }

  snapshot(sinceT: number): LiveSnapshot {
    const taken: number[] = [];
    for (let i = 0; i < this.takenAt.length; i++)
      if (this.takenBits[i] && this.takenAt[i]! > sinceT) taken.push(i);
    const events = this.events;
    const notices = this.notices;
    this.events = [];
    this.notices = [];
    return {
      t: this.t,
      layoutId: this.m.id,
      maze: this.maze,
      chompers: this.seats.map((s) => this.view(s)),
      taken,
      events,
      acks: Object.fromEntries(this.seats.map((s) => [s.id, s.ack])),
      ghosts: this.ghostSim ? this.ghostSim.ghosts() : [],
      spots: [...this.spotKinds].map(([i, kind]) => ({ i, kind, up: !this.takenBits[i] })),
      fruit: this.fruit,
      notices,
      pauseUntil: this.pauseUntil,
      over: this.over,
    };
  }

  /**
   * The report for the lobby (the maze rules' `liveResult`), keyed by `idOf` (seat id → lobby
   * player id). Each call has a new sequence number and carries the recap lines since the last.
   */
  checkpoint(round: number, idOf: (seatId: string) => string | undefined): LiveCheckpoint {
    const players: LiveCheckpoint['players'] = {};
    for (const s of this.seats) {
      const pid = idOf(s.id);
      if (pid) players[pid] = { score: s.score, ...s.stats };
    }
    const swap = (text: string) =>
      text.replace(/\{(p\d+)\}/g, (all, seat: string) => {
        const pid = idOf(seat);
        return pid ? `{${pid}}` : all;
      });
    const log = this.log.map((e) => ({
      ...e,
      text: swap(e.text),
      ...(e.actor ? { actor: idOf(e.actor) } : {}),
    }));
    this.log = [];
    return { type: 'liveResult', round, seq: ++this.seq, final: this.over, players, log };
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
      frozenUntil: st.frozenUntil,
      fogUntil: st.fogUntil,
      ...(s.bot ? { bot: true } : {}),
      walker: st.walker,
    };
  }

  private simFor(s: Seat, t: number): ChomperSim {
    const sim = new ChomperSim({
      m: this.m,
      start: this.m.starts[s.seat % this.m.starts.length]!,
      level: this.maze + 1,
      powers: this.powers,
      ghosts: this.ghostSim ?? { ghosts: () => [] },
      taken: this.takenBits,
      fruit: false,
      id: s.id,
      ...(s.bot ? { steer: (tile, dir) => this.steerBot(s, tile, dir) } : {}),
    });
    sim.offerFruit(this.fruit);
    if (t > 0) sim.respawn(t);
    return sim;
  }

  private startMaze(maze: number, t: number): void {
    this.maze = maze;
    this.m = this.layouts[maze]!;
    const n = pelletIndex(this.m).size;
    this.takenAt = new Float64Array(n);
    this.takenBits = new Uint8Array(n);
    this.ghostSim = this.ghostsOn
      ? new GhostSim(this.m, ghostSeed(this.seed, maze), maze + 1)
      : null;
    this.ghostInput = { aims: [], events: [] };
    this.lastAim = -Infinity;
    this.spotBack.clear();
    this.spotKinds.clear();
    this.fruit = null;
    this.eatenOnMaze = 0;
    this.pauseUntil = 0;
    this.touching.clear();
    // Ghost time starts at the maze start: GhostSim counts from 0.
    this.mazeAt = t;
    const kinds = this.powers;
    let spot = 0;
    for (const [k, i] of pelletIndex(this.m)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (this.m.rows[y]![x] !== 'o') continue;
      this.spotKinds.set(i, kinds[(spot + maze * this.m.powers.length) % kinds.length]!);
      spot++;
    }
    for (const s of this.seats) {
      s.sim = this.simFor(s, t);
      s.respawnAt = 0;
      s.bumpUntil = 0;
      s.knock = null;
    }
  }

  private mazeAt = 0;

  private finish(): void {
    if (this.over) return;
    this.over = true;
    const best = Math.max(0, ...this.seats.map((s) => s.score));
    const top = this.seats.filter((s) => s.score === best);
    if (top.length === 1)
      this.log.push({
        actor: top[0]!.id,
        text: `{${top[0]!.id}} led at the bell with ${best}.`,
        tone: 'good',
      });
  }

  private stepOnce(t: number): void {
    const g = t - this.mazeAt;
    if (this.ghostSim) {
      if (t - this.lastAim >= AIM_MS) {
        const tiles: Record<string, ReturnType<typeof aimTile>> = {};
        for (const s of this.seats)
          if (t >= s.sim.state().dyingUntil && !s.respawnAt)
            tiles[s.id] = aimTile(this.m, s.sim.position());
        this.ghostInput.aims.push({ atMs: g, tiles });
        if (this.ghostInput.aims.length > 4) this.ghostInput.aims.shift();
        this.lastAim = t;
      }
      this.ghostInput.events = this.ghostInput.events.filter((e) => e.atMs >= g - 100);
      this.ghostSim.stepTo(g, this.ghostInput);
    }
    for (const [i, back] of this.spotBack)
      if (t >= back.at) {
        this.spotBack.delete(i);
        this.spotKinds.set(i, back.kind);
        this.takenBits[i] = 0;
        for (const s of this.seats) s.sim.restoreSpot(i, back.kind);
      }
    if (this.fruit && t >= this.fruit.untilMs) this.offerFruit(null);
    for (const s of this.seats) {
      if (s.respawnAt && t >= s.respawnAt) {
        s.respawnAt = 0;
        s.sim.respawn(t);
      }
      if (s.knock) {
        s.sim.input(s.knock);
        s.knock = null;
      }
      this.collect(s, s.sim.step(STEP_MS, t), t);
    }
    this.contacts(t);
    if (!this.pauseUntil && this.allPelletsGone()) {
      this.notices.push({ kind: 'cleared', maze: this.maze });
      this.log.push({ text: `Maze ${this.maze + 1} cleared.` });
      if (this.maze + 1 >= this.layouts.length) this.finish();
      else this.pauseUntil = t + MAZE_PAUSE_MS;
    }
  }

  /** Every plain pellet is gone (power spots that come back don't keep a maze open). */
  private allPelletsGone(): boolean {
    for (let i = 0; i < this.takenBits.length; i++)
      if (!this.takenBits[i] && !this.spotKinds.has(i)) return false;
    return true;
  }

  private contacts(t: number): void {
    const now = new Set<string>();
    const pos = this.seats.map((s) => s.sim.position());
    for (let a = 0; a < this.seats.length; a++)
      for (let b = a + 1; b < this.seats.length; b++)
        if (Math.hypot(pos[a]![0] - pos[b]![0], pos[a]![1] - pos[b]![1]) < TOUCH_TILES)
          now.add(`${this.seats[a]!.id}|${this.seats[b]!.id}`);
    const cs: Contender[] = this.seats.map((s, k) => {
      const st = s.sim.state();
      return {
        id: s.id,
        x: pos[k]![0],
        y: pos[k]![1],
        hunting: st.power?.kind === 'hunt' && st.power.untilMs > t,
        immuneUntil: Math.max(st.dyingUntil, st.shieldUntil, s.bumpUntil, s.respawnAt ? t + 1 : 0),
        score: s.score,
      };
    });
    // A bump only when two chompers come together, not every step they stay together.
    const fresh = resolveContacts(cs, t).filter(
      (e) => e.kind !== 'bump' || !this.touching.has(`${e.a}|${e.b}`),
    );
    for (const e of settleContacts(fresh)) this.apply(e, t);
    this.touching = now;
  }

  private collect(s: Seat, events: ReturnType<ChomperSim['step']>, t: number): void {
    for (const e of events) {
      if (e.kind === 'pellet' || e.kind === 'power')
        this.claim(s, e.i, t, e.kind === 'power' ? e.power : null);
      else if (e.kind === 'ghost') {
        const points = POINTS.ghost[e.combo] ?? POINTS.ghost[3];
        s.score += points;
        s.stats.ghosts++;
        this.ghostInput.events.push({ atMs: t - this.mazeAt, kind: 'eaten', ghost: e.ghost });
        this.notices.push({ kind: 'ghost', id: s.id, points });
      } else if (e.kind === 'caught') {
        const cost = Math.min(-POINTS.caught, s.score);
        s.score -= cost;
        s.stats.caught++;
        s.respawnAt = t + DYING_MS;
        this.notices.push({ kind: 'caught', id: s.id, cost });
      } else if (e.kind === 'fruit' && this.fruit) {
        const points = FRUIT[this.fruit.fruit]!.pts;
        s.score += points;
        s.stats.fruit++;
        this.notices.push({ kind: 'fruit', id: s.id, points });
        this.offerFruit(null);
      }
    }
  }

  private claim(s: Seat, i: number, t: number, power: PowerKind | null): void {
    if (this.takenBits[i]) return;
    this.takenBits[i] = 1;
    this.takenAt[i] = t;
    for (const o of this.seats) if (o !== s) o.sim.take(this.takenBits);
    if (!power) {
      s.score += POINTS.pellet;
      s.stats.pellets++;
      this.eatenOnMaze++;
      if (this.fruitOn && !this.fruit && this.eatenOnMaze % FRUIT_EVERY === 0)
        this.offerFruit({ fruit: this.fruitN++ % FRUIT.length, untilMs: t + FRUIT_MS });
      return;
    }
    s.score += POINTS.power;
    s.stats.powers++;
    if (this.mixed) {
      const kinds = this.powers;
      this.spotBack.set(i, { at: t + SPOT_BACK_MS, kind: kinds[this.rng.int(kinds.length)]! });
    }
    if (ATTACK_POWERS.includes(power)) this.attack(s, power, t);
  }

  private attack(by: Seat, power: PowerKind, t: number): void {
    const others = this.seats.filter((o) => o !== by);
    if (!others.length) return;
    if (power === 'freeze') {
      for (const o of others) o.sim.freeze(t + POWER_MS.freeze);
      this.notices.push({
        kind: 'attack',
        by: by.id,
        attack: 'freeze',
        targets: others.map((o) => o.id),
      });
    } else if (power === 'fog') {
      for (const o of others) o.sim.fog(t + POWER_MS.fog);
      this.notices.push({
        kind: 'attack',
        by: by.id,
        attack: 'fog',
        targets: others.map((o) => o.id),
      });
    } else if (power === 'steal') {
      const target = others.reduce((a, b) => (b.score > a.score ? b : a));
      const amount = Math.min(STEAL_MAX, Math.floor(target.score * STEAL_SHARE));
      target.score -= amount;
      by.score += amount;
      this.notices.push({
        kind: 'attack',
        by: by.id,
        attack: 'steal',
        targets: [target.id],
        amount,
      });
      if (amount > 0)
        this.log.push({
          actor: by.id,
          text: `{${by.id}} stole ${amount} from {${target.id}}.`,
          tag: `+${amount}`,
        });
    }
  }

  private offerFruit(f: { fruit: number; untilMs: number } | null): void {
    this.fruit = f;
    for (const s of this.seats) s.sim.offerFruit(f);
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

  private steerBot(s: Seat, tile: [number, number], dir: Dir | null): Dir | null {
    const t = this.t;
    const hunting = (c: Seat) => {
      const p = c.sim.state().power;
      return p?.kind === 'hunt' && p.untilMs > t;
    };
    const live = (c: Seat) => c !== s && !c.respawnAt && t >= c.sim.state().dyingUntil;
    const me = hunting(s);
    const pellets: Vec[] = [];
    for (const [k, i] of pelletIndex(this.m))
      if (!this.takenBits[i]) pellets.push(k.split(',').map(Number) as unknown as Vec);
    const at = (c: Seat) => c.sim.position().slice(0, 2) as unknown as Vec;
    return liveSteer({
      m: this.m,
      tile,
      dir,
      pellets,
      ghosts: this.ghostSim ? this.ghostSim.ghosts() : [],
      prey: me ? this.seats.filter((c) => live(c) && !hunting(c)).map(at) : [],
      hunters: me ? [] : this.seats.filter((c) => live(c) && hunting(c)).map(at),
    });
  }

  private apply(e: ContactEvent, t: number): void {
    const get = (id: string) => this.seats.find((s) => s.id === id)!;
    if (e.kind === 'bump') {
      for (const s of [get(e.a), get(e.b)]) {
        s.score = Math.max(0, s.score - e.cost);
        s.stats.bumps++;
        s.bumpUntil = t + BUMP_SHIELD_MS;
        const dir = s.sim.position()[2];
        if (dir) {
          s.knock = opposite(dir);
          s.sim.input(s.knock);
        }
      }
    } else {
      const by = get(e.by);
      const eaten = get(e.eaten);
      by.score += e.gain;
      by.stats.eats++;
      eaten.score = Math.max(0, eaten.score - e.cost);
      eaten.sim.resume({ walker: eaten.sim.state().walker, dyingUntil: t + DYING_MS });
      eaten.respawnAt = t + DYING_MS;
      this.log.push({
        actor: by.id,
        text: `{${by.id}} ate {${eaten.id}}.`,
        tag: `+${e.gain}`,
        tone: 'good',
      });
    }
    this.events.push(e);
  }
}
