import type { Rng } from '@jackdaw/engine';
import { FULL_DECK, RANKS, SUITS, type Card } from './cards';

/**
 * How good a hand is, for the computer players. Pure, and every draw comes from the injected Rng.
 * Only the bot's own cards and the public board go in, so it knows exactly what a person in its
 * seat would.
 */

const RANK: Record<string, number> = {};
const SUIT: Record<string, number> = {};
for (const c of FULL_DECK) {
  RANK[c] = RANKS.indexOf(c[0]!) + 2;
  SUIT[c] = SUITS.indexOf(c[1] as (typeof SUITS)[number]);
}

/** The high card of a straight in a rank bitmask (bit r for rank r), or 0. */
function straightIn(mask: number): number {
  for (let high = 14; high >= 6; high--) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) return high;
  }
  // The wheel: A-2-3-4-5.
  const wheel = (1 << 14) | 0b111100;
  return (mask & wheel) === wheel ? 5 : 0;
}

/** Packs a category and up to five ranks into one comparable number. */
function pack(cat: number, ranks: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 15 + (ranks[i] ?? 0);
  return v;
}

/**
 * The best five-card hand among five to seven cards as one number: bigger is better and equal is a
 * split, ranked the same way as `bestHand` in cards.ts. Much quicker than trying every five, which
 * matters because a bot deals out hundreds of hands to decide one move.
 */
export function quickScore(cards: Card[]): number {
  const counts = new Array<number>(15).fill(0);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    const r = RANK[c]!;
    const s = SUIT[c]!;
    counts[r]!++;
    suitMask[s]! |= 1 << r;
    suitCount[s]!++;
    mask |= 1 << r;
  }
  const flushSuit = suitCount.findIndex((n) => n >= 5);
  if (flushSuit >= 0) {
    const sf = straightIn(suitMask[flushSuit]!);
    if (sf) return pack(8, [sf]);
  }
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    const n = counts[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
    else if (n === 1) singles.push(r);
  }
  const highest = (exclude: number[]) => {
    for (let r = 14; r >= 2; r--) if (counts[r]! > 0 && !exclude.includes(r)) return r;
    return 0;
  };
  if (quads.length) return pack(7, [quads[0]!, highest([quads[0]!])]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const over = trips[0]!;
    const under = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return pack(6, [over, under]);
  }
  if (flushSuit >= 0) {
    const top: number[] = [];
    for (let r = 14; r >= 2 && top.length < 5; r--)
      if (suitMask[flushSuit]! & (1 << r)) top.push(r);
    return pack(5, top);
  }
  const straight = straightIn(mask);
  if (straight) return pack(4, [straight]);
  if (trips.length) return pack(3, [trips[0]!, ...singles.slice(0, 2)]);
  if (pairs.length >= 2) {
    const [a, b] = pairs as [number, number];
    return pack(2, [a, b, highest([a, b])]);
  }
  if (pairs.length) return pack(1, [pairs[0]!, ...singles.slice(0, 3)]);
  return pack(0, singles);
}

/**
 * The share of the pot a hand would win against `opponents` random hands, by dealing out the rest
 * of the board and their cards `samples` times.
 */
export function equity(
  hole: Card[],
  board: Card[],
  opponents: number,
  rng: Rng,
  samples = 60,
): number {
  if (opponents <= 0) return 1;
  const seen = new Set([...hole, ...board]);
  const rest = FULL_DECK.filter((c) => !seen.has(c));
  const need = 5 - board.length;
  const draw = need + opponents * 2;
  if (draw > rest.length) return 1 / (opponents + 1);
  let share = 0;
  const deck = rest.slice();
  for (let i = 0; i < samples; i++) {
    // A partial Fisher–Yates: only the cards this sample needs.
    for (let k = 0; k < draw; k++) {
      const j = k + rng.int(deck.length - k);
      [deck[k], deck[j]] = [deck[j]!, deck[k]!];
    }
    const full = [...board, ...deck.slice(0, need)];
    const mine = quickScore([...hole, ...full]);
    let tied = 1;
    let lost = false;
    for (let o = 0; o < opponents; o++) {
      const at = need + o * 2;
      const theirs = quickScore([deck[at]!, deck[at + 1]!, ...full]);
      if (theirs > mine) {
        lost = true;
        break;
      }
      if (theirs === mine) tied++;
    }
    if (!lost) share += 1 / tied;
  }
  return share / samples;
}
