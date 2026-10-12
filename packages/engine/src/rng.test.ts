import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('repeats for the same seed and continues from saved state', () => {
    const a = createRng(123);
    const b = createRng(123);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('shuffles without losing or mutating items', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(5).shuffle(items);
    expect(out.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps int() in range and roughly uniform', () => {
    const rng = createRng(99);
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[rng.int(3)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(900);
    expect(() => rng.int(0)).toThrow();
  });
});
