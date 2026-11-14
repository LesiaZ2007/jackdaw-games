import { describe, expect, it } from 'vitest';
import { DIRS, MAZE_H, MAZE_LAYOUTS, MAZE_W, houseTiles, isDoor, isWall, wrapX } from './layouts';
import type { MazeLayout } from './layouts';

const at = (m: MazeLayout, x: number, y: number) => m.rows[y]![wrapX(x)]!;

function reach(m: MazeLayout, from: readonly [number, number], ghost: boolean): Set<string> {
  const seen = new Set([`${from[0]},${from[1]}`]);
  const q: [number, number][] = [[from[0], from[1]]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = wrapX(x + dx),
        ny = y + dy;
      if (isWall(m, nx, ny) || (!ghost && isDoor(m, nx, ny))) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

describe('maze layouts', () => {
  it('has at least four distinct layouts', () => {
    expect(MAZE_LAYOUTS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.id)).size).toBe(MAZE_LAYOUTS.length);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.rows.join('\n'))).size).toBe(MAZE_LAYOUTS.length);
  });

  for (const m of MAZE_LAYOUTS) {
    describe(m.id, () => {
      it('is 27×24 and only uses the known characters', () => {
        expect(MAZE_W).toBe(27);
        expect(MAZE_H).toBe(24);
        expect(m.rows).toHaveLength(MAZE_H);
        for (const r of m.rows) {
          expect(r).toHaveLength(MAZE_W);
          expect(r).toMatch(/^[#.o\- ]+$/);
        }
      });

      it('is left/right symmetric', () => {
        for (const r of m.rows) expect(r).toBe([...r].reverse().join(''));
      });

      it('reaches every pellet and power spot from the first start', () => {
        const seen = reach(m, [m.starts[0]![0], m.starts[0]![1]], false);
        for (let y = 0; y < MAZE_H; y++)
          for (let x = 0; x < MAZE_W; x++)
            if (at(m, x, y) === '.' || at(m, x, y) === 'o')
              expect(seen.has(`${x},${y}`)).toBe(true);
      });

      it('has 8 distinct open starts reachable without the door', () => {
        expect(m.starts).toHaveLength(8);
        expect(new Set(m.starts.map(([x, y]) => `${x},${y}`)).size).toBe(8);
        const seen = reach(m, [m.starts[0]![0], m.starts[0]![1]], false);
        for (const [x, y, d] of m.starts) {
          expect(at(m, x, y)).toMatch(/[.o]/);
          expect(seen.has(`${x},${y}`)).toBe(true);
          expect(Object.keys(DIRS)).toContain(d);
        }
      });

      it('puts the house, door, exit and fruit where the layout says', () => {
        const [hx, hy] = m.house;
        expect(at(m, hx, hy)).toBe(' ');
        expect(at(m, hx, hy - 1)).toBe('-');
        // Room for four ghosts side by side.
        for (let dx = -2; dx <= 2; dx++) expect(at(m, hx + dx, hy)).toBe(' ');
        const house = houseTiles(m);
        expect(house.has(`${hx},${hy}`)).toBe(true);
        expect(house.has(`${hx},${hy - 1}`)).toBe(true);
        // The exit and the fruit are open, outside the house, and the ghosts can get there.
        const ghostReach = reach(m, m.house, true);
        for (const [x, y] of [m.exit, m.fruit]) {
          expect(isWall(m, x, y)).toBe(false);
          expect(house.has(`${x},${y}`)).toBe(false);
          expect(ghostReach.has(`${x},${y}`)).toBe(true);
        }
        // Chompers can't get into the house.
        const chomperReach = reach(m, [m.starts[0]![0], m.starts[0]![1]], false);
        expect(chomperReach.has(`${hx},${hy}`)).toBe(false);
      });

      it('lists exactly its four power spots', () => {
        const spots: string[] = [];
        for (let y = 0; y < MAZE_H; y++)
          for (let x = 0; x < MAZE_W; x++) if (at(m, x, y) === 'o') spots.push(`${x},${y}`);
        expect(m.powers).toHaveLength(4);
        expect(m.powers.map(([x, y]) => `${x},${y}`).sort()).toEqual(spots.sort());
      });
    });
  }

  it('keeps the signed-off maze first', () => {
    const m = MAZE_LAYOUTS[0]!;
    expect(m.rows[1]).toBe('#......#.....#.....#......#');
    expect(m.rows[12]).toBe('     .##.#       #.##.     ');
    expect(m.house).toEqual([13, 12]);
    expect(m.exit).toEqual([13, 7]);
    expect(m.fruit).toEqual([13, 14]);
  });
});
