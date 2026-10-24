import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { makeBoard } from './board';
import {
  COSTS,
  bankRatio,
  canAfford,
  citySpots,
  distanceOk,
  harboursOf,
  missing,
  piecesLeft,
  roadSpots,
  settlementSpots,
  type Buildings,
  type Roads,
} from './build';
import { layout } from './geometry';
import { emptyCards } from './types';

const L = layout('classic');
const centre = L.tiles[9]!;
const [c0, c1, c2, c3] = centre.corners as [string, string, string, string];

describe('placement', () => {
  it('distance rule blocks next to any building', () => {
    const b: Buildings = { [c0]: { owner: 'a', city: false } };
    expect(distanceOk(L, b, c0)).toBe(false);
    expect(distanceOk(L, b, c1)).toBe(false);
    expect(distanceOk(L, b, c2)).toBe(true);
  });

  it('setup settlements ignore roads, later ones need your road', () => {
    const b: Buildings = {};
    expect(settlementSpots(L, b, {}, 'a', true)).toHaveLength(54);
    expect(settlementSpots(L, b, {}, 'a', false)).toEqual([]);
    const roads: Roads = { [centre.edges[0]!]: 'a' };
    expect(settlementSpots(L, b, roads, 'a', false).sort()).toEqual([c0, c1].sort());
    expect(settlementSpots(L, b, roads, 'b', false)).toEqual([]);
  });

  it('roads must touch your road or building and not pass an opponent’s corner', () => {
    const b: Buildings = { [c0]: { owner: 'a', city: false } };
    expect(roadSpots(L, b, {}, 'a').sort()).toEqual([...L.corners[c0]!.edges].sort());
    const roads: Roads = { [centre.edges[0]!]: 'a' }; // c0 – c1
    expect(roadSpots(L, b, roads, 'a')).toContain(centre.edges[1]); // c1 – c2
    const blocked: Buildings = { ...b, [c1]: { owner: 'b', city: false } };
    expect(roadSpots(L, blocked, roads, 'a')).not.toContain(centre.edges[1]);
    expect(roadSpots(L, blocked, roads, 'a')).not.toContain(centre.edges[0]);
  });

  it('setup road must touch the new settlement', () => {
    const b: Buildings = { [c0]: { owner: 'a', city: false }, [c3]: { owner: 'a', city: false } };
    expect(roadSpots(L, b, {}, 'a', c3).sort()).toEqual([...L.corners[c3]!.edges].sort());
  });

  it('cities only on your settlements', () => {
    const b: Buildings = {
      [c0]: { owner: 'a', city: false },
      [c2]: { owner: 'a', city: true },
      [c3]: { owner: 'b', city: false },
    };
    expect(citySpots(b, 'a')).toEqual([c0]);
  });

  it('pieces left counts a city as freeing a settlement', () => {
    const b: Buildings = { [c0]: { owner: 'a', city: true }, [c2]: { owner: 'a', city: false } };
    const roads: Roads = { [centre.edges[0]!]: 'a', [centre.edges[1]!]: 'a' };
    expect(piecesLeft(b, roads, 'a')).toEqual({ road: 13, settlement: 4, city: 3 });
  });

  it('harbour ratios: 2 for its resource, 3 generic, 4 otherwise', () => {
    const board = makeBoard('classic', 'Beginner', createRng(1));
    const generic = L.edges[board.harbours[0]!.edge]!; // 'any'
    const wool = L.edges[board.harbours[1]!.edge]!; // 'wool'
    const b: Buildings = {
      [generic.a]: { owner: 'a', city: false },
      [wool.b]: { owner: 'a', city: true },
    };
    const kinds = harboursOf(L, board, b, 'a');
    expect(kinds.sort()).toEqual(['any', 'wool']);
    expect(bankRatio(kinds, 'wool')).toBe(2);
    expect(bankRatio(kinds, 'ore')).toBe(3);
    expect(bankRatio([], 'ore')).toBe(4);
    expect(harboursOf(L, board, b, 'b')).toEqual([]);
  });

  it('costs and affordability', () => {
    expect(COSTS.city).toEqual({ ore: 3, grain: 2 });
    const hand = { ...emptyCards(), brick: 1, lumber: 1, wool: 1 };
    expect(canAfford(hand, COSTS.road)).toBe(true);
    expect(canAfford(hand, COSTS.settlement)).toBe(false);
    expect(missing(hand, COSTS.settlement)).toEqual({ grain: 1 });
  });
});
