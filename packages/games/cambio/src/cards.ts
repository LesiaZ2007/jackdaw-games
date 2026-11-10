/**
 * Standard playing cards for Cambio. A card is just its id: 0–51 for one deck in the order
 * spades, hearts, diamonds, clubs (Ace to King within a suit), and 52–103 for a second deck
 * when six to eight play. Ids from different decks that look the same are interchangeable.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_NAME: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANK_NAME = [
  'Ace',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'Jack',
  'Queen',
  'King',
] as const;
const RANK_SHORT = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

/** Cards in one deck. */
export const DECK_SIZE = 52;

/** Decks in play: two for six or more players, one otherwise. */
export const decksFor = (players: number): 1 | 2 => (players >= 6 ? 2 : 1);

/** Every card id for a table of this size, in deck order. */
export const fullDeck = (players: number): number[] =>
  Array.from({ length: DECK_SIZE * decksFor(players) }, (_, i) => i);

/** The card's rank (1 Ace to 13 King) and suit. */
export function cardOf(id: number): { rank: number; suit: Suit } {
  const n = ((id % DECK_SIZE) + DECK_SIZE) % DECK_SIZE;
  return { rank: (n % 13) + 1, suit: SUITS[Math.floor(n / 13)]! };
}

export const isRed = (id: number) => {
  const { suit } = cardOf(id);
  return suit === 'H' || suit === 'D';
};

/** What the card counts for: Ace 1, 2–10 face value, Jack 11, Queen 12, black King 13, red King 0. */
export function cardValue(id: number): number {
  const { rank } = cardOf(id);
  if (rank === 13) return isRed(id) ? 0 : 13;
  return rank;
}

/** A power a card gives when it is drawn from the stock and discarded. */
export type PowerKind = 'peek' | 'spy' | 'swap' | 'king';
export const POWER_NAME: Record<PowerKind, string> = {
  peek: 'Look at one of your own cards',
  spy: 'Look at one card of another player',
  swap: 'Swap one of your cards with another player’s, unseen',
  king: 'Look at one of yours and one of theirs, then swap or not',
};

/** 7 and 8 peek, 9 and 10 spy, Jack and Queen swap blind, black Kings look and then swap. */
export function powerOf(id: number): PowerKind | null {
  const { rank } = cardOf(id);
  if (rank === 7 || rank === 8) return 'peek';
  if (rank === 9 || rank === 10) return 'spy';
  if (rank === 11 || rank === 12) return 'swap';
  if (rank === 13 && !isRed(id)) return 'king';
  return null;
}

/** "Queen of hearts". */
export function cardName(id: number): string {
  const { rank, suit } = cardOf(id);
  return `${RANK_NAME[rank - 1]} of ${SUIT_NAME[suit]}`;
}

/** "Q♥". */
export function cardShort(id: number): string {
  const { rank, suit } = cardOf(id);
  return `${RANK_SHORT[rank - 1]}${SUIT_SYMBOL[suit]}`;
}
