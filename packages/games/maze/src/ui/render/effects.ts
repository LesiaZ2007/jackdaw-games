import type { FrameEffect, FrameModel } from '../frame';
import { colorOf, type LookStyle } from './look';

/** Positions are in tiles (tile centers at whole numbers); times in seconds. */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  r: number;
}
export interface Ring {
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
}
/** A pellet pulled in by Magnet, flying to a chomper (found by id each frame). */
export interface Fly {
  x: number;
  y: number;
  t: number;
  life: number;
  to: string;
}
export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  life: number;
}

const FLASH_S = 1.2;
const SHAKE_S = 0.35;

/** Particles, rings, floating score numbers, shake and maze flash that outlive a frame. */
export class Effects {
  sparks: Spark[] = [];
  rings: Ring[] = [];
  flies: Fly[] = [];
  floats: Float[] = [];
  /** Seconds of shake / maze flash left. */
  shakeT = 0;
  flashT = 0;
  private seed = 12345;

  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  get active(): number {
    return this.sparks.length + this.rings.length + this.flies.length + this.floats.length;
  }

  burst(x: number, y: number, color: string, n = 14, speed = 6, life = 0.7, sizeMul = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = speed * (0.4 + this.rnd() * 0.8);
      this.sparks.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0,
        life: life * (0.6 + this.rnd() * 0.6),
        color,
        r: (0.08 + this.rnd() * 0.1) * sizeMul,
      });
    }
  }

  ring(x: number, y: number, color: string): void {
    this.rings.push({ x, y, t: 0, life: 0.6, color });
  }

  float(x: number, y: number, text: string, color: string, size = 1.05, life = 1.3): void {
    this.floats.push({ x, y, text, color, size, t: 0, life });
  }

  /** Turns this frame's events into animations. */
  ingest(effects: readonly FrameEffect[], model: FrameModel, look: LookStyle): void {
    const chomperColor = (id: string): string => {
      const c = model.board?.chompers.find((q) => q.id === id);
      const s = model.scores.find((q) => q.id === id);
      return colorOf(look.players, c?.colorIndex ?? s?.colorIndex ?? 0);
    };
    for (const e of effects) {
      switch (e.kind) {
        case 'magnet':
          this.flies.push({ x: e.x, y: e.y, t: 0, life: 0.35, to: e.by });
          break;
        case 'power': {
          const col = look.power[e.power];
          this.burst(e.x, e.y, col, 18, 7, 0.8);
          this.ring(e.x, e.y, col);
          break;
        }
        case 'ghostEaten': {
          const col = chomperColor(e.by);
          this.burst(e.x, e.y, col, 16, 7, 0.8);
          this.ring(e.x, e.y, col);
          this.float(e.x, e.y, '+' + e.points, col, 1.5);
          break;
        }
        case 'fruitEaten': {
          const col = chomperColor(e.by);
          this.burst(e.x, e.y, '#ffd34d', 14, 6, 0.7);
          this.float(e.x, e.y, '+' + e.points, col, 1.5);
          break;
        }
        case 'fruitSpawned':
          this.ring(e.x, e.y, '#ffd34d');
          break;
        case 'caught':
          this.burst(e.x, e.y, chomperColor(e.by), 24, 8, 0.9, 1.2);
          this.ring(e.x, e.y, chomperColor(e.by));
          if (e.mine) this.shakeT = SHAKE_S;
          break;
        case 'respawn': {
          const c = model.board?.chompers.find((q) => q.id === e.by);
          if (c) this.ring(c.x, c.y, chomperColor(e.by));
          break;
        }
        case 'mazeCleared':
          this.flashT = FLASH_S;
          break;
        case 'attackReceived':
          this.shakeT = SHAKE_S;
          break;
        default:
          break;
      }
    }
  }

  update(dt: number): void {
    for (const q of this.sparks) {
      q.t += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
    }
    for (const q of this.rings) q.t += dt;
    for (const q of this.flies) q.t += dt;
    for (const q of this.floats) q.t += dt;
    this.sparks = this.sparks.filter((q) => q.t < q.life);
    this.rings = this.rings.filter((q) => q.t < q.life);
    this.flies = this.flies.filter((q) => q.t < q.life);
    this.floats = this.floats.filter((q) => q.t < q.life);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
  }

  /** Pixel offset for the board while it shakes. */
  shakeOffset(T: number): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const k = this.shakeT / SHAKE_S;
    return [(this.rnd() - 0.5) * T * 0.5 * k, (this.rnd() - 0.5) * T * 0.5 * k];
  }

  /** The maze walls flash white-ish for a moment after a clear: true on alternate sixths. */
  get flashing(): boolean {
    return this.flashT > 0 && Math.floor(this.flashT * 6) % 2 === 0;
  }
}

// ---- confetti: a DOM overlay canvas the screens own -------------------------------------------

export interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  vr: number;
  w: number;
  h: number;
  c: string;
  t: number;
}

export const CONFETTI_COLORS = [
  '#ff2bd6',
  '#22e6ff',
  '#ffe14d',
  '#7dff6a',
  '#d2aa5c',
  '#a63a30',
  '#2b5683',
  '#f6f0e1',
];

/** A tiny seeded generator for looks-only randomness. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** `n` pieces shot up from the two lower sides of a `width` × `height` area. */
export function makeConfetti(
  width: number,
  height: number,
  n: number,
  colors: readonly string[] = CONFETTI_COLORS,
  rnd: () => number = lcg(Date.now()),
): Bit[] {
  const out: Bit[] = [];
  const palette = colors.length ? colors : CONFETTI_COLORS;
  for (let i = 0; i < n; i++) {
    const side = i % 2;
    out.push({
      x: side ? width + 10 : -10,
      y: height * (0.45 + rnd() * 0.4),
      vx: (side ? -1 : 1) * (6 + rnd() * 9),
      vy: -(10 + rnd() * 9),
      r: rnd() * 6,
      vr: (rnd() - 0.5) * 0.4,
      w: 6 + rnd() * 6,
      h: 3 + rnd() * 4,
      c: palette[Math.floor(rnd() * palette.length)] ?? '#ffffff',
      t: 0,
    });
  }
  return out;
}

/** Moves the pieces by `dt` seconds and returns those still on screen. */
export function stepConfetti(bits: Bit[], dt: number, height: number): Bit[] {
  for (const b of bits) {
    b.t += dt;
    b.vy += 22 * dt;
    b.vx *= 0.99;
    b.x += b.vx * 60 * dt * 0.5;
    b.y += b.vy * 60 * dt * 0.5;
    b.r += b.vr;
  }
  return bits.filter((b) => b.y < height + 40 && b.t < 6);
}

export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  bits: readonly Bit[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const b of bits) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.r);
    ctx.scale(1, Math.cos(b.t * 9));
    ctx.fillStyle = b.c;
    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    ctx.restore();
  }
}

/**
 * Shoots confetti across an overlay canvas (fixed, full screen, pointer-events none, made by the
 * screen). Runs itself with requestAnimationFrame and clears the canvas when done. Returns a stop
 * function; does nothing where there is no canvas context or animation frame.
 */
export function confetti(
  canvas: HTMLCanvasElement,
  n = 120,
  colors: readonly string[] = CONFETTI_COLORS,
): () => void {
  const raf = globalThis.requestAnimationFrame as ((cb: (t: number) => void) => number) | undefined;
  const ctx = canvas.getContext?.('2d') ?? null;
  if (!ctx || !raf) return () => undefined;
  const dpr = globalThis.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width / dpr;
  const height = canvas.clientHeight || canvas.height / dpr;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  let bits = makeConfetti(width, height, n, colors);
  let stopped = false;
  let last = 0;
  const frame = (now: number) => {
    if (stopped) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    bits = stepConfetti(bits, dt, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawConfetti(ctx, bits, width, height);
    if (bits.length) raf(frame);
    else stopped = true;
  };
  raf(frame);
  return () => {
    stopped = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
