/**
 * Playing cards for solitaire. A card is two characters: rank (A, 2–9, T, J, Q, K) then suit
 * (s, h, d, c), e.g. "Ah" or "Td". Pure functions, shared by the rules and the screens.
 */

export const RANKS = 'A23456789TJQK';
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];
export type Card = string;

/** One 52-card deck, no jokers. */
export const DECK: Card[] = SUITS.flatMap((s) => [...RANKS].map((r) => r + s));

/** 1 for an ace up to 13 for a king. */
export const rankOf = (c: Card) => RANKS.indexOf(c[0]!) + 1;
export const suitOf = (c: Card) => c[1] as Suit;
export const isRed = (c: Card) => c[1] === 'h' || c[1] === 'd';

const RANK_NAME = ',Ace,2,3,4,5,6,7,8,9,10,Jack,Queen,King'.split(',');
const SUIT_NAME: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

/** "Queen of hearts". */
export const cardText = (c: Card) => `${RANK_NAME[rankOf(c)]} of ${SUIT_NAME[suitOf(c)]}`;

/** "Q♥", for chat and short labels. */
export const cardShort = (c: Card) =>
  `${c[0] === 'T' ? '10' : c[0]}${{ s: '♠', h: '♥', d: '♦', c: '♣' }[suitOf(c)]}`;

/** True if `c` can go on `under` in a tableau column: one lower and the other colour. */
export const stacks = (c: Card, under: Card) =>
  rankOf(c) === rankOf(under) - 1 && isRed(c) !== isRed(under);
