import { describe, expect, it } from 'vitest';
import { layout } from './geometry';

describe('geometry', () => {
  it('classic has 19 tiles, 54 corners, 72 edges', () => {
    const L = layout('classic');
    expect([L.tiles.length, L.cornerIds.length, L.edgeIds.length]).toEqual([19, 54, 72]);
  });

  it('big has 30 tiles, 80 corners, 109 edges', () => {
    const L = layout('big');
    expect([L.tiles.length, L.cornerIds.length, L.edgeIds.length]).toEqual([30, 80, 109]);
  });

  it('rows are 3-4-5-4-3 and 3-4-5-6-5-4-3', () => {
    const widths = (size: 'classic' | 'big') => {
      const rows: number[] = [];
      for (const t of layout(size).tiles) rows[t.row] = (rows[t.row] ?? 0) + 1;
      return rows;
    };
    expect(widths('classic')).toEqual([3, 4, 5, 4, 3]);
    expect(widths('big')).toEqual([3, 4, 5, 6, 5, 4, 3]);
  });

  it.each(['classic', 'big'] as const)('%s: corner and tile neighbours are symmetric', (size) => {
    const L = layout(size);
    for (const c of Object.values(L.corners)) {
      for (const n of c.corners) expect(L.corners[n]!.corners).toContain(c.id);
      for (const t of c.tiles) expect(L.tiles[t]!.corners).toContain(c.id);
      expect(c.corners.length).toBeGreaterThanOrEqual(2);
      expect(c.corners.length).toBeLessThanOrEqual(3);
    }
    L.tiles.forEach((t, i) => {
      expect(t.corners).toHaveLength(6);
      expect(t.edges).toHaveLength(6);
      for (const n of t.neighbours) expect(L.tiles[n]!.neighbours).toContain(i);
    });
  });

  it.each(['classic', 'big'] as const)("%s: every edge's corners list it", (size) => {
    const L = layout(size);
    for (const e of Object.values(L.edges)) {
      expect(L.corners[e.a]!.edges).toContain(e.id);
      expect(L.corners[e.b]!.edges).toContain(e.id);
      expect(L.corners[e.a]!.corners).toContain(e.b);
    }
  });

  it('harbour slots: 9 and 11 coastal edges, no two sharing a corner', () => {
    for (const [size, n] of [
      ['classic', 9],
      ['big', 11],
    ] as const) {
      const L = layout(size);
      expect(L.harbourSlots).toHaveLength(n);
      const seen = new Set<string>();
      for (const id of L.harbourSlots) {
        const e = L.edges[id]!;
        expect(e.tiles).toHaveLength(1);
        expect(seen.has(e.a) || seen.has(e.b)).toBe(false);
        seen.add(e.a);
        seen.add(e.b);
      }
    }
  });

  it('spiral visits every tile once, outer ring first', () => {
    for (const size of ['classic', 'big'] as const) {
      const L = layout(size);
      expect([...L.spiral].sort((a, b) => a - b)).toEqual(L.tiles.map((_, i) => i));
    }
    const L = layout('classic');
    for (const i of L.spiral.slice(0, 12)) expect(L.tiles[i]!.neighbours.length).toBeLessThan(6);
    expect(L.spiral[18]).toBe(9); // the centre tile comes last
    // Each step of the spiral moves to a neighbouring tile.
    for (let k = 1; k < L.spiral.length; k++)
      expect(L.tiles[L.spiral[k - 1]!]!.neighbours).toContain(L.spiral[k]);
  });

  it('ids are stable', () => {
    expect(layout('classic').cornerIds).toEqual(layout('classic').cornerIds);
    expect(layout('classic').cornerIds[0]).toBe('c0');
    expect(layout('big').edgeIds[108]).toBe('e108');
  });
});
