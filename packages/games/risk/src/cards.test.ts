import { describe, expect, it } from 'vitest';
import { allSets, bestSet, isSet, makeDeck, setValue, type Card, type CardSymbol } from './cards';
import { MAPS } from './maps';

let n = 0;
const card = (symbol: CardSymbol): Card => ({
  id: `c${n++}`,
  territory: symbol === 'wild' ? null : `t${n}`,
  symbol,
});
const [I, C, A, W] = ['infantry', 'cavalry', 'artillery', 'wild'] as const;

describe('the deck', () => {
  it('has 44 cards, 14 of each symbol plus 2 wilds', () => {
    const deck = makeDeck(MAPS.world);
    expect(deck).toHaveLength(44);
    const count = (s: CardSymbol) => deck.filter((c) => c.symbol === s).length;
    expect([count(I), count(C), count(A), count(W)]).toEqual([14, 14, 14, 2]);
    expect(new Set(deck.map((c) => c.id)).size).toBe(44);
    expect(deck.filter((c) => c.territory).map((c) => c.territory)).toEqual(
      MAPS.world.territories.map((t) => t.id),
    );
  });
});

describe('sets', () => {
  it('three alike, one of each, or two and a wild', () => {
    expect(isSet([card(I), card(I), card(I)])).toBe(true);
    expect(isSet([card(I), card(C), card(A)])).toBe(true);
    expect(isSet([card(I), card(C), card(W)])).toBe(true);
    expect(isSet([card(A), card(A), card(W)])).toBe(true);
    expect(isSet([card(I), card(I), card(C)])).toBe(false);
    expect(isSet([card(I), card(I)])).toBe(false);
  });

  it('rising values are 4, 6, 8, 10, 12, 15, then +5', () => {
    const set = [card(I), card(I), card(I)];
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => setValue('rising', k, set))).toEqual([
      4, 6, 8, 10, 12, 15, 20, 25,
    ]);
  });

  it('fixed values are 4, 6, 8 and 10, a wild counting as the best it can', () => {
    expect(setValue('fixed', 9, [card(I), card(I), card(I)])).toBe(4);
    expect(setValue('fixed', 0, [card(C), card(C), card(C)])).toBe(6);
    expect(setValue('fixed', 0, [card(A), card(A), card(A)])).toBe(8);
    expect(setValue('fixed', 0, [card(I), card(C), card(A)])).toBe(10);
    expect(setValue('fixed', 0, [card(A), card(A), card(W)])).toBe(10);
    expect(setValue('fixed', 0, [card(I), card(I), card(W)])).toBe(10);
  });

  it('the best set prefers the higher value and keeps wilds on ties', () => {
    const hand = [card(I), card(I), card(I), card(C), card(A), card(W)];
    const fixed = bestSet(hand, 'fixed', 0)!;
    expect(setValue('fixed', 0, fixed)).toBe(10);
    expect(fixed.some((c) => c.symbol === W)).toBe(false);
    const rising = bestSet(hand, 'rising', 0)!;
    expect(rising.some((c) => c.symbol === W)).toBe(false);
    expect(bestSet([card(I), card(C)], 'rising', 0)).toBeNull();
  });

  it('lists every set in a hand', () => {
    expect(allSets([card(I), card(I), card(I), card(C)])).toHaveLength(1);
    expect(allSets([card(I), card(C), card(A), card(W)])).toHaveLength(4);
  });
});
