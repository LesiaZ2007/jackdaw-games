import type { PowerKind } from '../../sim/powers';
import type { FrameBoard, FrameChomper, FrameGhost, FrameModel, Look, MiniBoard } from '../frame';
import { BANNER_MS } from '../runner';
import { cabinet } from './cabinet';
import { classic } from './classic';
import { Effects } from './effects';
import {
  FONT,
  colorOf,
  easeOutBack,
  fruitShape,
  glow,
  orient,
  paintOf,
  type LookStyle,
} from './look';
import { neon } from './neon';
import { printed } from './printed';

export type { Look };

export const LOOKS: Record<Look, LookStyle> = {
  Printed: printed,
  Neon: neon,
  Classic: classic,
  Cabinet: cabinet,
};

export const styleOf = (look: Look): LookStyle => LOOKS[look] ?? printed;

/** A canvas to paint the wall layer on, once. */
export interface Layer {
  image: CanvasImageSource;
  ctx: CanvasRenderingContext2D;
}

export interface DrawOpts {
  look: Look;
  /** Tile size in CSS pixels. */
  tile: number;
  /** Device pixel ratio the canvas was sized with. */
  dpr: number;
  /** A clock in milliseconds (performance.now()); drives animation and effect time. */
  t: number;
  /** Where wall layers get painted. Defaults to an offscreen canvas; none = walls drawn directly. */
  makeLayer?: (w: number, h: number) => Layer | null;
}

function defaultLayer(w: number, h: number): Layer | null {
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D | null;
      return ctx ? { image: c, ctx } : null;
    }
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      return ctx ? { image: c, ctx } : null;
    }
  } catch {
    /* fall through to drawing directly */
  }
  return null;
}

/** Wall layers, built once per maze + look + size and reused every frame. */
export const wallCache = {
  layers: new Map<string, Layer>(),
  /** How many layers have been painted (tests watch this). */
  builds: 0,
  max: 16,
  clear(): void {
    this.layers.clear();
    this.builds = 0;
  },
};

function drawWalls(
  ctx: CanvasRenderingContext2D,
  st: LookStyle,
  layout: FrameBoard['layout'],
  o: DrawOpts,
  flash: boolean,
): void {
  const T = o.tile;
  const w = layout.w * T;
  const h = layout.h * T;
  const key = `${layout.id}|${layout.w}x${layout.h}|${st.id}|${T}|${o.dpr}|${flash ? 1 : 0}`;
  let layer = wallCache.layers.get(key);
  if (!layer) {
    const made = (o.makeLayer ?? defaultLayer)(Math.ceil(w * o.dpr), Math.ceil(h * o.dpr));
    if (!made) {
      st.walls(ctx, layout, T, flash);
      return;
    }
    made.ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    st.walls(made.ctx, layout, T, flash);
    wallCache.builds++;
    if (wallCache.layers.size >= wallCache.max) {
      const first = wallCache.layers.keys().next().value;
      if (first !== undefined) wallCache.layers.delete(first);
    }
    wallCache.layers.set(key, made);
    layer = made;
  }
  ctx.drawImage(layer.image, 0, 0, w, h);
}

interface RenderState {
  fx: Effects;
  lastT: number | null;
  goT: number;
}
const states = new WeakMap<object, RenderState>();

function stateOf(ctx: CanvasRenderingContext2D): RenderState {
  let s = states.get(ctx);
  if (!s) {
    s = { fx: new Effects(), lastT: null, goT: 0 };
    states.set(ctx, s);
  }
  return s;
}

/** The effects behind a context (tests read them to check expiry). */
export const effectsOf = (ctx: CanvasRenderingContext2D): Effects => stateOf(ctx).fx;

function bigText(
  ctx: CanvasRenderingContext2D,
  st: LookStyle,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  alpha = 1,
): void {
  if (size < 1 || alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.16);
  ctx.strokeStyle = st.textStroke;
  ctx.strokeText(text, x, y);
  if (st.glow) glow(ctx, color, size * 0.35);
  else {
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = st.ink;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  if (!st.glow) ctx.strokeText(text, x, y);
  ctx.restore();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  st: LookStyle,
  g: FrameGhost,
  T: number,
  ts: number,
): void {
  const fright = g.mode === 'fright';
  const jinx = g.colorIndex < 0;
  let col = jinx ? st.jinx : colorOf(st.ghosts, g.colorIndex);
  if (fright && !jinx) col = st.frightColor(g.ending && Math.floor(ts * 6) % 2 === 1);
  ctx.save();
  ctx.translate((g.x + 0.5) * T, (g.y + 0.5) * T + Math.sin(ts * 6 + g.id * 1.7) * T * 0.05);
  st.ghost(ctx, T, paintOf(g, col, ts));
  ctx.restore();
}

function drawChomper(
  ctx: CanvasRenderingContext2D,
  st: LookStyle,
  c: FrameChomper,
  model: FrameModel,
  T: number,
  ts: number,
): void {
  const shared = model.mode === 'Shared';
  const cx = (c.x + 0.5) * T;
  const cy = (c.y + 0.5) * T;
  const R = T * (shared && c.isYou ? 0.78 : 0.68);
  const base = colorOf(st.players, c.colorIndex);
  const dashCol = st.power.dash;

  if (c.isYou && shared) {
    const k = (ts * 1.6) % 1;
    ctx.save();
    ctx.strokeStyle = base;
    ctx.globalAlpha = 0.7 * (1 - k);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R * (1.2 + k * 1.3), 0, 7);
    ctx.stroke();
    ctx.restore();
  }

  c.trail.forEach(([qx, qy], i) => {
    ctx.save();
    ctx.globalAlpha = 0.28 * (1 - i / c.trail.length) * c.alpha;
    ctx.translate((qx + 0.5) * T, (qy + 0.5) * T);
    orient(ctx, c.dir);
    ctx.fillStyle = dashCol;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, 0.3, Math.PI * 2 - 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.translate(cx, cy);
  if (c.dying !== null) {
    const m = 0.15 + Math.min(1, c.dying * 1.25) * (Math.PI - 0.15);
    ctx.rotate(-Math.PI / 2);
    if (m < Math.PI - 0.02) st.chomper(ctx, T, R, m, base, false);
    ctx.restore();
    return;
  }
  const p = c.power;
  const blink = p !== null && p.msLeft < 1500 && Math.floor(p.msLeft / 125) % 2 === 1;
  const col = p && !blink ? st.power[p.kind] : base;
  ctx.globalAlpha = c.alpha;
  if (p?.kind === 'phase') ctx.globalAlpha = c.alpha * (0.45 + 0.25 * Math.sin(ts * 30));
  orient(ctx, c.dir);
  const m = 0.06 + 0.6 * Math.abs(Math.sin(c.mouth));
  const sc = p?.kind === 'hunt' ? 1.12 + 0.04 * Math.sin(ts * 14) : 1;
  ctx.scale(sc, sc);
  st.chomper(ctx, T, R, m, col, true);
  if (c.frozenMs > 0) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#bfefff';
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.05, 0, 7);
    ctx.fill();
  }
  ctx.restore();

  if (p?.kind === 'magnet') {
    ctx.save();
    ctx.strokeStyle = st.power.magnet;
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(ts * 10);
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.8 * T, ts, ts + 7);
    ctx.stroke();
    ctx.restore();
  }

  if (shared) {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.max(12, T * 0.75)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.globalAlpha = c.isYou ? 1 : 0.75 * Math.max(c.alpha, 0.7);
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = st.textStroke;
    const label = c.isYou ? 'YOU' : c.name.toUpperCase();
    ctx.strokeText(label, cx, cy - R - 5);
    ctx.fillStyle = st.glow || !c.isYou ? base : st.ink;
    ctx.fillText(label, cx, cy - R - 5);
    ctx.restore();
  }
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  st: LookStyle,
  model: FrameModel,
  T: number,
  W: number,
  H: number,
): void {
  const b = model.banner;
  if (!b) return;
  const color = b.power
    ? st.power[b.power as PowerKind]
    : b.tone === 'good'
      ? st.go
      : b.tone === 'bad'
        ? '#d9503f'
        : b.tone === 'attack'
          ? '#d9503f'
          : st.gold;
  const k = b.ageMs / BANNER_MS;
  const y = model.countdown ? H / 2 + T * 2.6 : T * 2.2;
  bigText(
    ctx,
    st,
    b.text,
    W / 2,
    y,
    Math.max(20, T * 1.5) * easeOutBack(Math.min(1, b.ageMs / 200)),
    color,
    k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1,
  );
}

/** Paints one frame of the big maze. A no-op for a model without a board (the TV's minis). */
export function draw(ctx: CanvasRenderingContext2D, model: FrameModel, opts: DrawOpts): void {
  const st = styleOf(opts.look);
  const state = stateOf(ctx);
  const dt = state.lastT === null ? 0 : Math.min(0.1, Math.max(0, (opts.t - state.lastT) / 1000));
  state.lastT = opts.t;
  const fx = state.fx;
  const board = model.board;
  fx.ingest(model.effects, model, st);
  fx.update(dt);
  state.goT = model.go ? state.goT + dt : 0;
  if (!board) return;

  const T = opts.tile;
  const ts = opts.t / 1000;
  const W = board.w * T;
  const H = board.h * T;

  ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
  ctx.save();
  const [sx, sy] = fx.shakeOffset(T);
  ctx.translate(sx, sy);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, W, H);
  drawWalls(ctx, st, board.layout, opts, fx.flashing);

  st.pellets(ctx, board.pellets, T);
  const pulse = 0.78 + 0.22 * Math.sin(opts.t / 150);
  for (const s of board.powerSpots) {
    if (!s.up) continue;
    st.powerSpot(ctx, s.x, s.y, T, s.kind ? st.power[s.kind] : st.gold, pulse);
  }
  ctx.shadowBlur = 0;
  if (board.fruit) {
    const f = board.fruit;
    const fade = f.msLeft < 2000 && Math.floor(f.msLeft / 166) % 2 === 1 ? 0.3 : 1;
    ctx.globalAlpha = fade;
    fruitShape(
      ctx,
      f.kind,
      (f.x + 0.5) * T,
      (f.y + 0.5) * T + Math.sin(ts * 4) * T * 0.08,
      T / 7.5,
      st.glow,
    );
    ctx.globalAlpha = 1;
  }

  const meDying = board.chompers.some((c) => c.isYou && (c.dying ?? 0) > 0.23);
  if (!(model.mode === 'Solo' && meDying))
    for (const g of board.ghosts) drawGhost(ctx, st, g, T, ts);
  const order = [...board.chompers].sort((a, b) => Number(a.isYou) - Number(b.isYou));
  for (const c of order) drawChomper(ctx, st, c, model, T, ts);

  // rings, magnet fly-ins, sparks
  for (const q of fx.rings) {
    const k = q.t / q.life;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = q.color;
    ctx.lineWidth = 3 * (1 - k) + 0.5;
    if (st.glow) glow(ctx, q.color, 10);
    ctx.beginPath();
    ctx.arc((q.x + 0.5) * T, (q.y + 0.5) * T, T * (0.4 + k * 2.4), 0, 7);
    ctx.stroke();
    ctx.restore();
  }
  for (const q of fx.flies) {
    const to = board.chompers.find((c) => c.id === q.to);
    const k = q.t / q.life;
    const x = to ? q.x + (to.x - q.x) * k : q.x;
    const y = to ? q.y + (to.y - q.y) * k : q.y;
    ctx.fillStyle = st.power.magnet;
    if (st.glow) glow(ctx, st.power.magnet, 6);
    ctx.beginPath();
    ctx.arc((x + 0.5) * T, (y + 0.5) * T, T * 0.14, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  for (const q of fx.sparks) {
    const k = q.t / q.life;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.fillStyle = q.color;
    if (st.glow) glow(ctx, q.color, 6);
    ctx.beginPath();
    ctx.arc((q.x + 0.5) * T, (q.y + 0.5) * T, T * q.r * (1 - k * 0.5), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  st.overlay(ctx, W, H, T, ts);

  // springy score pops
  for (const f of fx.floats) {
    const k = f.t / f.life;
    const sc = easeOutBack(Math.min(1, f.t * 5)) * f.size;
    const y = (f.y + 0.2) * T - Math.min(1, k * 1.4) * T * 1.4;
    bigText(
      ctx,
      st,
      f.text,
      Math.min(W - 30, Math.max(30, (f.x + 0.5) * T)),
      y,
      Math.max(16, T * 1.05) * sc,
      f.color,
      k > 0.7 ? (1 - k) / 0.3 : 1,
    );
  }

  if (board.fog) {
    const a = Math.min(1, board.fog.msLeft / 500);
    const x = (board.fog.x + 0.5) * T;
    const y = (board.fog.y + 0.5) * T;
    const gr = ctx.createRadialGradient(x, y, T * 2.5, x, y, T * 5);
    gr.addColorStop(0, 'rgba(20,20,22,0)');
    gr.addColorStop(1, `rgba(20,20,22,${0.93 * a})`);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
  }
  if (board.frozenMs > 0) {
    ctx.fillStyle = `rgba(160,225,255,${0.18 * Math.min(1, board.frozenMs / 1000)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (model.countdown && model.phase === 'countdown') {
    const frac = 1 - (Math.max(0, model.countdown.msLeft) % 1000) / 1000;
    bigText(
      ctx,
      st,
      String(model.countdown.n),
      W / 2,
      H / 2 - T * 1.5,
      T * 5 * easeOutBack(Math.min(1, frac * 3)),
      st.countColor,
    );
  } else if (model.go && state.goT < 0.7) {
    const k = state.goT / 0.7;
    bigText(ctx, st, 'GO!', W / 2, H / 2 - T * 1.5, T * 5 * (1 + k * 0.4), st.go, 1 - k);
  }
  drawBanner(ctx, st, model, T, W, H);
  ctx.restore();
}

/** One player's maze in miniature (the Race TV). The canvas is `layout.w × layout.h` tiles. */
export function drawMini(
  ctx: CanvasRenderingContext2D,
  mini: MiniBoard,
  opts: Omit<DrawOpts, 't'> & { t?: number },
): void {
  const st = styleOf(opts.look);
  const T = opts.tile;
  const o: DrawOpts = { ...opts, t: opts.t ?? 0 };
  const m = mini.layout;
  ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.fillStyle = st.bg;
  ctx.fillRect(0, 0, m.w * T, m.h * T);
  drawWalls(ctx, st, m, o, false);
  const spots = new Set(m.powers.map(([x, y]) => `${x},${y}`));
  const dots: [number, number][] = [];
  const pulse = 0.78 + 0.22 * Math.sin((o.t ?? 0) / 150);
  for (const p of mini.pellets) {
    if (spots.has(`${p[0]},${p[1]}`)) st.powerSpot(ctx, p[0], p[1], T, st.gold, pulse);
    else dots.push(p);
  }
  st.pellets(ctx, dots, T);
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.translate((mini.x + 0.5) * T, (mini.y + 0.5) * T);
  orient(ctx, mini.dir);
  const mouth = 0.06 + 0.6 * Math.abs(Math.sin((o.t ?? 0) / 90));
  st.chomper(ctx, T, T * 0.9, mouth, colorOf(st.players, mini.colorIndex), false);
  ctx.restore();
  st.overlay(ctx, m.w * T, m.h * T, T, (o.t ?? 0) / 1000);
  if (mini.done) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = st.bg;
    ctx.fillRect(0, 0, m.w * T, m.h * T);
    ctx.globalAlpha = 1;
  }
}

export type { FrameBoard };
