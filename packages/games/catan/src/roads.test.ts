import { describe, expect, it } from 'vitest';
import type { Buildings, Roads } from './build';
import { layout } from './geometry';
import { awardRoad, longestRoad } from './roads';

const L = layout('classic');
const centre = L.tiles[9]!;
const ring = centre.edges; // e0: c0–c1, e1: c1–c2, … e5: c5–c0
const outward = (corner: string) =>
  L.corners[corner]!.edges.find((e) => !centre.edges.includes(e))!;
const own = (edges: string[], pid = 'a'): Roads => Object.fromEntries(edges.map((e) => [e, pid]));

describe('longest road', () => {
  it('a straight line of 5', () => {
    expect(longestRoad(L, {}, own(ring.slice(0, 5)), 'a')).toBe(5);
  });

  it('a fork counts its longest branch', () => {
    const roads = own([ring[0]!, ring[1]!, ring[2]!, ring[3]!, outward(centre.corners[3]!)]);
    expect(longestRoad(L, {}, roads, 'a')).toBe(4);
  });

  it('a loop of 6 counts 6', () => {
    expect(longestRoad(L, {}, own(ring), 'a')).toBe(6);
  });

  it('a loop with a tail counts every road once', () => {
    expect(longestRoad(L, {}, own([...ring, outward(centre.corners[0]!)]), 'a')).toBe(7);
  });

  it('an opponent’s settlement splits a road', () => {
    const b: Buildings = { [centre.corners[2]!]: { owner: 'b', city: false } };
    expect(longestRoad(L, b, own(ring.slice(0, 5)), 'a')).toBe(3);
  });

  it('your own settlement doesn’t split it', () => {
    const b: Buildings = { [centre.corners[2]!]: { owner: 'a', city: false } };
    expect(longestRoad(L, b, own(ring.slice(0, 5)), 'a')).toBe(5);
  });

  it('only your own roads count', () => {
    expect(longestRoad(L, {}, { ...own(ring.slice(0, 3)), ...own(ring.slice(3), 'b') }, 'a')).toBe(
      3,
    );
  });
});

describe('who holds Longest Road', () => {
  it('first to 5 takes it', () => {
    expect(awardRoad(null, { a: 5, b: 4 })).toBe('a');
    expect(awardRoad(null, { a: 4, b: 4 })).toBe(null);
  });
  it('a tie keeps the holder', () => {
    expect(awardRoad('a', { a: 6, b: 6 })).toBe('a');
  });
  it('strictly longer takes it', () => {
    expect(awardRoad('a', { a: 6, b: 7 })).toBe('b');
  });
  it('a broken holder still tied for longest keeps it', () => {
    expect(awardRoad('a', { a: 5, b: 5, c: 2 })).toBe('a');
  });
  it('broken, with two others tied, it is set aside', () => {
    expect(awardRoad('a', { a: 3, b: 6, c: 6 })).toBe(null);
  });
  it('broken, with one other longest, it moves', () => {
    expect(awardRoad('a', { a: 3, b: 6, c: 5 })).toBe('b');
  });
  it('under 5 for everyone it is set aside', () => {
    expect(awardRoad('a', { a: 4, b: 4 })).toBe(null);
  });
});
