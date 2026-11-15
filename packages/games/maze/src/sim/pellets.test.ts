import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { MAZE_LAYOUTS } from './layouts';
import { decodeBits, encodeBits, pelletIndex } from './pellets';

describe('pellets', () => {
  it('indexes every pellet and power spot in reading order', () => {
    for (const m of MAZE_LAYOUTS) {
      const idx = pelletIndex(m);
      let n = 0;
      for (let y = 0; y < m.rows.length; y++)
        for (let x = 0; x < m.rows[y]!.length; x++) {
          const c = m.rows[y]![x];
          if (c === '.' || c === 'o') expect(idx.get(`${x},${y}`)).toBe(n++);
        }
      expect(idx.size).toBe(n);
    }
  });

  it('round-trips random bitsets of every layout size', () => {
    const rng = createRng(7);
    for (const m of MAZE_LAYOUTS) {
      const n = pelletIndex(m).size;
      for (let k = 0; k < 20; k++) {
        const bits = new Uint8Array(n);
        for (let i = 0; i < n; i++) bits[i] = rng.next() < 0.4 ? 1 : 0;
        const s = encodeBits(bits);
        expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
        expect(decodeBits(s, n)).toEqual(bits);
      }
    }
  });

  it('handles empty and full sets, and short strings', () => {
    expect(decodeBits(encodeBits(new Uint8Array(0)), 0)).toEqual(new Uint8Array(0));
    const full = new Uint8Array(13).fill(1);
    expect(decodeBits(encodeBits(full), 13)).toEqual(full);
    expect(decodeBits('', 5)).toEqual(new Uint8Array(5));
  });
});
