import type { MazeLayout } from '../../sim/layouts';
import type { PowerKind } from '../../sim/powers';
import type { Dir } from '../../sim/walker';
import type { FrameGhost, Look } from '../frame';

export type { Look };

export const FONT = "'Big Shoulders','Big Shoulders Display','Arial Narrow',sans-serif";

/** What a look needs to know to paint one ghost. */
export interface GhostPaint {
  color: string;
  /** Edible (blue-ish) body. */
  fright: boolean;
  /** Only the eyes, heading back to the house. */
  eyes: boolean;
  jinx: boolean;
  dir: Dir;
  /** Seconds, for the skirt wobble. */
  t: number;
  bob: number;
}

/**
 * Everything that differs between looks. The core owns layout, animation and effects; a look
 * owns colors and how each thing is painted. Every drawer works in pixels: `T` is the tile size,
 * and the ones that paint a figure are already translated to its center (and, for the chomper,
 * rotated to face its way).
 */
export interface LookStyle {
  id: Look;
  bg: string;
  /** Text outline and the dark ink used for labels and big numbers. */
  ink: string;
  textStroke: string;
  /** Color of GO and of the gold banners. */
  go: string;
  gold: string;
  /** Plain big text (the countdown numbers). */
  countColor: string;
  players: readonly string[];
  ghosts: readonly string[];
  jinx: string;
  power: Record<PowerKind, string>;
  /** Neon-style glow on figures and text. */
  glow: boolean;
  frightColor(flash: boolean): string;
  /** Paints all the walls of a maze at scale T (the core caches the result as a layer). */
  walls(ctx: CanvasRenderingContext2D, layout: MazeLayout, T: number, flash: boolean): void;
  pellets(ctx: CanvasRenderingContext2D, pellets: [number, number][], T: number): void;
  powerSpot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    T: number,
    color: string,
    pulse: number,
  ): void;
  /** Origin at the center, facing right, mouth half-angle `m`. `eye` is false while dying. */
  chomper(
    ctx: CanvasRenderingContext2D,
    T: number,
    R: number,
    m: number,
    color: string,
    eye: boolean,
  ): void;
  ghost(ctx: CanvasRenderingContext2D, T: number, g: GhostPaint): void;
  /** Drawn over the board, under the text. */
  overlay(ctx: CanvasRenderingContext2D, w: number, h: number, T: number, t: number): void;
}

export const colorOf = (arr: readonly string[], i: number, fallback = '#888888'): string =>
  arr.length ? (arr[((i % arr.length) + arr.length) % arr.length] ?? fallback) : fallback;

export function glow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

export const easeOutBack = (x: number): number =>
  1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

export function chomperPath(ctx: CanvasRenderingContext2D, R: number, m: number): void {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, m, Math.PI * 2 - m);
  ctx.closePath();
}

/** Faces the context toward `dir` while staying upright: left mirrors instead of flipping. */
export function orient(ctx: CanvasRenderingContext2D, dir: Dir): void {
  if (dir === 'left') ctx.scale(-1, 1);
  else if (dir === 'up') ctx.rotate(-Math.PI / 2);
  else if (dir === 'down') {
    ctx.rotate(Math.PI / 2);
    ctx.scale(1, -1);
  }
}

const isSolid = (m: MazeLayout, r: number, c: number): boolean =>
  r >= 0 && r < m.h && c >= 0 && c < m.w && (m.rows[r]![c] === '#' || m.rows[r]![c] === '-');

export const isWallAt = (m: MazeLayout, c: number, r: number): boolean =>
  r < 0 || r >= m.h ? true : m.rows[r]![((c % m.w) + m.w) % m.w] === '#';
export const isDoorAt = (m: MazeLayout, c: number, r: number): boolean =>
  r >= 0 && r < m.h && m.rows[r]![((c % m.w) + m.w) % m.w] === '-';

const segCache = new WeakMap<MazeLayout, [number, number, number, number][]>();

/**
 * The wall outline: each wall tile's exposed sides as segments inset by 0.3 of a tile, joined at
 * corners so a thick wall reads as one rounded rule around its edge.
 */
export function wallSegments(m: MazeLayout): [number, number, number, number][] {
  const hit = segCache.get(m);
  if (hit) return hit;
  const I = 0.3;
  const segs: [number, number, number, number][] = [];
  const w = (r: number, c: number) => isSolid(m, r, c);
  const eo = (nr: number, nc: number, dr: number, dc: number) =>
    !w(nr, nc) ? I : !w(dr, dc) ? 0 : -I;
  for (let r = 0; r < m.h; r++)
    for (let c = 0; c < m.w; c++) {
      if (m.rows[r]![c] !== '#') continue;
      if (!w(r - 1, c))
        segs.push([
          c + eo(r, c - 1, r - 1, c - 1),
          r + I,
          c + 1 - eo(r, c + 1, r - 1, c + 1),
          r + I,
        ]);
      if (!w(r + 1, c))
        segs.push([
          c + eo(r, c - 1, r + 1, c - 1),
          r + 1 - I,
          c + 1 - eo(r, c + 1, r + 1, c + 1),
          r + 1 - I,
        ]);
      if (!w(r, c - 1))
        segs.push([
          c + I,
          r + eo(r - 1, c, r - 1, c - 1),
          c + I,
          r + 1 - eo(r + 1, c, r + 1, c - 1),
        ]);
      if (!w(r, c + 1))
        segs.push([
          c + 1 - I,
          r + eo(r - 1, c, r - 1, c + 1),
          c + 1 - I,
          r + 1 - eo(r + 1, c, r + 1, c + 1),
        ]);
    }
  segCache.set(m, segs);
  return segs;
}

function strokeSegments(ctx: CanvasRenderingContext2D, m: MazeLayout, T: number): void {
  ctx.beginPath();
  for (const [a, b, c, d] of wallSegments(m)) {
    ctx.moveTo(a * T, b * T);
    ctx.lineTo(c * T, d * T);
  }
  ctx.stroke();
}

function doors(
  ctx: CanvasRenderingContext2D,
  m: MazeLayout,
  T: number,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let r = 0; r < m.h; r++)
    for (let c = 0; c < m.w; c++)
      if (m.rows[r]![c] === '-') {
        ctx.moveTo(c * T - 2, (r + 0.5) * T);
        ctx.lineTo((c + 1) * T + 2, (r + 0.5) * T);
      }
  ctx.stroke();
}

export interface InkedWalls {
  fill: string;
  flashFill: string;
  bg: string;
  stroke: string;
  flashStroke: string;
  door: string;
}

/** Soft filled walls with an inked rule: Printed and Cabinet. */
export function inkedWalls(
  ctx: CanvasRenderingContext2D,
  m: MazeLayout,
  T: number,
  flash: boolean,
  o: InkedWalls,
): void {
  ctx.fillStyle = flash ? o.flashFill : o.fill;
  for (let r = 0; r < m.h; r++)
    for (let c = 0; c < m.w; c++)
      if (m.rows[r]![c] === '#') {
        const l = isWallAt(m, c - 1, r) ? 0 : 0.3,
          rr = isWallAt(m, c + 1, r) ? 0 : 0.3,
          t = isWallAt(m, c, r - 1) ? 0 : 0.3,
          b = isWallAt(m, c, r + 1) ? 0 : 0.3;
        ctx.fillRect((c + l) * T, (r + t) * T, (1 - l - rr) * T + 0.5, (1 - t - b) * T + 0.5);
      }
  // inside corners: the square beyond the rule belongs to the corridor
  ctx.fillStyle = o.bg;
  for (let r = 0; r < m.h; r++)
    for (let c = 0; c < m.w; c++)
      if (m.rows[r]![c] === '#')
        for (const [dx, dy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const)
          if (
            isWallAt(m, c + dx, r) &&
            isWallAt(m, c, r + dy) &&
            !isWallAt(m, c + dx, r + dy) &&
            !isDoorAt(m, c + dx, r + dy)
          )
            ctx.fillRect(
              (c + (dx < 0 ? 0 : 0.7)) * T,
              (r + (dy < 0 ? 0 : 0.7)) * T,
              0.3 * T + 0.5,
              0.3 * T + 0.5,
            );
  ctx.strokeStyle = flash ? o.flashStroke : o.stroke;
  ctx.lineWidth = Math.max(1.5, T * 0.11);
  ctx.lineCap = 'round';
  strokeSegments(ctx, m, T);
  doors(ctx, m, T, o.door, T * 0.22);
}

/** Glowing outline walls on a dark board: Neon. */
export function neonWalls(
  ctx: CanvasRenderingContext2D,
  m: MazeLayout,
  T: number,
  color: string,
  door: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.4, T * 0.14);
  ctx.lineCap = 'round';
  glow(ctx, color, T * 0.6);
  strokeSegments(ctx, m, T);
  ctx.shadowBlur = 0;
  strokeSegments(ctx, m, T);
  glow(ctx, door, T * 0.5);
  doors(ctx, m, T, door, T * 0.2);
  ctx.shadowBlur = 0;
}

export function roundPellets(
  ctx: CanvasRenderingContext2D,
  pellets: [number, number][],
  T: number,
  color: string,
  glowOn: boolean,
): void {
  ctx.fillStyle = color;
  if (glowOn) glow(ctx, color, T * 0.3);
  else ctx.shadowBlur = 0;
  ctx.beginPath();
  const r = T * 0.12;
  for (const [x, y] of pellets) {
    ctx.moveTo((x + 0.5) * T + r, (y + 0.5) * T);
    ctx.arc((x + 0.5) * T, (y + 0.5) * T, r, 0, 7);
  }
  ctx.fill();
  ctx.shadowBlur = 0;
}

export function fruitShape(
  ctx: CanvasRenderingContext2D,
  kind: 'cherry' | 'berry' | 'lemon',
  cx: number,
  cy: number,
  s: number,
  glowOn: boolean,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  if (glowOn) glow(ctx, '#ffd34d', 10);
  if (kind === 'cherry') {
    ctx.strokeStyle = '#7bd34a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-2.5, 1.5);
    ctx.quadraticCurveTo(-1, -4, 3, -5.5);
    ctx.moveTo(2.5, 2);
    ctx.quadraticCurveTo(2, -2, 3, -5.5);
    ctx.stroke();
    ctx.fillStyle = '#ff2d4a';
    ctx.beginPath();
    ctx.arc(-2.6, 2.4, 2.4, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#e0123a';
    ctx.beginPath();
    ctx.arc(2.6, 2.8, 2.4, 0, 7);
    ctx.fill();
  } else if (kind === 'berry') {
    ctx.fillStyle = '#ff3d5e';
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.lineTo(-4, -1);
    ctx.quadraticCurveTo(0, -3, 4, -1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5fd35a';
    ctx.beginPath();
    ctx.moveTo(-3, -1.5);
    ctx.lineTo(0, -3.8);
    ctx.lineTo(3, -1.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath();
    ctx.ellipse(0, 0.5, 4.2, 3.2, 0, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

/** The smooth ghost silhouette (bell top, wavy skirt) in a 12-unit box around (0, 0). */
export function ghostPath(ctx: CanvasRenderingContext2D, wob: number): void {
  ctx.beginPath();
  ctx.moveTo(-6, 6);
  ctx.lineTo(-6, -1);
  ctx.arc(0, -1, 6, Math.PI, 0);
  ctx.lineTo(6, 6);
  ctx.lineTo(4, 4.2 + wob);
  ctx.lineTo(2, 6);
  ctx.lineTo(0, 4.2 - wob);
  ctx.lineTo(-2, 6);
  ctx.lineTo(-4, 4.2 + wob);
  ctx.closePath();
}

/** Eyes shared by the smooth looks. */
export function ghostFace(
  ctx: CanvasRenderingContext2D,
  g: GhostPaint,
  pupil: string,
  eyesColor: string,
  outline: string | null,
): void {
  if (g.fright && !g.eyes) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -2.4, 1.8, 1.8);
    ctx.fillRect(1.2, -2.4, 1.8, 1.8);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    for (let i = 0; i < 5; i++) ctx.lineTo(-4 + i * 2 + 1, i % 2 ? 2 : 1);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-2.3, -1, 1.8, 0, 7);
  ctx.arc(2.3, -1, 1.8, 0, 7);
  ctx.fill();
  const dx = g.dir === 'left' ? -0.7 : g.dir === 'right' ? 0.7 : 0;
  const dy = g.dir === 'up' ? -0.7 : g.dir === 'down' ? 0.7 : 0;
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(-2.3, -1, 1.8, 0, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(2.3, -1, 1.8, 0, 7);
    ctx.stroke();
  }
  ctx.fillStyle = g.eyes ? eyesColor : pupil;
  ctx.beginPath();
  ctx.arc(-2.3 + dx, -1 + dy, 0.85, 0, 7);
  ctx.arc(2.3 + dx, -1 + dy, 0.85, 0, 7);
  ctx.fill();
}

export function paintOf(g: FrameGhost, color: string, t: number): GhostPaint {
  return {
    color,
    fright: g.mode === 'fright',
    eyes: g.mode === 'eyes',
    jinx: g.colorIndex < 0,
    dir: g.dir,
    t,
    bob: g.id * 1.7,
  };
}
