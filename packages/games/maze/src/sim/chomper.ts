import type { GhostSim } from './ghosts';
import { opposite } from './layouts';
import type { MazeLayout } from './layouts';
import { pelletIndex } from './pellets';
import { ATTACK_POWERS, FRUIT, powerMs, speeds } from './powers';
import type { PowerKind } from './powers';
import { advance, posOf } from './walker';
import type { Dir, Walker } from './walker';

/** A direction change: round time, where it happened (a reverse can be mid-tile), new heading. */
export type Turn = [tMs: number, x: number, y: number, dir: Dir];

export interface ChomperState {
  walker: Walker;
  /** Pellets and power spots this chomper ate itself (not ones others took first). */
  eaten: Uint8Array;
  power: { kind: PowerKind; untilMs: number } | null;
  frozenUntil: number;
  /** Fogged until then: the runner shows only a small circle around this chomper. */
  fogUntil: number;
  /** Caught and playing the dying animation until then; the caller respawns it. */
  dyingUntil: number;
  /** The bonus fruit on the board (an index into FRUIT), when fruit is on. */
  fruit: { fruit: number; untilMs: number } | null;
  turns: Turn[];
}

export type ChomperEvent =
  | { kind: 'pellet'; i: number }
  | { kind: 'power'; i: number; power: PowerKind }
  | { kind: 'fruit'; fruit: number }
  | { kind: 'ghost'; ghost: number; combo: number }
  | { kind: 'caught'; ghost: number }
  | { kind: 'cleared' };

export interface ChomperParams {
  m: MazeLayout;
  start: [number, number, Dir];
  level: number;
  /** Enabled power-ups; power spot k (in reading order) holds one of these, rotating by level. */
  powers: PowerKind[];
  /** Read for contact only; the caller steps it to `tMs` before each `step`. */
  ghosts: Pick<GhostSim, 'ghosts'>;
  /** Pellets already gone (Shared maze): consumed silently, never reported. */
  taken?: Uint8Array;
  /** Local bonus fruit (Solo and Race). Off in the Shared maze, where the server owns fruit. */
  fruit?: boolean;
  /** Called at every tile center to pick the next turn (the server's bots); null keeps going. */
  steer?: (tile: [number, number], dir: Dir | null) => Dir | null;
  /** This player's id, so a jinx ghost only touches the chomper it was sent after. */
  id?: string;
}

/** How long a caught chomper is out before the caller respawns it. */
export const DYING_MS = 1300;
/** Fruit pops up after every this many pellets this chomper eats. */
export const FRUIT_EVERY = 60;
export const FRUIT_MS = 10_000;
/** Magnet reach, in tiles. */
export const MAGNET_RANGE = 2.8;
/** Freeze slows a chomper to this fraction of its speed. */
export const FROZEN_SPEED = 0.3;
/** Touch distance between a chomper and a ghost, in tiles, on each axis. */
const HIT = 0.6;
/** An eaten ghost is ignored until it shows up as eyes, or this long at most. */
const EATEN_GRACE_MS = 2000;

/**
 * One player's chomper, stepped locally on the phone and by the server's bots. Given the same
 * inputs, step sizes and ghost positions it gives the same results on every device.
 *
 * `step` reads the ghosts but never steps them: the caller owns the ghost inputs (aims, events),
 * so it calls `ghosts.stepTo(tMs, input)` first, then `step(dt, tMs)`, and turns `ghost` events
 * into `eaten` ghost events (and Hunt pickups into `fright` in Solo and Race) for later steps.
 */
export class ChomperSim {
  private readonly m: MazeLayout;
  private readonly start: [number, number, Dir];
  private readonly level: number;
  private readonly ghostSim: Pick<GhostSim, 'ghosts'>;
  private readonly id: string | undefined;
  private readonly fruitOn: boolean;
  private readonly steer: ChomperParams['steer'];
  private readonly at = new Map<string, number>();
  private readonly pos: [number, number][] = [];
  private readonly kinds: (PowerKind | null)[] = [];
  private readonly gone: Uint8Array;
  private left: number;
  private cleared = false;
  private w: Walker;
  private eaten: Uint8Array;
  private power: ChomperState['power'] = null;
  private frozenUntil = 0;
  private fogUntil = 0;
  private dyingUntil = 0;
  private fruit: ChomperState['fruit'] = null;
  private fruitN = 0;
  private ateCount = 0;
  private combo = 0;
  private ateGhosts = new Map<number, number>();
  private turns: Turn[] = [];
  private lastDir: Dir | null;

  constructor(p: ChomperParams) {
    this.m = p.m;
    this.start = p.start;
    this.level = p.level;
    this.ghostSim = p.ghosts;
    this.id = p.id;
    this.steer = p.steer;
    this.fruitOn = p.fruit ?? true;
    let spot = 0;
    for (const [k, i] of pelletIndex(p.m)) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      this.at.set(k, i);
      this.pos[i] = [x, y];
      const isPower = p.m.rows[y]![x] === 'o';
      const n = p.powers.length;
      this.kinds[i] =
        isPower && n ? p.powers[(spot + (p.level - 1) * p.m.powers.length) % n]! : null;
      if (isPower) spot++;
    }
    const n = this.pos.length;
    this.eaten = new Uint8Array(n);
    this.gone = new Uint8Array(n);
    this.left = n;
    if (p.taken) this.take(p.taken);
    this.w = { tile: [p.start[0], p.start[1]], dir: p.start[2], next: null, prog: 0 };
    this.lastDir = p.start[2];
  }

  /** Queues a turn; a reverse happens at once, others at the next open junction. */
  input(d: Dir): void {
    this.w.next = d;
  }

  /** Others' pellets (Shared): marks them gone without events. */
  take(taken: Uint8Array): void {
    for (let i = 0; i < this.gone.length; i++) if (taken[i] && !this.gone[i]) this.consume(i);
  }

  /** Whether pellet `i` is still on the board. */
  has(i: number): boolean {
    return this.gone[i] === 0;
  }

  /** The power-up a pellet index holds, or null for a plain pellet. */
  powerAt(i: number): PowerKind | null {
    return this.kinds[i] ?? null;
  }

  /**
   * Carries on from a report (the server's bots rebuild a chomper this way each call): where it
   * stands, what it was doing and how many pellets it has eaten so far.
   */
  resume(o: {
    walker: Walker;
    power?: ChomperState['power'];
    dyingUntil?: number;
    ate?: number;
    fruitN?: number;
  }): void {
    const w = o.walker;
    this.w = { tile: [w.tile[0], w.tile[1]], dir: w.dir, next: null, prog: w.prog };
    this.power = o.power ? { ...o.power } : null;
    this.dyingUntil = o.dyingUntil ?? 0;
    this.ateCount = o.ate ?? 0;
    this.fruitN = o.fruitN ?? 0;
    this.lastDir = w.dir;
  }

  /** The tile and heading while sitting exactly on a tile center (where turns are decided). */
  center(): { tile: [number, number]; dir: Dir | null } | null {
    return this.w.prog === 0 ? { tile: [this.w.tile[0], this.w.tile[1]], dir: this.w.dir } : null;
  }

  /** Where it is now, in tile units, and its heading. */
  position(): [number, number, Dir | null] {
    const [x, y] = posOf(this.w);
    return [x, y, this.w.dir];
  }

  /** Slowed by another player's Freeze until `untilMs`. */
  freeze(untilMs: number): void {
    this.frozenUntil = Math.max(this.frozenUntil, untilMs);
  }

  /** Fogged by another player until `untilMs`. */
  fog(untilMs: number): void {
    this.fogUntil = Math.max(this.fogUntil, untilMs);
  }

  /** Back to the start tile after a catch (or a new life), with no power running. */
  respawn(tMs: number): void {
    const [x, y, d] = this.start;
    this.w = { tile: [x, y], dir: d, next: null, prog: 0 };
    this.power = null;
    this.dyingUntil = 0;
    this.combo = 0;
    this.ateGhosts.clear();
    this.turns.push([tMs, x, y, d]);
    this.lastDir = d;
  }

  /** Moves `dtMs` forward, ending at round time `tMs`. */
  step(dtMs: number, tMs: number): ChomperEvent[] {
    const ev: ChomperEvent[] = [];
    if (this.power && tMs >= this.power.untilMs) this.power = null;
    if (this.fruit && tMs >= this.fruit.untilMs) this.fruit = null;
    if (tMs < this.dyingUntil) return ev;

    const w = this.w;
    if (w.prog === 0) this.arrive(w.tile, tMs, ev);
    if (w.next && w.dir && w.next === opposite(w.dir) && w.prog > 0) {
      const [x, y] = posOf(w);
      this.turn(tMs, x, y, w.next);
    }
    const sp = speeds(this.level);
    const base = this.power?.kind === 'dash' ? sp.dash : sp.chomper;
    const speed = base * (tMs < this.frozenUntil ? FROZEN_SPEED : 1);
    let center: [number, number] = [w.tile[0], w.tile[1]];
    advance(w, (speed * dtMs) / 1000, this.m, {
      ghost: false,
      decide: (v) => {
        center = [v.tile[0], v.tile[1]];
        const d = this.steer?.([v.tile[0], v.tile[1]], v.dir);
        if (d) v.next = d;
      },
      arrive: (v) => {
        if (v.dir !== this.lastDir) this.turn(tMs, center[0], center[1], v.dir!);
        this.arrive(v.tile, tMs, ev);
      },
    });
    if (w.dir !== this.lastDir) this.turn(tMs, center[0], center[1], w.dir!);

    if (this.power?.kind === 'magnet') {
      const [px, py] = posOf(w);
      for (let i = 0; i < this.pos.length; i++) {
        if (this.gone[i] || this.kinds[i]) continue;
        const [x, y] = this.pos[i]!;
        const dx = Math.abs(x - px);
        if (Math.hypot(Math.min(dx, this.m.w - dx), y - py) < MAGNET_RANGE) this.eat(i, tMs, ev);
      }
    }
    this.contact(tMs, ev);
    if (this.left === 0 && !this.cleared) {
      this.cleared = true;
      ev.push({ kind: 'cleared' });
    }
    return ev;
  }

  state(): ChomperState {
    const w = this.w;
    return {
      walker: { tile: [w.tile[0], w.tile[1]], dir: w.dir, next: w.next, prog: w.prog },
      eaten: this.eaten.slice(),
      power: this.power ? { ...this.power } : null,
      frozenUntil: this.frozenUntil,
      fogUntil: this.fogUntil,
      dyingUntil: this.dyingUntil,
      fruit: this.fruit ? { ...this.fruit } : null,
      turns: this.turns.map((t) => [...t] as Turn),
    };
  }

  private turn(tMs: number, x: number, y: number, dir: Dir): void {
    this.turns.push([tMs, x, y, dir]);
    this.lastDir = dir;
  }

  private arrive(tile: [number, number], tMs: number, ev: ChomperEvent[]): void {
    const i = this.at.get(`${tile[0]},${tile[1]}`);
    if (i !== undefined && !this.gone[i]) this.eat(i, tMs, ev);
    const f = this.fruit;
    if (f && tile[0] === this.m.fruit[0] && tile[1] === this.m.fruit[1]) {
      this.fruit = null;
      ev.push({ kind: 'fruit', fruit: f.fruit });
    }
  }

  private consume(i: number): void {
    this.gone[i] = 1;
    this.left--;
  }

  private eat(i: number, tMs: number, ev: ChomperEvent[]): void {
    this.consume(i);
    this.eaten[i] = 1;
    const kind = this.kinds[i];
    if (kind) {
      ev.push({ kind: 'power', i, power: kind });
      if (!ATTACK_POWERS.includes(kind)) {
        this.power = { kind, untilMs: tMs + powerMs(kind, this.level) };
        if (kind === 'hunt') this.combo = 0;
      }
    } else ev.push({ kind: 'pellet', i });
    this.ateCount++;
    if (this.fruitOn && this.ateCount % FRUIT_EVERY === 0 && !this.fruit) {
      this.fruit = { fruit: this.fruitN++ % FRUIT.length, untilMs: tMs + FRUIT_MS };
    }
  }

  private contact(tMs: number, ev: ChomperEvent[]): void {
    const [px, py] = posOf(this.w);
    const hunting = this.power?.kind === 'hunt';
    const ghosts = this.ghostSim.ghosts();
    // Once the Hunt and every fright are over, the next one starts again at 200.
    if (!hunting && !ghosts.some((g) => g.mode === 'fright')) this.combo = 0;
    for (const g of ghosts) {
      const ate = this.ateGhosts.get(g.id);
      if (ate !== undefined) {
        if (g.mode === 'eyes' || g.mode === 'house' || tMs - ate >= EATEN_GRACE_MS)
          this.ateGhosts.delete(g.id);
        else continue;
      }
      if (g.mode === 'eyes' || g.mode === 'house') continue;
      if (g.jinxTarget !== undefined && g.jinxTarget !== this.id) continue;
      const dx = Math.abs(g.pos[0] - px);
      if (Math.min(dx, this.m.w - dx) >= HIT || Math.abs(g.pos[1] - py) >= HIT) continue;
      if (hunting || g.mode === 'fright') {
        ev.push({ kind: 'ghost', ghost: g.id, combo: Math.min(this.combo++, 3) });
        this.ateGhosts.set(g.id, tMs);
      } else if (this.power?.kind !== 'phase') {
        this.dyingUntil = tMs + DYING_MS;
        ev.push({ kind: 'caught', ghost: g.id });
        return;
      }
    }
  }
}
