import { createRng } from '@jackdaw/engine';
import type { Rng, RngState } from '@jackdaw/engine';
import { DIRS, DIR_ORDER, houseTiles, isDoor, opposite, wrapX } from './layouts';
import type { MazeLayout } from './layouts';
import { speeds } from './powers';
import { advance, canEnter, posOf } from './walker';
import type { Dir, Vec, Walker } from './walker';

/**
 * A chomper's tile in an aim, plus its heading as an index into DIR_ORDER when it has one
 * (kept as a number so the Shared table view stays small).
 */
export type AimTile = readonly [number, number] | readonly [number, number, number];

/** At `atMs` each chomper was on these tiles; ghosts steer by the latest aim. */
export interface Aim {
  atMs: number;
  tiles: Record<string, AimTile>;
}

/** A chomper's position (x, y, heading) as an aim tile. */
export function aimTile(m: MazeLayout, pos: readonly [number, number, Dir | null]): AimTile {
  const x = wrapX(m, Math.round(pos[0]));
  const y = Math.round(pos[1]);
  return pos[2] ? [x, y, DIR_ORDER.indexOf(pos[2])] : [x, y];
}

export type GhostEvent =
  | { atMs: number; kind: 'eaten'; ghost: number }
  | { atMs: number; kind: 'jinx'; target: string; untilMs: number }
  | { atMs: number; kind: 'fright'; untilMs: number };

export interface GhostInput {
  aims: Aim[];
  events: GhostEvent[];
  /**
   * The local player in Solo and Race, where the ghosts are that player's alone: the ghosts chase
   * only them and `fright` events apply. Left out in the Shared maze, where ghosts chase whoever
   * is nearest and Hunt is personal, so `fright` events are ignored.
   */
  frightFor?: string;
}

export interface GhostView {
  id: number;
  pos: [number, number];
  dir: Dir;
  mode: 'house' | 'chase' | 'scatter' | 'fright' | 'eyes';
  jinxTarget?: string;
}

interface GhostState extends Walker {
  id: number;
  /** Steps left waiting in the house before moving. */
  wait: number;
  eyes: boolean;
  scared: boolean;
  jinx: { target: string; untilStep: number } | null;
}

/** Everything needed to carry on from a moment; plain data, safe to JSON round-trip. */
export interface GhostCheckpoint {
  step: number;
  level: number;
  rng: RngState;
  frightUntil: number;
  jinxCount: number;
  ghosts: GhostState[];
}

/** The simulation runs in fixed steps of 1/60 s, so results never depend on frame timing. */
const STEPS_PER_SEC = 60;
/** Each cycle: a short scatter to the corners, then a long chase. */
export const SCATTER_MS = 5_000;
export const CYCLE_MS = 25_000;
const SCATTER_STEPS = (SCATTER_MS / 1000) * STEPS_PER_SEC;
const CYCLE_STEPS = (CYCLE_MS / 1000) * STEPS_PER_SEC;
/** How far ahead of its chomper (along the chomper's heading) the ahead ghost aims. */
export const AHEAD_TILES = 4;
/** The shy ghost backs off to its corner inside this many tiles of its chomper. */
const SHY_TILES = 8;
/** Steps each ghost waits in the house at the start, then after being eaten, then a jinx. */
const START_WAIT = [60, 192, 324, 456];
const EATEN_WAIT = 48;
const JINX_WAIT = 18;
const JINX_FIRST_ID = 4;

/** The step at or after `ms` (a step k starts at k × 1000/60 ms); an event applies at this step. */
export const stepAt = (ms: number) => Math.ceil((ms * 3) / 50);
/** How many whole steps fit in `ms` (where `stepTo(ms)` stops). */
export const stepsIn = (ms: number) => Math.floor((ms * 3) / 50);

/** The seed ghosts use on maze `maze` (the first maze uses the table seed itself). */
export const ghostSeed = (seed: number, maze: number): number =>
  (seed + Math.imul(maze, 0x9e3779b1)) >>> 0;

const key = (x: number, y: number) => `${x},${y}`;

const copyGhost = (g: GhostState): GhostState => ({
  ...g,
  tile: [g.tile[0], g.tile[1]],
  jinx: g.jinx ? { ...g.jinx } : null,
});

interface AimNow {
  /** Players in a fixed order, with their tile and which way they're heading ([0, 0] if not). */
  players: { id: string; tile: Vec; dir: Vec }[];
}

const NO_DIR: Vec = [0, 0];

function aimOf(a: Aim | undefined, only: string | undefined): AimNow | null {
  if (!a) return null;
  const ids = Object.keys(a.tiles)
    .filter((id) => only === undefined || id === only)
    .sort();
  return {
    players: ids.map((id) => {
      const [x, y, h] = a.tiles[id]!;
      const d = h === undefined ? undefined : DIR_ORDER[h];
      return { id, tile: [x, y], dir: d ? DIRS[d] : NO_DIR };
    }),
  };
}

/**
 * Ghost movement as a pure function of the layout, seed, level and the inputs (aims and events).
 * Two sims fed the same inputs agree exactly, however `stepTo` calls are spaced, so every device
 * shows the same ghosts. Random choices come only from the seeded Rng, in a fixed order.
 */
export class GhostSim {
  private readonly m: MazeLayout;
  private readonly house: Set<string>;
  private level: number;
  private rng: Rng;
  private step = 0;
  private frightUntil = 0;
  private jinxCount = 0;
  private gs: GhostState[];

  constructor(m: MazeLayout, seed: number, level: number) {
    this.m = m;
    this.house = houseTiles(m);
    this.level = level;
    this.rng = createRng(seed);
    const [hx, hy] = m.house;
    const spots: Vec[] = [
      [hx - 2, hy],
      [hx + 2, hy],
      [hx, hy],
      [hx - 1, hy],
    ];
    this.gs = spots.map(([x, y], i) => ({
      id: i,
      tile: [x, y],
      dir: i % 2 ? 'left' : 'right',
      next: null,
      prog: 0,
      wait: START_WAIT[i]!,
      eyes: false,
      scared: false,
      jinx: null,
    }));
  }

  /**
   * Runs the simulation forward to round time `tMs`. Going backward does nothing. Events dated
   * before the sim's current time are skipped: to take in a late one, `restore` a checkpoint from
   * before it and step again.
   */
  stepTo(tMs: number, input: GhostInput): void {
    const target = stepsIn(tMs);
    if (target <= this.step) return;
    const byStep = new Map<number, GhostEvent[]>();
    const events = input.events
      .map((e, i) => ({ e, i, s: stepAt(e.atMs) }))
      .filter((x) => x.s >= this.step && x.s < target)
      .sort((a, b) => a.e.atMs - b.e.atMs || a.i - b.i);
    for (const { e, s } of events) {
      const list = byStep.get(s);
      if (list) list.push(e);
      else byStep.set(s, [e]);
    }
    // The aim in effect now (the latest by time, then by order), and the ones due before target.
    let cur: Aim | undefined;
    const due: { a: Aim; i: number; s: number }[] = [];
    for (let i = 0; i < input.aims.length; i++) {
      const a = input.aims[i]!;
      const s = stepAt(a.atMs);
      if (s <= this.step) {
        if (!cur || a.atMs >= cur.atMs) cur = a;
      } else if (s < target) due.push({ a, i, s });
    }
    due.sort((x, y) => x.a.atMs - y.a.atMs || x.i - y.i);
    let di = 0;
    let aimNow = aimOf(cur, input.frightFor);
    while (this.step < target) {
      const k = this.step;
      let next: Aim | null = null;
      while (di < due.length && due[di]!.s <= k) next = due[di++]!.a;
      if (next) aimNow = aimOf(next, input.frightFor);
      for (const e of byStep.get(k) ?? []) this.apply(e, input);
      this.tick(k, aimNow);
      this.step = k + 1;
    }
  }

  ghosts(): GhostView[] {
    return this.gs.map((g) => {
      const v: GhostView = {
        id: g.id,
        pos: posOf(g),
        dir: g.dir ?? 'left',
        mode: this.modeOf(g),
      };
      if (g.jinx) v.jinxTarget = g.jinx.target;
      return v;
    });
  }

  checkpoint(): GhostCheckpoint {
    return {
      step: this.step,
      level: this.level,
      rng: this.rng.state,
      frightUntil: this.frightUntil,
      jinxCount: this.jinxCount,
      ghosts: this.gs.map(copyGhost),
    };
  }

  restore(c: GhostCheckpoint): void {
    this.step = c.step;
    this.level = c.level;
    this.rng = createRng(c.rng);
    this.frightUntil = c.frightUntil;
    this.jinxCount = c.jinxCount;
    this.gs = c.ghosts.map(copyGhost);
  }

  private apply(e: GhostEvent, input: GhostInput): void {
    if (e.kind === 'eaten') {
      const g = this.gs.find((x) => x.id === e.ghost);
      if (!g || g.eyes || this.inHouse(g)) return;
      g.eyes = true;
      g.scared = false;
    } else if (e.kind === 'fright') {
      if (input.frightFor === undefined) return;
      this.frightUntil = Math.max(this.frightUntil, stepAt(e.untilMs));
      for (const g of this.gs) if (!g.eyes && !g.jinx) g.scared = true;
    } else {
      this.gs.push({
        id: JINX_FIRST_ID + this.jinxCount++,
        tile: [this.m.house[0], this.m.house[1]],
        dir: 'left',
        next: null,
        prog: 0,
        wait: JINX_WAIT,
        eyes: false,
        scared: false,
        jinx: { target: e.target, untilStep: stepAt(e.untilMs) },
      });
    }
  }

  private tick(k: number, aim: AimNow | null): void {
    if (k >= this.frightUntil) for (const g of this.gs) g.scared = false;
    if (this.gs.length > 4) this.gs = this.gs.filter((g) => !g.jinx || k < g.jinx.untilStep);
    const sp = speeds(this.level);
    let gone: Set<number> | null = null;
    for (const g of this.gs) {
      if (g.wait > 0) {
        g.wait--;
        continue;
      }
      const speed = g.eyes
        ? sp.eyes
        : this.inHouse(g)
          ? sp.house
          : g.scared
            ? sp.frightened
            : sp.ghost;
      advance(g, speed / STEPS_PER_SEC, this.m, {
        ghost: true,
        decide: () => {
          if (g.eyes && g.tile[0] === this.m.house[0] && g.tile[1] === this.m.house[1]) {
            g.eyes = false;
            g.wait = EATEN_WAIT;
            if (g.jinx) (gone ??= new Set()).add(g.id);
            return;
          }
          this.decide(g, k, aim);
        },
      });
    }
    if (gone) this.gs = this.gs.filter((g) => !gone!.has(g.id));
  }

  private inHouse(g: Walker): boolean {
    return this.house.has(key(g.tile[0], g.tile[1]));
  }

  private modeOf(g: GhostState): GhostView['mode'] {
    if (g.eyes) return 'eyes';
    if (g.wait > 0 || this.inHouse(g)) return 'house';
    if (g.scared) return 'fright';
    if (g.jinx) return 'chase';
    return this.step % CYCLE_STEPS < SCATTER_STEPS ? 'scatter' : 'chase';
  }

  private nearest(g: Walker, aim: AimNow | null) {
    let best: AimNow['players'][number] | null = null;
    let bd = Infinity;
    for (const p of aim?.players ?? []) {
      const d = (p.tile[0] - g.tile[0]) ** 2 + (p.tile[1] - g.tile[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /**
   * Where ghost `id` is steering at the current step, given these inputs (the wandering ghost's
   * random offset left out). For tests and debugging; it changes nothing.
   */
  target(id: number, input: GhostInput): Vec | null {
    const g = this.gs.find((x) => x.id === id);
    if (!g) return null;
    let cur: Aim | undefined;
    for (const a of input.aims)
      if (stepAt(a.atMs) <= this.step && (!cur || a.atMs >= cur.atMs)) cur = a;
    return this.targetOf(g, this.step, aimOf(cur, input.frightFor), false);
  }

  private targetOf(g: GhostState, k: number, aim: AimNow | null, wander = true): Vec {
    const m = this.m;
    if (g.eyes) return m.house;
    if (this.inHouse(g)) return m.exit;
    if (g.jinx) {
      const t = g.jinx.target;
      return aim?.players.find((p) => p.id === t)?.tile ?? m.exit;
    }
    if (g.scared) {
      const c = this.nearest(g, aim);
      if (!c) return [1, 1];
      return [c.tile[0] < m.w / 2 ? m.w - 2 : 1, c.tile[1] < m.h / 2 ? m.h - 2 : 1];
    }
    if (k % CYCLE_STEPS < SCATTER_STEPS) {
      const corners: Vec[] = [
        [1, 1],
        [m.w - 2, 1],
        [1, m.h - 2],
        [m.w - 2, m.h - 2],
      ];
      return corners[g.id % 4]!;
    }
    const c = this.nearest(g, aim);
    if (!c) return m.exit;
    const [px, py] = c.tile;
    switch (g.id) {
      case 1: {
        // heads for where its chomper is going: up to AHEAD_TILES on along its heading
        const t: [number, number] = [px, py];
        const d = DIR_ORDER.find((x) => DIRS[x][0] === c.dir[0] && DIRS[x][1] === c.dir[1]);
        for (let i = 0; d && i < AHEAD_TILES && canEnter(m, t, d, false); i++) {
          t[0] = wrapX(m, t[0] + c.dir[0]);
          t[1] += c.dir[1];
        }
        return t;
      }
      case 2: // wanders around its chomper
        return wander ? [px + this.rng.int(8) - 4, py + this.rng.int(8) - 4] : c.tile;
      case 3: {
        // shy: chases from afar, backs off to its corner when close
        const d = (px - g.tile[0]) ** 2 + (py - g.tile[1]) ** 2;
        return d < SHY_TILES ** 2 ? [1, m.h - 2] : c.tile;
      }
      default: // direct
        return c.tile;
    }
  }

  private decide(g: GhostState, k: number, aim: AimNow | null): void {
    const [tx, ty] = this.targetOf(g, k, aim);
    const inside = this.inHouse(g);
    const opts = DIR_ORDER.filter((d) => {
      if (!canEnter(this.m, g.tile, d, true)) return false;
      // Out in the maze, only eyes go back in through the door.
      if (!g.eyes && !inside) {
        const nx = wrapX(this.m, g.tile[0] + DIRS[d][0]);
        if (isDoor(this.m, nx, g.tile[1] + DIRS[d][1])) return false;
      }
      return true;
    });
    const fwd = g.dir ? opts.filter((d) => d !== opposite(g.dir!)) : opts;
    const noisy = g.scared && !g.eyes && !inside;
    let best: Dir | null = null;
    let bd = Infinity;
    for (const d of fwd.length ? fwd : opts) {
      let dd = (g.tile[0] + DIRS[d][0] - tx) ** 2 + (g.tile[1] + DIRS[d][1] - ty) ** 2;
      if (noisy) dd += this.rng.int(30);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    if (best) g.next = best;
  }
}
