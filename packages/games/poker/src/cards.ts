/**
 * Cards and hand ranking for Texas Hold'em. A card is two characters: rank (2–9, T, J, Q, K, A)
 * then suit (s, h, d, c), e.g. "As" or "Td". Pure functions, shared by the rules and the screens.
 */

export const RANKS = '23456789TJQKA';
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];
export type Card = string;

export const FULL_DECK: Card[] = SUITS.flatMap((s) => [...RANKS].map((r) => r + s));

/** 2 for a deuce up to 14 for an ace. */
export const rankOf = (c: Card) => RANKS.indexOf(c[0]!) + 2;
export const suitOf = (c: Card) => c[1] as Suit;

export const CATEGORY = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
] as const;

/** A hand's strength: category first, then tie-breaking ranks. Compare with `compareScore`. */
export type Score = number[];

export function compareScore(a: Score, b: Score): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The score of exactly five cards. */
export function scoreFive(cards: Card[]): Score {
  const ranks = cards.map(rankOf).sort((x, y) => y - x);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Groups by size, then by rank: [rank, count] for a full house is [[K,3],[5,2]].
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const distinct = groups.map((g) => g[0]);
  let straightHigh = 0;
  if (counts.size === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    // The wheel: A-2-3-4-5 counts as five high.
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5;
  }
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0]![1] === 4) return [7, ...distinct];
  if (groups[0]![1] === 3 && groups[1]![1] === 2) return [6, ...distinct];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0]![1] === 3) return [3, ...distinct];
  if (groups[0]![1] === 2 && groups[1]![1] === 2) return [2, ...distinct];
  if (groups[0]![1] === 2) return [1, ...distinct];
  return [0, ...ranks];
}

export interface BestHand {
  score: Score;
  /** The five cards that make it. */
  cards: Card[];
  /** "Full house, kings over fives". */
  name: string;
}

/** The best five of five to seven cards. */
export function bestHand(cards: Card[]): BestHand {
  let best: { score: Score; cards: Card[] } | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!];
            const score = scoreFive(five);
            if (!best || compareScore(score, best.score) > 0) best = { score, cards: five };
          }
  if (!best) throw new Error('A hand needs five cards');
  return { ...best, name: handName(best.score) };
}

const NAMES: Record<number, [string, string]> = {
  2: ['two', 'twos'],
  3: ['three', 'threes'],
  4: ['four', 'fours'],
  5: ['five', 'fives'],
  6: ['six', 'sixes'],
  7: ['seven', 'sevens'],
  8: ['eight', 'eights'],
  9: ['nine', 'nines'],
  10: ['ten', 'tens'],
  11: ['jack', 'jacks'],
  12: ['queen', 'queens'],
  13: ['king', 'kings'],
  14: ['ace', 'aces'],
};
const one = (r: number) => NAMES[r]![0];
const many = (r: number) => NAMES[r]![1];

/** A score in words: "Two pair, aces and nines". */
export function handName(score: Score): string {
  const [cat, a = 0, b = 0] = score;
  switch (cat) {
    case 8:
      return a === 14 ? 'Royal flush' : `Straight flush, ${one(a)} high`;
    case 7:
      return `Four ${many(a)}`;
    case 6:
      return `Full house, ${many(a)} over ${many(b)}`;
    case 5:
      return `Flush, ${one(a)} high`;
    case 4:
      return `Straight, ${one(a)} high`;
    case 3:
      return `Three ${many(a)}`;
    case 2:
      return `Two pair, ${many(a)} and ${many(b)}`;
    case 1:
      return `Pair of ${many(a)}`;
    default:
      return `${one(a)[0]!.toUpperCase()}${one(a).slice(1)} high`;
  }
}

/** "A♠", for screen readers and text. */
export function cardText(c: Card): string {
  const r = c[0] === 'T' ? '10' : c[0]!;
  return r + { s: '♠', h: '♥', d: '♦', c: '♣' }[suitOf(c)];
}
