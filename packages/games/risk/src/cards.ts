import type { MapDef } from './maps';

export type CardSymbol = 'infantry' | 'cavalry' | 'artillery' | 'wild';
export type CardSets = 'rising' | 'fixed';

/** A territory card (or one of the two wilds, which name no territory). */
export interface Card {
  id: string;
  territory: string | null;
  symbol: CardSymbol;
}

const SYMBOLS = ['infantry', 'cavalry', 'artillery'] as const;
const FIXED: Record<(typeof SYMBOLS)[number], number> = { infantry: 4, cavalry: 6, artillery: 8 };
const MIXED = 10;

/** One card per territory, symbols in turn in map order, plus two wilds (unshuffled). */
export function makeDeck(map: MapDef): Card[] {
  return [
    ...map.territories.map((t, i) => ({ id: t.id, territory: t.id, symbol: SYMBOLS[i % 3]! })),
    { id: 'wild-1', territory: null, symbol: 'wild' as const },
    { id: 'wild-2', territory: null, symbol: 'wild' as const },
  ];
}

/** Three alike, one of each, or any two with a wild. */
export function isSet(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  const plain = cards.filter((c) => c.symbol !== 'wild').map((c) => c.symbol);
  if (plain.length < 3) return true;
  const kinds = new Set(plain).size;
  return kinds === 1 || kinds === 3;
}

/** Armies a set is worth: by how many sets were traded before it (rising), or by its symbols. */
export function setValue(mode: CardSets, setsTraded: number, cards: Card[]): number {
  if (mode === 'rising') return setsTraded < 5 ? 4 + 2 * setsTraded : 15 + 5 * (setsTraded - 5);
  const plain = cards.filter((c) => c.symbol !== 'wild').map((c) => c.symbol);
  const kinds = new Set(plain);
  // A wild can always stand in for the missing symbol, so any set with one counts as one of each.
  if (plain.length < 3 || kinds.size === 3) return MIXED;
  return FIXED[plain[0] as keyof typeof FIXED];
}

/** Every set that can be made from a hand. */
export function allSets(hand: Card[]): Card[][] {
  const sets: Card[][] = [];
  for (let a = 0; a < hand.length; a++)
    for (let b = a + 1; b < hand.length; b++)
      for (let c = b + 1; c < hand.length; c++) {
        const set = [hand[a]!, hand[b]!, hand[c]!];
        if (isSet(set)) sets.push(set);
      }
  return sets;
}

/** The set worth most, keeping wilds back when it costs nothing; null if there isn't one. */
export function bestSet(hand: Card[], mode: CardSets, setsTraded: number): Card[] | null {
  const wilds = (s: Card[]) => s.filter((c) => c.symbol === 'wild').length;
  let best: Card[] | null = null;
  for (const set of allSets(hand)) {
    if (!best) {
      best = set;
      continue;
    }
    const [v, bv] = [setValue(mode, setsTraded, set), setValue(mode, setsTraded, best)];
    if (v > bv || (v === bv && wilds(set) < wilds(best))) best = set;
  }
  return best;
}
