import { DIRS, SIZE_DIMS, houseTiles, isDoor, isWall, wrapX } from './layouts';
import type { MazeLayout } from './layouts';

const DELTAS = Object.values(DIRS);

/** Tiles reachable from `from`; chompers stop at the ghost door, ghosts walk through it. */
function reach(m: MazeLayout, from: readonly [number, number], ghost: boolean): Set<string> {
  const seen = new Set([`${from[0]},${from[1]}`]);
  const q: [number, number][] = [[from[0], from[1]]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]!;
    for (const [dx, dy] of DELTAS) {
      const nx = wrapX(m, x + dx);
      const ny = y + dy;
      if (isWall(m, nx, ny) || (!ghost && isDoor(m, nx, ny))) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

/**
 * Everything wrong with a maze, as short messages (empty when it is playable): its size and
 * characters, left/right symmetry, every pellet reachable, no dead ends, no 2×2 open areas, no
 * stray tiles, the house, door, exit and fruit in place, four power spots and eight starts.
 */
export function layoutProblems(m: MazeLayout): string[] {
  const out: string[] = [];
  const dims = SIZE_DIMS[m.size];
  if (m.w !== dims.w || m.h !== dims.h || m.rows.length !== m.h) return ['wrong size'];
  for (const r of m.rows) {
    if (r.length !== m.w || !/^[#.o\- ]+$/.test(r)) return ['bad row'];
    if (r !== [...r].reverse().join('')) out.push('not symmetric');
  }
  const at = (x: number, y: number) => m.rows[y]![wrapX(m, x)]!;
  const open = (x: number, y: number) => !isWall(m, x, y);
  const first = m.starts[0];
  if (!first) return ['no starts'];
  const seen = reach(m, [first[0], first[1]], false);
  const [hx, hy] = m.house;
  if (hx !== (m.w - 1) / 2 || at(hx, hy) !== ' ' || at(hx, hy - 1) !== '-') {
    out.push('house or door misplaced');
    return out;
  }
  for (let dx = -2; dx <= 2; dx++) if (at(hx + dx, hy) !== ' ') out.push('house too narrow');
  const house = houseTiles(m);
  if (house.size >= 30) out.push('house too big');
  if (seen.has(`${hx},${hy}`)) out.push('chompers can get into the house');
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!open(x, y)) continue;
      const k = `${x},${y}`;
      const c = at(x, y);
      if ((c === '.' || c === 'o') && !seen.has(k)) out.push(`unreachable pellet at ${k}`);
      if (!seen.has(k) && !house.has(k)) out.push(`stray tile at ${k}`);
      if (seen.has(k)) {
        let ways = 0;
        for (const [dx, dy] of DELTAS)
          if (open(x + dx, y + dy) && !isDoor(m, x + dx, y + dy)) ways++;
        if (ways < 2) out.push(`dead end at ${k}`);
      }
      if (x + 1 < m.w && y + 1 < m.h && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1))
        out.push(`2×2 at ${k}`);
    }
  const ghostReach = reach(m, m.house, true);
  for (const [x, y] of [m.exit, m.fruit]) {
    const k = `${x},${y}`;
    if (isWall(m, x, y) || house.has(k) || !ghostReach.has(k)) out.push(`exit/fruit at ${k}`);
  }
  if (m.starts.length !== 8) out.push('needs 8 starts');
  if (new Set(m.starts.map(([x, y]) => `${x},${y}`)).size !== m.starts.length)
    out.push('starts repeat');
  for (const [x, y, d] of m.starts)
    if (!/[.o]/.test(at(x, y)) || !seen.has(`${x},${y}`) || !(d in DIRS))
      out.push(`bad start at ${x},${y}`);
  const spots: string[] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) if (at(x, y) === 'o') spots.push(`${x},${y}`);
  const listed = m.powers.map(([x, y]) => `${x},${y}`).sort();
  if (m.powers.length !== 4 || listed.join(' ') !== spots.sort().join(' '))
    out.push('power spots do not match');
  return out;
}
