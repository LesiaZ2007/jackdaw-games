import { createRng } from '@jackdaw/engine';
import type { Rng, RngState } from '@jackdaw/engine';
import { DIRS, DIR_ORDER, MAZE_H, MAZE_W, houseTiles, isDoor, opposite, wrapX } from './layouts';
import type { MazeLayout } from './layouts';
import { speeds } from './powers';
import { advance, canEnter, posOf } from './walker';
import type { Dir, Vec, Walker } from './walker';

/** At `atMs` the server noted each chomper's tile; ghosts steer by the latest aim. */
export interface Aim {
  atMs: number;
  tiles: Record<string, Vec>;
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
const SCATTER_STEPS = 6 * STEPS_PER_SEC;
const CYCLE_STEPS = 27 * STEPS_PER_SEC;
/** Steps each ghost waits in the house at the start, then after being eaten, then a jinx. */
const START_WAIT = [60, 192, 324, 456];
const EATEN_WAIT = 48;
const JINX_WAIT = 18;
const JINX_FIRST_ID = 4;

/** The step at or after `ms` (a step k starts at k × 1000/60 ms). */
const stepAt = (ms: number) => Math.ceil((ms * 3) / 50);
/** How many whole steps fit in `ms`. */
const stepsIn = (ms: number) => Math.floor((ms * 3) / 50);

const key = (x: number, y: number) => `${x},${y}`;
const copyGhost = (g: GhostState): GhostState => ({
  ...g,
  tile: [g.tile[0], g.tile[1]],
  jinx: g.jinx ? { ...g.jinx } : null,
});

interface AimNow {
  /** Players in a fixed order, with their tile and roughly which way they're heading. */
  players: { id: string; tile: Vec; dir: Vec }[];
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
    const aims = input.aims
      .map((a, i) => ({ a, i, s: stepAt(a.atMs) }))
      .sort((x, y) => x.a.atMs - y.a.atMs || x.i - y.i);
    let ai = -1;
    while (ai + 1 < aims.length && aims[ai + 1]!.s <= this.step) ai++;
    let aimNow = this.aimAt(aims, ai, input.frightFor);
    while (this.step < target) {
      const k = this.step;
      let moved = false;
      while (ai + 1 < aims.length && aims[ai + 1]!.s <= k) {
        ai++;
        moved = true;
      }
      if (moved) aimNow = this.aimAt(aims, ai, input.frightFor);
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

  private aimAt(aims: { a: Aim; s: number }[], i: number, only: string | undefined): AimNow | null {
    const cur = aims[i]?.a;
    if (!cur) return null;
    const prev = aims[i - 1]?.a;
    const ids = Object.keys(cur.tiles)
      .filter((id) => only === undefined || id === only)
      .sort();
    return {
      players: ids.map((id) => {
        const tile = cur.tiles[id]!;
        const before = prev?.tiles[id];
        let dir: Vec = [0, 0];
        if (before) {
          const dx = tile[0] - before[0];
          const dy = tile[1] - before[1];
          if (dx !== 0 && Math.abs(dx) >= Math.abs(dy)) dir = [Math.sign(dx), 0];
          else if (dy !== 0) dir = [0, Math.sign(dy)];
        }
        return { id, tile, dir };
      }),
    };
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
    this.gs = this.gs.filter((g) => !g.jinx || k < g.jinx.untilStep);
    const sp = speeds(this.level);
    const gone = new Set<number>();
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
            if (g.jinx) gone.add(g.id);
            return;
          }
          this.decide(g, k, aim);
        },
      });
    }
    if (gone.size) this.gs = this.gs.filter((g) => !gone.has(g.id));
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

  private targetOf(g: GhostState, k: number, aim: AimNow | null): Vec {
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
      return [c.tile[0] < MAZE_W / 2 ? MAZE_W - 2 : 1, c.tile[1] < MAZE_H / 2 ? MAZE_H - 2 : 1];
    }
    if (k % CYCLE_STEPS < SCATTER_STEPS) {
      const corners: Vec[] = [
        [1, 1],
        [MAZE_W - 2, 1],
        [1, MAZE_H - 2],
        [MAZE_W - 2, MAZE_H - 2],
      ];
      return corners[g.id % 4]!;
    }
    const c = this.nearest(g, aim);
    if (!c) return m.exit;
    const [px, py] = c.tile;
    switch (g.id) {
      case 1: // heads for where its chomper is going
        return [px + c.dir[0] * 4, py + c.dir[1] * 4];
      case 2: // wanders around its chomper
        return [px + this.rng.int(8) - 4, py + this.rng.int(8) - 4];
      case 3: {
        // shy: backs off to its corner when close
        const d = (px - g.tile[0]) ** 2 + (py - g.tile[1]) ** 2;
        return d < 64 ? [1, MAZE_H - 2] : c.tile;
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
        const nx = wrapX(g.tile[0] + DIRS[d][0]);
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
