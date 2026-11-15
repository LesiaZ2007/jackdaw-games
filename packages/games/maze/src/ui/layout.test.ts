import { describe, expect, it } from 'vitest';
import { FRAME_PAD, fitTile, keyDir, mazeBox, miniGrid, swipeDir } from './layout';

describe('maze screen helpers', () => {
  it('fits the maze inside its space, frame included, and never below 4', () => {
    const t = fitTile(360, 400, 27, 24);
    const p = 2 * FRAME_PAD;
    expect(t * 27 + p).toBeLessThanOrEqual(360);
    expect(t * 24 + p).toBeLessThanOrEqual(400);
    expect(t).toBe(Math.floor(Math.min((360 - p) / 27, (400 - p) / 24)));
    expect(fitTile(10, 10, 27, 24)).toBe(4);
  });

  // Stage = screen minus the top bar and the score cards (about 150 px on a phone).
  const SIZES: [number, number][] = [
    [21, 20],
    [27, 24],
    [33, 30],
  ];
  const STAGES: [number, number][] = [
    [344, 640 - 150 - 60],
    [374, 844 - 150 - 60],
    [1280 - 40, 800 - 150 - 40],
  ];
  it.each(STAGES)('centers and fills every size in a %i x %i stage', (w, h) => {
    for (const [cols, rows] of SIZES) {
      const b = mazeBox(w, h, cols, rows);
      const p = FRAME_PAD;
      // The framed maze stays inside the stage, so it never reaches the cards.
      expect(b.left - p).toBeGreaterThanOrEqual(-1);
      expect(b.top - p).toBeGreaterThanOrEqual(-1);
      expect(b.left + b.width + p).toBeLessThanOrEqual(w + 1);
      expect(b.top + b.height + p).toBeLessThanOrEqual(h + 1);
      // Centered both ways.
      expect(Math.abs(b.left - (w - b.width - b.left))).toBeLessThanOrEqual(1);
      expect(Math.abs(b.top - (h - b.height - b.top))).toBeLessThanOrEqual(1);
      // As large as a whole tile allows: one more would not fit.
      const more = b.tile + 1;
      expect(more * cols + 2 * p > w || more * rows + 2 * p > h).toBe(true);
    }
  });

  it('reads swipes on the dominant axis once they are long enough', () => {
    expect(swipeDir(5, 3)).toBeNull();
    expect(swipeDir(40, 10)).toBe('right');
    expect(swipeDir(-40, 10)).toBe('left');
    expect(swipeDir(8, -50)).toBe('up');
    expect(swipeDir(8, 50)).toBe('down');
  });

  it('reads arrows and WASD', () => {
    expect(keyDir('ArrowUp')).toBe('up');
    expect(keyDir('a')).toBe('left');
    expect(keyDir('D')).toBe('right');
    expect(keyDir('x')).toBeNull();
  });

  it('lays out more minis with smaller tiles', () => {
    const one = miniGrid(1, 1200, 600, 27, 24);
    const eight = miniGrid(8, 1200, 600, 27, 24);
    expect(eight.tile).toBeLessThan(one.tile);
    const rows = Math.ceil(8 / eight.cols);
    expect(eight.tile * 24 * rows + 30 * rows + 10 * (rows - 1)).toBeLessThanOrEqual(600);
  });
});
