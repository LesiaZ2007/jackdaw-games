import { describe, expect, it } from 'vitest';
import { fitTile, keyDir, miniGrid, swipeDir } from './layout';

describe('maze screen helpers', () => {
  it('fits the maze inside its space, frame included, and never below 4', () => {
    const t = fitTile(360, 400, 27, 24);
    expect(t * 27 + 28).toBeLessThanOrEqual(360);
    expect(t * 24 + 28).toBeLessThanOrEqual(400);
    expect(t).toBe(Math.floor(Math.min(332 / 27, 372 / 24)));
    expect(fitTile(10, 10, 27, 24)).toBe(4);
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
