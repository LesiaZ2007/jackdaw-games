import { describe, expect, it } from 'vitest';
import { createRng, mixSeed, randomSeed } from './rng';

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

describe('numeric seeds keep their sequence', () => {
  it('matches values pinned from the original mulberry32', () => {
    const a = createRng(123);
    expect([a.next(), a.next(), a.next()]).toEqual([
      0.7872516233474016, 0.1785435655619949, 0.49531551403924823,
    ]);
    expect(a.state).toBe(1199730266);
    const b = createRng(0);
    expect([b.int(1000), b.int(1000), b.int(1000)]).toEqual([266, 0, 223]);
    expect(createRng(5).shuffle([1, 2, 3, 4, 5, 6, 7, 8])).toEqual([5, 3, 7, 1, 4, 2, 8, 6]);
  });

  it('keeps a numeric state numeric', () => {
    expect(typeof createRng(7).state).toBe('number');
  });
});

describe('string (128-bit) seeds', () => {
  const seed = '0123456789abcdef0123456789abcdef';

  it('are deterministic', () => {
    const a = createRng(seed);
    const b = createRng(seed);
    expect([a.next(), a.int(100), a.next()]).toEqual([b.next(), b.int(100), b.next()]);
    expect(createRng(seed).shuffle([1, 2, 3, 4, 5, 6])).toEqual(
      createRng(seed).shuffle([1, 2, 3, 4, 5, 6]),
    );
  });

  it('differ from each other and from numeric seeds', () => {
    const other = '0123456789abcdef0123456789abcdee';
    expect(createRng(seed).next()).not.toBe(createRng(other).next());
    expect(createRng(seed).next()).not.toBe(createRng(1).next());
  });

  it('round-trip: the saved state continues the same sequence', () => {
    const a = createRng(seed);
    for (let i = 0; i < 7; i++) a.next();
    expect(a.state).toMatch(/^[0-9a-f]{32}$/);
    const resumed = createRng(a.state);
    for (let i = 0; i < 20; i++) expect(resumed.next()).toBe(a.next());
    expect(resumed.state).toBe(a.state);
  });

  it('accept an all-zero seed without getting stuck', () => {
    const rng = createRng('0'.repeat(32));
    const seen = new Set(Array.from({ length: 50 }, () => rng.next()));
    expect(seen.size).toBeGreaterThan(40);
  });

  it('reject anything that is not 32 hex characters', () => {
    expect(() => createRng('abc')).toThrow(RangeError);
    expect(() => createRng('z'.repeat(32))).toThrow(RangeError);
  });

  it('shuffle to a permutation without mutating the input', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const out = createRng(seed).shuffle(items);
    expect(out.slice().sort((x, y) => x - y)).toEqual(items);
    expect(items[0]).toBe(0);
    expect(out).not.toEqual(items);
  });

  it('are roughly uniform', () => {
    const rng = createRng(seed);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 8000; i++) counts[rng.int(4)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(1800);
    let sum = 0;
    for (let i = 0; i < 8000; i++) sum += rng.next();
    expect(sum / 8000).toBeGreaterThan(0.48);
    expect(sum / 8000).toBeLessThan(0.52);
  });

  it('put every item in every place about equally often', () => {
    const counts = [0, 0, 0];
    const rng = createRng('fedcba9876543210fedcba9876543210');
    for (let i = 0; i < 3000; i++) counts[rng.shuffle([0, 1, 2]).indexOf(0)]!++;
    for (const c of counts) expect(c).toBeGreaterThan(850);
  });
});

describe('randomSeed', () => {
  it('is 32 hex characters and differs between calls', () => {
    const a = randomSeed();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSeed()).not.toBe(a);
    expect(typeof createRng(a).next()).toBe('number');
  });
});

describe('mixSeed', () => {
  it('keeps the numeric formula and varies string states by counter', () => {
    expect(mixSeed(123, 4)).toBe((123 ^ Math.imul(4, 0x9e3779b1)) >>> 0);
    const s = '0123456789abcdef0123456789abcdef';
    expect(mixSeed(s, 1)).toMatch(/^[0-9a-f]{32}$/);
    expect(mixSeed(s, 1)).not.toBe(mixSeed(s, 2));
    expect(mixSeed(s, 1)).toBe(mixSeed(s, 1));
  });
});
