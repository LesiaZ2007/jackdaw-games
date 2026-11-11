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

/** Jokers have ids from here up (two per deck, when the house plays with them). */
export const JOKER_BASE = 104;
export const isJoker = (id: number) => id >= JOKER_BASE;

/** Every card id for a table of this size, in deck order, with two jokers per deck on request. */
export const fullDeck = (players: number, jokers = false): number[] => [
  ...Array.from({ length: DECK_SIZE * decksFor(players) }, (_, i) => i),
  ...(jokers ? Array.from({ length: 2 * decksFor(players) }, (_, i) => JOKER_BASE + i) : []),
];

/** Which ranks give a power (7 and 8 are ranks 7 and 8; Jack and Queen 11 and 12). */
export const RANKS_OF = {
  '7 and 8': [7, 8],
  '9 and 10': [9, 10],
  'Jack and Queen': [11, 12],
  None: [],
} as const;
export type PowerCards = keyof typeof RANKS_OF;

/**
 * The house rules a game is played with, resolved once at setup and public (everyone sees them).
 * DEFAULT_HOUSE is the traditional game this package started with.
 */
export interface House {
  peek: PowerCards;
  spy: PowerCards;
  swap: PowerCards;
  king: 'Black Kings' | 'All Kings' | 'None';
  /** What a red King is worth: 0, -1 or 13. */
  redKing: number;
  /** A caller who isn't lowest scores their total plus this, or doubled. */
  penalty: number | 'double';
  /** A caller who is lowest scores this, or their own total. */
  bonus: number | 'total';
  /** The grid slots everyone may look at when a round starts (none: the peek is skipped). */
  peekSlots: number[];
  /** With a 100 goal, landing on exactly 100 drops a player to 50. */
  exactly100: boolean;
  jokers: boolean;
}

export const DEFAULT_HOUSE: House = {
  peek: '7 and 8',
  spy: '9 and 10',
  swap: 'Jack and Queen',
  king: 'Black Kings',
  redKing: 0,
  penalty: 10,
  bonus: 0,
  peekSlots: [2, 3],
  exactly100: false,
  jokers: false,
};

/** The card's rank (1 Ace to 13 King) and suit. */
export function cardOf(id: number): { rank: number; suit: Suit } {
  if (isJoker(id)) return { rank: 0, suit: 'S' };
  const n = ((id % DECK_SIZE) + DECK_SIZE) % DECK_SIZE;
  return { rank: (n % 13) + 1, suit: SUITS[Math.floor(n / 13)]! };
}

export const isRed = (id: number) => {
  if (isJoker(id)) return false;
  const { suit } = cardOf(id);
  return suit === 'H' || suit === 'D';
};

/** What the card counts for: Ace 1, 2–10 face value, Jack 11, Queen 12, black King 13, red King 0. */
export function houseValue(id: number, house: House): number {
  const { rank } = cardOf(id);
  if (rank === 0) return 0;
  if (rank === 13) return isRed(id) ? house.redKing : 13;
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

/** By default 7 and 8 peek, 9 and 10 spy, Jack and Queen swap blind, black Kings look and swap. */
export function housePower(id: number, house: House): PowerKind | null {
  const { rank } = cardOf(id);
  if (rank === 0) return null;
  const has = (cards: PowerCards) => (RANKS_OF[cards] as readonly number[]).includes(rank);
  if (has(house.peek)) return 'peek';
  if (has(house.spy)) return 'spy';
  if (has(house.swap)) return 'swap';
  if (rank === 13 && (house.king === 'All Kings' || (house.king === 'Black Kings' && !isRed(id))))
    return 'king';
  return null;
}

/** The traditional values and powers (no house rules). */
export const cardValue = (id: number): number => houseValue(id, DEFAULT_HOUSE);
export const powerOf = (id: number): PowerKind | null => housePower(id, DEFAULT_HOUSE);

/** "Queen of hearts". */
export function cardName(id: number): string {
  if (isJoker(id)) return 'Joker';
  const { rank, suit } = cardOf(id);
  return `${RANK_NAME[rank - 1]} of ${SUIT_NAME[suit]}`;
}

/** "Q♥". */
export function cardShort(id: number): string {
  if (isJoker(id)) return 'Jk';
  const { rank, suit } = cardOf(id);
  return `${RANK_SHORT[rank - 1]}${SUIT_SYMBOL[suit]}`;
}
