import type { Dir } from '../sim/walker';

/** Room kept around the maze for its frame, in CSS pixels per side. */
export const FRAME_PAD = 14;

/**
 * The largest whole tile size at which a `cols × rows` maze fits in a `w × h` space with its
 * frame. Never smaller than 4, so a collapsed container still draws something.
 */
export function fitTile(w: number, h: number, cols: number, rows: number, pad = FRAME_PAD): number {
  if (cols <= 0 || rows <= 0) return 4;
  return Math.max(4, Math.floor(Math.min((w - 2 * pad) / cols, (h - 2 * pad) / rows)));
}

/** A swipe's direction once it has moved at least `min` pixels, or null. */
export function swipeDir(dx: number, dy: number, min = 22): Dir | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** The direction a key press means (arrows and WASD), or null. */
export function keyDir(key: string): Dir | null {
  switch (key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      return 'up';
    case 'ArrowDown':
    case 's':
    case 'S':
      return 'down';
    case 'ArrowLeft':
    case 'a':
    case 'A':
      return 'left';
    case 'ArrowRight':
    case 'd':
    case 'D':
      return 'right';
    default:
      return null;
  }
}

/**
 * How to lay `n` mazes of `lw × lh` tiles in a `w × h` space, each with `label` pixels of name
 * above it and `gap` pixels between: the column count and tile size that make the tiles largest.
 */
export function miniGrid(
  n: number,
  w: number,
  h: number,
  lw: number,
  lh: number,
  label = 30,
  gap = 10,
): { cols: number; tile: number } {
  let best = { cols: 1, tile: 2 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows - label;
    const tile = Math.floor(Math.min(cw / lw, ch / lh));
    if (tile > best.tile) best = { cols, tile };
  }
  return best;
}
