import { describe, expect, it } from 'vitest';
import { generateLayout, layoutAt, mazeName } from './generate';
import { MAZE_LAYOUTS, SIZE_DIMS } from './layouts';
import type { MazeSize } from './layouts';
import { layoutProblems } from './validate';

const SIZES: MazeSize[] = ['Small', 'Medium', 'Large'];
const SEEDS = 300;

describe('layoutProblems', () => {
  it('passes every handmade maze', () => {
    for (const m of MAZE_LAYOUTS) expect(layoutProblems(m), m.id).toEqual([]);
  });

  it('catches a dead end and a broken mirror', () => {
    const m = MAZE_LAYOUTS[0]!;
    const rows = [...m.rows];
    rows[1] = '#.#####################.###'.slice(0, 27);
    expect(layoutProblems({ ...m, rows }).length).toBeGreaterThan(0);
  });
});

describe('generateLayout', () => {
  for (const size of SIZES) {
    it(`makes ${SEEDS} valid ${size} mazes`, () => {
      const handmade = new Set(MAZE_LAYOUTS.map((m) => m.rows.join('\n')));
      for (let seed = 0; seed < SEEDS; seed++) {
        const m = generateLayout(seed * 7919 + 13, size);
        expect(m.size).toBe(size);
        expect({ w: m.w, h: m.h }).toEqual(SIZE_DIMS[size]);
        expect(layoutProblems(m), `${size} seed ${seed}`).toEqual([]);
        // Never the fallback to a handmade maze.
        expect(handmade.has(m.rows.join('\n'))).toBe(false);
      }
    }, 60_000);
  }

  it('gives the same rows for the same seed and different rows for different seeds', () => {
    for (const size of SIZES) {
      expect(generateLayout(4821, size)).toEqual(generateLayout(4821, size));
      const all = new Set<string>();
      for (let seed = 0; seed < 50; seed++) all.add(generateLayout(seed, size).rows.join('\n'));
      expect(all.size).toBe(50);
    }
  });

  it('makes loops and varied walls, not a uniform grid', () => {
    for (const size of SIZES)
      for (let seed = 0; seed < 20; seed++) {
        const m = generateLayout(seed, size);
        // Wall blocks come in several different shapes and sizes.
        const blocks = new Set<number>();
        const seen = new Set<string>();
        for (let y = 1; y < m.h - 1; y++)
          for (let x = 1; x < m.w - 1; x++) {
            if (m.rows[y]![x] !== '#' || seen.has(`${x},${y}`)) continue;
            let n = 0;
            const q = [[x, y]];
            seen.add(`${x},${y}`);
            while (q.length) {
              const [cx, cy] = q.pop()!;
              n++;
              for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ]) {
                const nx = cx! + dx!;
                const ny = cy! + dy!;
                if (nx < 1 || ny < 1 || nx >= m.w - 1 || ny >= m.h - 1) continue;
                if (m.rows[ny]![nx] !== '#' || seen.has(`${nx},${ny}`)) continue;
                seen.add(`${nx},${ny}`);
                q.push([nx, ny]);
              }
            }
            blocks.add(n);
          }
        expect(blocks.size, `${size} ${seed}`).toBeGreaterThanOrEqual(4);
      }
  });

  it('is quick enough for every phone, bot and server to call', () => {
    for (const size of SIZES) {
      generateLayout(1, size);
      let worst = 0;
      for (let seed = 0; seed < 60; seed++) {
        // The best of three runs, so a busy test machine doesn't count against the generator.
        let best = Infinity;
        for (let k = 0; k < 3; k++) {
          const t = performance.now();
          generateLayout(seed * 31 + 5, size);
          best = Math.min(best, performance.now() - t);
        }
        worst = Math.max(worst, best);
      }
      expect(worst, size).toBeLessThan(20);
    }
  }, 60_000);

  it('names a generated maze from its seed', () => {
    const m = generateLayout(4821, 'Medium');
    expect(m.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ 4821$/);
    expect(mazeName(m)).toBe(m.name);
    expect(generateLayout(4821, 'Small').name).toBe(m.name);
    expect(mazeName(MAZE_LAYOUTS[0]!)).toBe('Grove');
  });
});

describe('layoutAt', () => {
  it('resolves handmade indexes and generated seeds, and caches by id', () => {
    const s = { layouts: [2, { gen: 77, size: 'Large' as const }] };
    expect(layoutAt(s, 0)).toBe(MAZE_LAYOUTS[2]);
    const g = layoutAt(s, 1);
    expect(g).toEqual(generateLayout(77, 'Large'));
    expect(layoutAt(s, 1)).toBe(g);
    expect(layoutAt({ layouts: [{ gen: 77, size: 'Large' }] }, 0)).toBe(g);
    // Out of range falls back to the first maze.
    expect(layoutAt(s, 9)).toBe(MAZE_LAYOUTS[2]);
    expect(layoutAt({ layouts: [] }, 0)).toBe(MAZE_LAYOUTS[0]);
  });

  it('keeps its cache bounded', () => {
    const first = layoutAt({ layouts: [{ gen: 1, size: 'Small' }] }, 0);
    for (let i = 2; i < 200; i++) layoutAt({ layouts: [{ gen: i, size: 'Small' }] }, 0);
    expect(layoutAt({ layouts: [{ gen: 1, size: 'Small' }] }, 0)).not.toBe(first);
  });
});
