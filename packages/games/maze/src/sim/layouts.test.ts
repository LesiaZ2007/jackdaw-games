import { describe, expect, it } from 'vitest';
import {
  DIRS,
  MAZE_LAYOUTS,
  SIZE_DIMS,
  houseTiles,
  isDoor,
  isWall,
  layoutsOf,
  wrapX,
} from './layouts';
import type { MazeLayout, MazeSize } from './layouts';

const at = (m: MazeLayout, x: number, y: number) => m.rows[y]![wrapX(m, x)]!;
const open = (m: MazeLayout, x: number, y: number) => !isWall(m, x, y);

function reach(m: MazeLayout, from: readonly [number, number], ghost: boolean): Set<string> {
  const seen = new Set([`${from[0]},${from[1]}`]);
  const q: [number, number][] = [[from[0], from[1]]];
  while (q.length) {
    const [x, y] = q.shift()!;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = wrapX(m, x + dx),
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

const SIZES: MazeSize[] = ['Small', 'Medium', 'Large'];

describe('maze layouts', () => {
  it('has distinct layouts: at least six Medium and four each of Small and Large', () => {
    expect(layoutsOf('Medium').length).toBeGreaterThanOrEqual(6);
    expect(layoutsOf('Small').length).toBeGreaterThanOrEqual(4);
    expect(layoutsOf('Large').length).toBeGreaterThanOrEqual(4);
    expect(SIZES.flatMap(layoutsOf)).toHaveLength(MAZE_LAYOUTS.length);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.id)).size).toBe(MAZE_LAYOUTS.length);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.rows.join('\n'))).size).toBe(MAZE_LAYOUTS.length);
  });

  it('gives each size its dimensions', () => {
    expect(SIZE_DIMS).toEqual({
      Small: { w: 21, h: 20 },
      Medium: { w: 27, h: 24 },
      Large: { w: 33, h: 30 },
    });
  });

  for (const m of MAZE_LAYOUTS) {
    describe(`${m.id} (${m.size})`, () => {
      it('has its size and only uses the known characters', () => {
        expect({ w: m.w, h: m.h }).toEqual(SIZE_DIMS[m.size]);
        expect(m.rows).toHaveLength(m.h);
        for (const r of m.rows) {
          expect(r).toHaveLength(m.w);
          expect(r).toMatch(/^[#.o\- ]+$/);
        }
      });

      it('is left/right symmetric', () => {
        for (const r of m.rows) expect(r).toBe([...r].reverse().join(''));
      });

      it('reaches every pellet and power spot from the first start', () => {
        const seen = reach(m, [m.starts[0]![0], m.starts[0]![1]], false);
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++)
            if (at(m, x, y) === '.' || at(m, x, y) === 'o')
              expect(seen.has(`${x},${y}`)).toBe(true);
      });

      it('has no dead ends, no 2×2 open areas and no stray open tiles', () => {
        const seen = reach(m, [m.starts[0]![0], m.starts[0]![1]], false);
        const house = houseTiles(m);
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++) {
            if (!open(m, x, y)) continue;
            const k = `${x},${y}`;
            expect(seen.has(k) || house.has(k), k).toBe(true);
            if (seen.has(k)) {
              const ways = Object.values(DIRS).filter(
                ([dx, dy]) => open(m, x + dx, y + dy) && !isDoor(m, x + dx, y + dy),
              ).length;
              expect(ways, `dead end at ${k}`).toBeGreaterThanOrEqual(2);
            }
            if (x + 1 < m.w && y + 1 < m.h)
              expect(
                open(m, x + 1, y) && open(m, x, y + 1) && open(m, x + 1, y + 1),
                `2×2 at ${k}`,
              ).toBe(false);
          }
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
        expect(hx).toBe((m.w - 1) / 2);
        expect(at(m, hx, hy)).toBe(' ');
        expect(at(m, hx, hy - 1)).toBe('-');
        // Room for four ghosts side by side.
        for (let dx = -2; dx <= 2; dx++) expect(at(m, hx + dx, hy)).toBe(' ');
        const house = houseTiles(m);
        expect(house.size).toBeLessThan(30);
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
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++) if (at(m, x, y) === 'o') spots.push(`${x},${y}`);
        expect(m.powers).toHaveLength(4);
        expect(m.powers.map(([x, y]) => `${x},${y}`).sort()).toEqual(spots.sort());
      });
    });
  }

  it('keeps the indexes saved games already use', () => {
    expect(MAZE_LAYOUTS.slice(0, 8).map((m) => m.id)).toEqual([
      'grove',
      'lattice',
      'twist',
      'hive',
      'sprout',
      'steps',
      'orchard',
      'terrace',
    ]);
  });

  it('keeps the signed-off maze first', () => {
    const m = MAZE_LAYOUTS[0]!;
    expect(m.size).toBe('Medium');
    expect(m.rows[1]).toBe('#......#.....#.....#......#');
    expect(m.rows[12]).toBe('     .##.#       #.##.     ');
    expect(m.house).toEqual([13, 12]);
    expect(m.exit).toEqual([13, 7]);
    expect(m.fruit).toEqual([13, 14]);
  });

  it('wraps x by the maze width', () => {
    for (const s of SIZES) {
      const m = layoutsOf(s)[0]!;
      expect(wrapX(m, -1)).toBe(m.w - 1);
      expect(wrapX(m, m.w)).toBe(0);
    }
  });
});
