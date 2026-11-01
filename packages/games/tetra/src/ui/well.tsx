'use client';

import { useEffect, useRef } from 'react';
import { cellsOf, H, HIDDEN, KINDS, W, type Kind, type Piece } from '../sim';

/**
 * Drawing wells. Colours come from the game's stylesheet (`--ttr-*` on the `.ttr` root, per
 * look), read once per paint from the canvas itself, so day and dark follow the shell. Stones
 * are flat heraldic fills with a printed edge; rubble is grey ashlar with a mortar line. The two
 * rows over the wall are drawn as open sky, darker than the well.
 */

export interface Ink {
  cell: Record<Kind | 'G', string>;
  well: string;
  sky: string;
  grid: string;
  edge: string;
  ghost: string;
  dim: string;
}

export function readInk(el: Element): Ink {
  const css = getComputedStyle(el);
  const v = (name: string) => css.getPropertyValue(name).trim() || 'gray';
  const cell = Object.fromEntries([...KINDS, 'G'].map((k) => [k, v(`--ttr-${k}`)])) as Ink['cell'];
  return {
    cell,
    well: v('--ttr-well'),
    sky: v('--ttr-sky'),
    grid: v('--ttr-grid'),
    edge: v('--ttr-edge'),
    ghost: v('--ttr-ghost'),
    dim: v('--ttr-dim'),
  };
}

/** Fits a canvas to its box at the device's pixel ratio; returns the cell size in device px. */
export function fitCanvas(c: HTMLCanvasElement): number {
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr));
  const h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return Math.min(w / W, h / H);
}

function block(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  fill: string,
  ink: Ink,
  rubble = false,
) {
  g.fillStyle = fill;
  g.fillRect(x, y, s, s);
  const lw = Math.max(1, s * 0.08);
  g.strokeStyle = ink.edge;
  g.lineWidth = lw;
  g.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
  if (rubble) {
    g.beginPath();
    g.moveTo(x + s * 0.5, y + lw);
    g.lineTo(x + s * 0.5, y + s * 0.5);
    g.stroke();
  } else {
    // A printed highlight along the top edge: a second, thinner rule.
    g.globalAlpha = 0.35;
    g.strokeRect(x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56);
    g.globalAlpha = 1;
  }
}

export interface PaintOpts {
  piece?: Piece | null;
  ghost?: Piece | null;
  /** Grey everything (topped out or finished). */
  dim?: boolean;
  /** Draw the grid lines (the player's own well). */
  grid?: boolean;
}

/** Paints a whole well into a canvas already sized by `fitCanvas`. */
export function paintWell(
  c: HTMLCanvasElement,
  well: string,
  ink: Ink,
  s: number,
  o: PaintOpts = {},
) {
  const g = c.getContext('2d');
  if (!g) return;
  const ox = Math.floor((c.width - s * W) / 2);
  const oy = Math.floor((c.height - s * H) / 2);
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = ink.sky;
  g.fillRect(ox, oy, s * W, s * HIDDEN);
  g.fillStyle = ink.well;
  g.fillRect(ox, oy + s * HIDDEN, s * W, s * (H - HIDDEN));
  if (o.grid) {
    g.strokeStyle = ink.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < W; x++) {
      g.moveTo(ox + x * s + 0.5, oy + s * HIDDEN);
      g.lineTo(ox + x * s + 0.5, oy + s * H);
    }
    for (let y = HIDDEN + 1; y < H; y++) {
      g.moveTo(ox, oy + y * s + 0.5);
      g.lineTo(ox + s * W, oy + y * s + 0.5);
    }
    g.stroke();
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = well[y * W + x];
      if (!ch || ch === '.') continue;
      const fill = o.dim ? ink.dim : ink.cell[ch as Kind | 'G'];
      block(g, ox + x * s, oy + y * s, s, fill, ink, ch === 'G');
    }
  }
  if (o.ghost && o.piece && o.ghost.y !== o.piece.y) {
    g.strokeStyle = ink.ghost;
    g.lineWidth = Math.max(1.5, s * 0.1);
    for (const [cx, cy] of cellsOf(o.ghost.kind, o.ghost.rot)) {
      const x = ox + (o.ghost.x + cx) * s;
      const y = oy + (o.ghost.y + cy) * s;
      g.strokeRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76);
    }
  }
  if (o.piece) {
    for (const [cx, cy] of cellsOf(o.piece.kind, o.piece.rot)) {
      block(
        g,
        ox + (o.piece.x + cx) * s,
        oy + (o.piece.y + cy) * s,
        s,
        ink.cell[o.piece.kind],
        ink,
      );
    }
  }
}

/** A well that repaints when its cells change: other players' wells, and the TV's. */
export function Well({
  well,
  dim,
  label,
  className,
}: {
  well: string;
  dim?: boolean;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => paintWell(c, well, readInk(c), fitCanvas(c), { dim: Boolean(dim) });
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c);
    return () => ro.disconnect();
  }, [well, dim]);
  return <canvas ref={ref} className={className ?? 'ttr-well'} role="img" aria-label={label} />;
}

/** One stone, drawn small (hold and next). */
export function Stone({ kind, faded }: { kind: Kind | null; faded?: boolean }) {
  if (!kind) return <span className="ttr-stone ttr-stone--empty" aria-hidden="true" />;
  const cells = cellsOf(kind, 0);
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 1;
  const h = Math.max(...ys) - minY + 1;
  return (
    <svg
      className={`ttr-stone${faded ? ' ttr-stone--faded' : ''}`}
      viewBox={`-0.5 -0.5 ${4 + 1} ${2 + 1}`}
      aria-label={`${kind} stone`}
      role="img"
    >
      <g transform={`translate(${(4 - w) / 2 - minX} ${(2 - h) / 2 - minY})`}>
        {cells.map(([x, y]) => (
          <rect
            key={`${x}-${y}`}
            x={x + 0.04}
            y={y + 0.04}
            width={0.92}
            height={0.92}
            style={{ fill: `var(--ttr-${kind})` }}
            className="ttr-stone__cell"
          />
        ))}
      </g>
    </svg>
  );
}
