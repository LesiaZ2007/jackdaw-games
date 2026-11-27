import type { GhostView } from '../sim/ghosts';
import { DIRS, DIR_ORDER, opposite, wrapX } from '../sim/layouts';
import type { MazeLayout } from '../sim/layouts';
import { canEnter } from '../sim/walker';
import type { Dir, Vec } from '../sim/walker';

/** Steps from the nearest target tile over open corridor (multi-source BFS); -1 unreachable. */
function distances(m: MazeLayout, targets: readonly Vec[]): Int16Array {
  const dist = new Int16Array(m.w * m.h).fill(-1);
  const q: number[] = [];
  for (const [x, y] of targets) {
    if (y < 0 || y >= m.h) continue;
    const k = y * m.w + wrapX(m, x);
    if (dist[k]! < 0) {
      dist[k] = 0;
      q.push(k);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    const x = k % m.w;
    const y = (k - x) / m.w;
    for (const d of DIR_ORDER) {
      if (!canEnter(m, [x, y], d, false)) continue;
      const nk = (y + DIRS[d][1]) * m.w + wrapX(m, x + DIRS[d][0]);
      if (dist[nk]! < 0) {
        dist[nk] = dist[k]! + 1;
        q.push(nk);
      }
    }
  }
  return dist;
}

export interface SteerInput {
  m: MazeLayout;
  tile: [number, number];
  dir: Dir | null;
  /** Pellets and power spots still on the board, as tiles. */
  pellets: readonly Vec[];
  ghosts: readonly GhostView[];
  /** Other chompers this bot can eat right now (it is hunting and they aren't). */
  prey: readonly Vec[];
  /** Hunters that can eat this bot right now. */
  hunters: readonly Vec[];
}

/**
 * A live bot's choice at a tile center (ChomperSim's `steer`): chase prey while hunting, else
 * the nearest pellet, never into a tile next to a dangerous ghost or hunter, and no reversing
 * unless it's the only way.
 */
export function liveSteer(s: SteerInput): Dir | null {
  const { m, tile, dir } = s;
  const danger = [
    ...s.ghosts
      .filter((g) => g.mode === 'chase' || g.mode === 'scatter')
      .map((g) => [Math.round(g.pos[0]), Math.round(g.pos[1])] as Vec),
    ...s.hunters.map(([x, y]) => [Math.round(x), Math.round(y)] as Vec),
  ];
  const risky = danger.length ? distances(m, danger) : null;
  const goal = distances(
    m,
    s.prey.length ? s.prey.map(([x, y]) => [Math.round(x), Math.round(y)]) : s.pellets,
  );
  let best: Dir | null = null;
  let bestScore = Infinity;
  for (const d of DIR_ORDER) {
    if (!canEnter(m, tile, d, false)) continue;
    const nx = wrapX(m, tile[0] + DIRS[d][0]);
    const ny = tile[1] + DIRS[d][1];
    const k = ny * m.w + nx;
    const g = goal[k]!;
    let score = g < 0 ? 500 : g;
    if (risky && risky[k]! >= 0 && risky[k]! <= 2) score += 1000;
    if (dir && d === opposite(dir)) score += 30;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}
