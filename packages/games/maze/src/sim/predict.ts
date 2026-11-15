import { DIRS, DIR_ORDER, opposite, wrapX } from './layouts';
import type { MazeLayout } from './layouts';
import { advance, canEnter, posOf } from './walker';
import type { Dir, Walker } from './walker';

/** A reported position as a walker: on a tile, or part way along its heading. */
export function walkerAt(m: MazeLayout, pos: [number, number, Dir | null]): Walker {
  const [x, y, d] = pos;
  const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  if (!d || (near(x) && near(y))) {
    return { tile: [wrapX(m, Math.round(x)), Math.round(y)], dir: d, next: null, prog: 0 };
  }
  const [dx, dy] = DIRS[d];
  const tile: [number, number] =
    dx > 0 || dy > 0
      ? [wrapX(m, Math.floor(x + 1e-9)), Math.floor(y + 1e-9)]
      : [wrapX(m, Math.ceil(x - 1e-9)), Math.ceil(y - 1e-9)];
  const prog = dx ? Math.abs(x - tile[0]) : Math.abs(y - tile[1]);
  return { tile, dir: d, next: null, prog: Math.min(Math.max(prog, 0), 0.999) };
}

/** Where a prediction got to: its heading, and whether it is holding (a wall, a fork). */
export interface Predicted {
  x: number;
  y: number;
  dir: Dir | null;
  held: boolean;
}

/** x brought into [-0.5, w - 0.5). */
export const normX = (m: MazeLayout, x: number): number => {
  const w = m.w;
  return ((((x + 0.5) % w) + w) % w) - 0.5;
};

/**
 * Where a chomper that was at `pos` probably is `dist` tiles later. It keeps its heading through
 * corridors; at a tile where straight on is blocked it takes the only other way that isn't back
 * (a corner), and where there are two or more (a fork) it holds at the center: a left or right
 * guess would be wrong half the time. It also holds at walls, as a chomper does.
 */
export function predictAlong(
  m: MazeLayout,
  pos: [number, number, Dir | null],
  dist: number,
): Predicted {
  const [x0, y0, d0] = pos;
  if (!d0 || dist <= 0) return { x: normX(m, x0), y: y0, dir: d0, held: !d0 };
  const w = walkerAt(m, [normX(m, x0), y0, d0]);
  let held = false;
  for (let left = dist; left > 1e-9;) {
    // At a tile center: straight on if it's open (at a fork too: the likeliest single way).
    if (w.prog === 0 && w.dir && !canEnter(m, w.tile, w.dir, false)) {
      const back = opposite(w.dir);
      const ways = DIR_ORDER.filter((d) => d !== back && canEnter(m, w.tile, d, false));
      if (ways.length !== 1) {
        held = true;
        break;
      }
      w.dir = ways[0]!;
    }
    const step = Math.min(left, 1 - w.prog);
    advance(w, step, m, { ghost: false });
    left -= step;
  }
  const [x, y] = posOf(w);
  return { x: normX(m, x), y, dir: w.dir, held };
}

/**
 * Where a chomper that was at `pos` is `dist` tiles later if it made no turn: straight on along
 * its heading, stopping at a wall (a chomper only changes way with a turn, and turns are
 * reported).
 */
export function straightOn(
  m: MazeLayout,
  pos: [number, number, Dir | null],
  dist: number,
): [number, number, Dir | null] {
  const w = walkerAt(m, pos);
  for (let left = dist; left > 1e-9; left -= 1)
    if (!advance(w, Math.min(1, left), m, { ghost: false })) break;
  const [x, y] = posOf(w);
  return [x, y, w.dir];
}
