import { DIRS, isDoor, isWall, opposite, wrapX } from './layouts';
import type { MazeLayout } from './layouts';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Vec = readonly [number, number];

/**
 * Anything that walks the maze. It sits `prog` (0 to <1) of the way from `tile` toward the next
 * tile in `dir`; `next` is a queued turn, taken at the first tile center where it's open.
 */
export interface Walker {
  tile: [number, number];
  dir: Dir | null;
  next: Dir | null;
  prog: number;
}

export interface AdvanceOpts {
  /** Ghosts may use the house door; chompers may not. */
  ghost: boolean;
  /** Called at each tile center before the walker picks its way on. */
  decide?(w: Walker): void;
  /** Called each time the walker reaches a new tile center. */
  arrive?(w: Walker): void;
}

/** Whether a walker on `tile` can step one tile in `d`. */
export function canEnter(m: MazeLayout, tile: Vec, d: Dir, ghost: boolean): boolean {
  const nx = tile[0] + DIRS[d][0];
  const ny = tile[1] + DIRS[d][1];
  if (isWall(m, nx, ny)) return false;
  if (isDoor(m, nx, ny)) return ghost;
  return true;
}

/** Where a walker is, in tile units (x may be just past the edge in a tunnel). */
export function posOf(w: Walker): [number, number] {
  if (!w.dir || w.prog === 0) return [w.tile[0], w.tile[1]];
  const [dx, dy] = DIRS[w.dir];
  return [w.tile[0] + dx * w.prog, w.tile[1] + dy * w.prog];
}

/**
 * Moves a walker `dist` tiles. A queued reverse happens at once, even mid-tile; other turns wait
 * for a tile center where they're open. Returns false if the walker is stuck against a wall.
 */
export function advance(w: Walker, dist: number, m: MazeLayout, o: AdvanceOpts): boolean {
  if (w.next && w.dir && w.next === opposite(w.dir) && w.prog > 0) {
    const [dx, dy] = DIRS[w.dir];
    w.tile = [wrapX(w.tile[0] + dx), w.tile[1] + dy];
    w.prog = 1 - w.prog;
    w.dir = w.next;
    w.next = null;
  }
  let guard = 0;
  while (dist > 1e-6 && guard++ < 8) {
    if (w.prog === 0) {
      o.decide?.(w);
      if (w.next && canEnter(m, w.tile, w.next, o.ghost)) {
        w.dir = w.next;
        w.next = null;
      }
      if (!w.dir || !canEnter(m, w.tile, w.dir, o.ghost)) return false;
    }
    const dir = w.dir!;
    const step = Math.min(dist, 1 - w.prog);
    w.prog += step;
    dist -= step;
    if (w.prog >= 1 - 1e-9) {
      const [dx, dy] = DIRS[dir];
      w.tile = [wrapX(w.tile[0] + dx), w.tile[1] + dy];
      w.prog = 0;
      o.arrive?.(w);
    }
  }
  return true;
}
