'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createRng, type Rng } from '@jackdaw/engine';
import {
  DIRS,
  DIR_ORDER,
  houseTiles,
  isDoor,
  isWall,
  layoutsOf,
  opposite,
  wrapX,
  type MazeLayout,
} from '../sim/layouts';
import type { Dir } from '../sim/walker';
import type { FrameBoard, FrameChomper, FrameGhost, FrameModel, Look } from './frame';
import { fitTile } from './layout';
import { draw } from './render/core';
import { useSize } from './use-maze';

/**
 * The lobby's attract mode: ghosts chase chompers through a maze, behind the lobby's content.
 * A small scripted loop (not the real sim, which wants a table and a server): everyone walks tile
 * to tile, chompers eat pellets and flee, a power spot turns the ghosts blue for a few seconds,
 * and what is caught comes back. It is deterministic for a seed, and the renderer draws it in
 * whatever look the host picked.
 */

export interface AttractPlayer {
  id: string;
  name: string;
  /** Seat index: the player's color in the look. */
  colorIndex: number;
}

const CHOMPER_SPEED = 5.2; // tiles per second
const GHOST_SPEED = 4.6;
const FRIGHT_MS = 6000;
const DYING_MS = 900;
const SHIELD_MS = 1600;
const EYES_MS = 2200;
const SPOT_BACK_MS = 9000;
/** The most chompers in the maze at once. */
export const MAX_CHOMPERS = 8;
const GHOST_COUNT = 4;

interface Actor {
  /** The tile it is leaving, and where it is heading. */
  x: number;
  y: number;
  dir: Dir;
  /** 0 → 1 between the two tiles. */
  t: number;
}

interface Chomp extends Actor {
  id: string;
  name: string;
  colorIndex: number;
  mouth: number;
  dyingMs: number;
  shieldMs: number;
  demo: boolean;
}

interface Ghost extends Actor {
  id: number;
  mode: 'chase' | 'fright' | 'eyes';
  frightMs: number;
  eyesMs: number;
}

const key = (x: number, y: number) => `${x},${y}`;

export class Attract {
  readonly layout: MazeLayout;
  private rng: Rng;
  private house: Set<string>;
  private pellets = new Map<string, [number, number]>();
  private spots: { x: number; y: number; up: boolean; backMs: number }[];
  private pelletList: [number, number][] = [];
  private rev = 0;
  private chompers: Chomp[] = [];
  private ghosts: Ghost[] = [];
  private clock = 0;

  constructor(seed: number | string) {
    const n = typeof seed === 'number' ? seed : hash(seed);
    this.rng = createRng(n);
    const layouts = layoutsOf('Small');
    this.layout = layouts[n % layouts.length]!;
    this.house = houseTiles(this.layout);
    this.spots = this.layout.powers.map(([x, y]) => ({ x, y, up: true, backMs: 0 }));
    this.refill();
    const [ex, ey] = this.layout.exit;
    for (let i = 0; i < GHOST_COUNT; i++)
      this.ghosts.push({
        id: i,
        x: ex,
        y: ey,
        dir: i % 2 ? 'left' : 'right',
        t: 0,
        mode: 'chase',
        frightMs: 0,
        eyesMs: 0,
      });
  }

  /** Who is chomping. At least two chompers run: spare ones are unnamed demos. */
  setRoster(players: readonly AttractPlayer[]): void {
    const want = players.slice(0, MAX_CHOMPERS);
    this.chompers = this.chompers.filter((c) => c.demo || want.some((p) => p.id === c.id));
    for (const p of want) {
      const have = this.chompers.find((c) => c.id === p.id);
      if (have) {
        have.name = p.name;
        have.colorIndex = p.colorIndex;
      } else this.chompers.push(this.spawn(p.id, p.name, p.colorIndex, false));
    }
    // Demos fill the maze up to two chompers; they leave as real players arrive.
    this.chompers = this.chompers.filter((c) => !c.demo);
    for (let i = 0; this.chompers.length < 2; i++) {
      const colorIndex = (want.length + i) % 8;
      this.chompers.push(this.spawn(`demo-${i}`, '', colorIndex, true));
    }
  }

  private spawn(id: string, name: string, colorIndex: number, demo: boolean): Chomp {
    const s = this.layout.starts[colorIndex % this.layout.starts.length]!;
    return {
      id,
      name,
      colorIndex,
      demo,
      x: s[0],
      y: s[1],
      dir: s[2],
      t: 0,
      mouth: 0,
      dyingMs: 0,
      shieldMs: SHIELD_MS,
    };
  }

  /** Runs the scene for `ms` milliseconds (in steps of at most 50). */
  advance(ms: number): void {
    let left = Math.min(ms, 2000);
    while (left > 0) {
      const dt = Math.min(50, left);
      left -= dt;
      this.step(dt);
    }
  }

  private refill(): void {
    this.pellets.clear();
    this.layout.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '.') this.pellets.set(key(x, y), [x, y]);
    });
    for (const s of this.spots) s.up = true;
    this.pelletList = [...this.pellets.values()];
    this.rev++;
  }

  private open(x: number, y: number): boolean {
    const nx = wrapX(this.layout, x);
    return (
      !isWall(this.layout, nx, y) && !isDoor(this.layout, nx, y) && !this.house.has(key(nx, y))
    );
  }

  private exits(a: Actor): Dir[] {
    return DIR_ORDER.filter((d) => this.open(a.x + DIRS[d][0], a.y + DIRS[d][1]));
  }

  private dist(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    return Math.min(dx, this.layout.w - dx) + Math.abs(ay - by);
  }

  private pos(a: Actor): [number, number] {
    const w = this.layout.w;
    let x = (((a.x + DIRS[a.dir][0] * a.t) % w) + w) % w;
    if (x > w - 0.5) x -= w;
    return [x, a.y + DIRS[a.dir][1] * a.t];
  }

  /** The first step of the shortest walk from a chomper to any wanted tile, or null. */
  private firstStep(from: Actor, want: (x: number, y: number) => boolean): Dir | null {
    const seen = new Set([key(from.x, from.y)]);
    let frontier: { x: number; y: number; first: Dir }[] = [];
    for (const d of this.exits(from)) {
      const x = wrapX(this.layout, from.x + DIRS[d][0]);
      const y = from.y + DIRS[d][1];
      if (d === opposite(from.dir) && this.exits(from).length > 1) continue;
      seen.add(key(x, y));
      frontier.push({ x, y, first: d });
    }
    for (let depth = 0; depth < 60 && frontier.length; depth++) {
      for (const f of frontier) if (want(f.x, f.y)) return f.first;
      const next: typeof frontier = [];
      for (const f of frontier)
        for (const d of DIR_ORDER) {
          const x = wrapX(this.layout, f.x + DIRS[d][0]);
          const y = f.y + DIRS[d][1];
          if (!this.open(x, y) || seen.has(key(x, y))) continue;
          seen.add(key(x, y));
          next.push({ x, y, first: f.first });
        }
      frontier = next;
    }
    return null;
  }

  private chomperTurn(c: Chomp): void {
    const options = this.exits(c);
    if (options.length === 0) return;
    const at = (d: Dir): [number, number] => [
      wrapX(this.layout, c.x + DIRS[d][0]),
      c.y + DIRS[d][1],
    ];
    const threats = this.ghosts.filter(
      (g) => g.mode === 'chase' && this.dist(g.x, g.y, c.x, c.y) <= 4,
    );
    if (threats.length) {
      let best = options[0]!;
      let bestScore = -1;
      for (const d of options) {
        const [x, y] = at(d);
        const score = Math.min(...threats.map((g) => this.dist(g.x, g.y, x, y)));
        if (score > bestScore) {
          best = d;
          bestScore = score;
        }
      }
      c.dir = best;
      return;
    }
    const prey = this.ghosts.filter(
      (g) => g.mode === 'fright' && g.frightMs > 1500 && this.dist(g.x, g.y, c.x, c.y) <= 9,
    );
    if (prey.length) {
      const p = prey[0]!;
      const d = this.firstStep(c, (x, y) => this.dist(p.x, p.y, x, y) <= 1);
      if (d) {
        c.dir = d;
        return;
      }
    }
    const d = this.firstStep(
      c,
      (x, y) =>
        this.pellets.has(key(x, y)) || this.spots.some((s) => s.up && s.x === x && s.y === y),
    );
    if (d) c.dir = d;
    else c.dir = options[Math.floor(this.rng.next() * options.length)]!;
  }

  private ghostTurn(g: Ghost): void {
    let options = this.exits(g);
    if (options.length === 0) return;
    if (options.length > 1) options = options.filter((d) => d !== opposite(g.dir));
    const live = this.chompers.filter((c) => c.dyingMs <= 0);
    const near = live.length
      ? live.reduce((a, b) =>
          this.dist(a.x, a.y, g.x, g.y) <= this.dist(b.x, b.y, g.x, g.y) ? a : b,
        )
      : null;
    // Each ghost wanders now and then, so they spread out instead of queueing.
    if (g.mode === 'chase' && (!near || this.rng.next() < 0.22 + g.id * 0.04)) {
      g.dir = options[Math.floor(this.rng.next() * options.length)]!;
      return;
    }
    const [tx, ty] = g.mode === 'eyes' ? this.layout.exit : near ? [near.x, near.y] : [g.x, g.y];
    const sign = g.mode === 'fright' ? -1 : 1;
    let best = options[0]!;
    let bestScore = Infinity;
    for (const d of options) {
      const s = sign * this.dist(wrapX(this.layout, g.x + DIRS[d][0]), g.y + DIRS[d][1], tx, ty);
      if (s < bestScore) {
        best = d;
        bestScore = s;
      }
    }
    g.dir = best;
  }

  private advanceActor(a: Actor, speed: number, dt: number, turn: () => void): void {
    a.t += (speed * dt) / 1000;
    while (a.t >= 1) {
      a.t -= 1;
      a.x = wrapX(this.layout, a.x + DIRS[a.dir][0]);
      a.y += DIRS[a.dir][1];
      turn();
      // Turned into a wall (or nothing to turn to): stand at the tile.
      if (!this.open(a.x + DIRS[a.dir][0], a.y + DIRS[a.dir][1])) {
        a.t = 0;
        break;
      }
    }
  }

  private step(dt: number): void {
    this.clock += dt;
    for (const s of this.spots)
      if (!s.up && (s.backMs -= dt) <= 0 && this.pellets.size > 0) s.up = true;

    for (const c of this.chompers) {
      c.shieldMs = Math.max(0, c.shieldMs - dt);
      if (c.dyingMs > 0) {
        c.dyingMs -= dt;
        if (c.dyingMs <= 0) {
          const re = this.spawn(c.id, c.name, c.colorIndex, c.demo);
          Object.assign(c, re);
        }
        continue;
      }
      if (c.t === 0 && !this.open(c.x + DIRS[c.dir][0], c.y + DIRS[c.dir][1])) this.chomperTurn(c);
      this.advanceActor(c, CHOMPER_SPEED, dt, () => this.chomperTurn(c));
      c.mouth += (dt / 1000) * 16;
      const [px, py] = this.pos(c);
      const tx = wrapX(this.layout, Math.round(px));
      const ty = Math.round(py);
      if (this.pellets.delete(key(tx, ty))) {
        this.pelletList = [...this.pellets.values()];
        this.rev++;
      }
      for (const s of this.spots)
        if (s.up && s.x === tx && s.y === ty) {
          s.up = false;
          s.backMs = SPOT_BACK_MS;
          for (const g of this.ghosts)
            if (g.mode === 'chase') {
              g.mode = 'fright';
              g.frightMs = FRIGHT_MS;
              g.dir = opposite(g.dir);
            }
        }
    }
    if (this.pellets.size === 0) this.refill();

    for (const g of this.ghosts) {
      if (g.mode === 'fright' && (g.frightMs -= dt) <= 0) g.mode = 'chase';
      if (g.mode === 'eyes') {
        g.eyesMs -= dt;
        const [px, py] = this.pos(g);
        if (this.dist(px, py, this.layout.exit[0], this.layout.exit[1]) < 1 || g.eyesMs <= 0) {
          g.mode = 'chase';
          g.x = this.layout.exit[0];
          g.y = this.layout.exit[1];
          g.t = 0;
        }
      }
      if (g.t === 0 && !this.open(g.x + DIRS[g.dir][0], g.y + DIRS[g.dir][1])) this.ghostTurn(g);
      const speed = g.mode === 'fright' ? GHOST_SPEED * 0.6 : g.mode === 'eyes' ? 9 : GHOST_SPEED;
      this.advanceActor(g, speed, dt, () => this.ghostTurn(g));
    }

    for (const c of this.chompers) {
      if (c.dyingMs > 0) continue;
      const [cx, cy] = this.pos(c);
      for (const g of this.ghosts) {
        if (g.mode === 'eyes') continue;
        const [gx, gy] = this.pos(g);
        if (Math.hypot(cx - gx, cy - gy) > 0.7) continue;
        if (g.mode === 'fright') {
          g.mode = 'eyes';
          g.eyesMs = EYES_MS;
        } else if (c.shieldMs <= 0) c.dyingMs = DYING_MS;
      }
    }
  }

  /** What the renderer draws now, in `look`. */
  model(look: Look): FrameModel {
    const l = this.layout;
    const chompers: FrameChomper[] = this.chompers.map((c) => {
      const [x, y] = this.pos(c);
      return {
        id: c.id,
        name: c.name,
        colorIndex: c.colorIndex,
        x,
        y,
        dir: c.dir,
        mouth: c.mouth,
        alpha: 1,
        isYou: false,
        power: null,
        frozenMs: 0,
        foggedMs: 0,
        dying: c.dyingMs > 0 ? 1 - c.dyingMs / DYING_MS : null,
        shieldMs: c.shieldMs,
        trail: [],
      };
    });
    const ghosts: FrameGhost[] = this.ghosts.map((g) => {
      const [x, y] = this.pos(g);
      return {
        id: g.id,
        x,
        y,
        dir: g.dir,
        mode: g.mode,
        ending: g.mode === 'fright' && g.frightMs < 2000,
        colorIndex: g.id,
        jinxTarget: null,
        jinxIsYou: false,
      };
    });
    const board: FrameBoard = {
      layout: l,
      w: l.w,
      h: l.h,
      maze: 0,
      level: 0,
      pellets: this.pelletList,
      pelletsRev: this.rev,
      powerSpots: this.spots.map((s, i) => ({
        spot: i,
        x: s.x,
        y: s.y,
        kind: 'hunt',
        up: s.up,
      })),
      fruit: null,
      chompers,
      ghosts,
      fog: null,
      frozenMs: 0,
    };
    return {
      look,
      // Not Shared: that mode draws each chomper's name above it, and in a small attract maze the
      // names overlap. The lineup beside it names everyone.
      mode: 'Race',
      phase: 'play',
      tMs: this.clock,
      me: null,
      board,
      minis: [],
      scores: [],
      timerMs: null,
      countdown: null,
      go: false,
      banner: null,
      effects: [],
      you: null,
      sharedMaze: null,
    };
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The look the host picked, from the lobby's options (Printed when unset or unknown). */
export function lookOf(options: Record<string, unknown>): Look {
  const l = options.look;
  return l === 'Neon' || l === 'Classic' || l === 'Cabinet' ? l : 'Printed';
}

/** Seconds of play shown as the still frame when motion is reduced. */
export const STILL_MS = 7000;

export interface LoopHooks {
  step(dtMs: number): void;
  paint(t: number): void;
  reduced: boolean;
  raf?: (cb: (t: number) => void) => number;
  caf?: (id: number) => void;
  /** Whether the tab is showing. */
  visible?: () => boolean;
}

/**
 * Runs the attract loop. With reduced motion it paints one still frame and never asks for
 * another. Otherwise it steps and paints on every animation frame, skipping the steps while the
 * tab is hidden. Returns a stop function.
 */
export function runAttractLoop(h: LoopHooks): () => void {
  if (h.reduced) {
    h.paint(0);
    return () => undefined;
  }
  const raf = h.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = h.caf ?? ((id) => cancelAnimationFrame(id));
  let id = 0;
  let last: number | null = null;
  let stopped = false;
  const tick = (t: number) => {
    if (stopped) return;
    if (h.visible && !h.visible()) last = null;
    else {
      if (last !== null) h.step(Math.min(100, t - last));
      last = t;
      h.paint(t);
    }
    id = raf(tick);
  };
  id = raf(tick);
  return () => {
    stopped = true;
    caf(id);
  };
}

/** Sizes a canvas's pixels and its box, only when they change. */
function sizeCanvas(c: HTMLCanvasElement, pw: number, ph: number, cssW: number, cssH: number) {
  if (c.width === pw && c.height === ph) return;
  c.width = pw;
  c.height = ph;
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
}

const reducedQuery = '(prefers-reduced-motion: reduce)';

/** True when the device asks for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(reducedQuery).matches);
}

/**
 * Draws the attract scene on `canvas`, fitted to the box around it, in `look`. Switching the look
 * restyles it at once; the scene keeps running.
 */
export function useAttract(
  canvas: RefObject<HTMLCanvasElement | null>,
  box: RefObject<HTMLElement | null>,
  look: Look,
  players: readonly AttractPlayer[],
  seed: string,
): void {
  const [sim] = useState(() => {
    const a = new Attract(seed);
    a.setRoster([]);
    a.advance(STILL_MS);
    return a;
  });
  const size = useSize(box);
  const lookRef = useRef(look);
  const sizeRef = useRef(size);
  useEffect(() => {
    lookRef.current = look;
    sizeRef.current = size;
  });
  const roster = players.map((p) => `${p.id}:${p.name}:${p.colorIndex}`).join('|');
  useEffect(() => {
    sim.setRoster(players);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `roster` is the players' identity
  }, [sim, roster]);

  const paint = (t: number) => {
    const c = canvas.current;
    const { w, h } = sizeRef.current;
    if (!c || w <= 0 || h <= 0) return;
    const l = sim.layout;
    const tile = fitTile(w, h, l.w, l.h, 0);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(l.w * tile * dpr);
    const ph = Math.round(l.h * tile * dpr);
    sizeCanvas(c, pw, ph, l.w * tile, l.h * tile);
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx, sim.model(lookRef.current), { look: lookRef.current, tile, dpr, t });
  };
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  useEffect(() => {
    return runAttractLoop({
      reduced: prefersReducedMotion(),
      step: (dt) => sim.advance(dt),
      paint: (t) => paintRef.current(t),
      visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    });
  }, [sim]);

  // A still frame (reduced motion) has no loop to follow the look or the size: repaint on change.
  useEffect(() => {
    if (prefersReducedMotion()) paintRef.current(0);
  }, [look, size.w, size.h, roster]);
}
