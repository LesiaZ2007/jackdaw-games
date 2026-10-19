/**
 * The 108-card deck, by number: each colour has one 0, two each of 1–9, and two each of Skip,
 * Reverse and Draw Two (25 cards, ids 0–99 in colour order), then four Wilds (100–103) and four
 * Wild Draw Fours (104–107). A card is just its id, so hands and piles are lists of numbers.
 */

export type Colour = 'r' | 'y' | 'g' | 'b';
export type Face =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'rev'
  | 'draw2'
  | 'wild'
  | 'wild4';

export const COLOURS: Colour[] = ['r', 'y', 'g', 'b'];
export const COLOUR_NAME: Record<Colour, string> = {
  r: 'Red',
  y: 'Gold',
  g: 'Green',
  b: 'Blue',
};

const ACTIONS: Face[] = ['skip', 'skip', 'rev', 'rev', 'draw2', 'draw2'];

export interface CardInfo {
  id: number;
  /** Null for the wilds, which take whatever colour is called. */
  colour: Colour | null;
  face: Face;
}

export const DECK_SIZE = 108;
export const FULL_DECK: number[] = Array.from({ length: DECK_SIZE }, (_, i) => i);

export function cardOf(id: number): CardInfo {
  if (id >= 104) return { id, colour: null, face: 'wild4' };
  if (id >= 100) return { id, colour: null, face: 'wild' };
  const colour = COLOURS[Math.floor(id / 25)]!;
  const k = id % 25;
  const face = (k === 0 ? '0' : k <= 18 ? String(Math.ceil(k / 2)) : ACTIONS[k - 19]!) as Face;
  return { id, colour, face };
}

export const isWild = (id: number) => id >= 100;
export const isNumber = (id: number) => /^\d$/.test(cardOf(id).face);

/** What a card is worth in the hand of someone who didn't go out. */
export function points(id: number): number {
  const { face } = cardOf(id);
  if (face === 'wild' || face === 'wild4') return 50;
  if (face === 'skip' || face === 'rev' || face === 'draw2') return 20;
  return Number(face);
}

const FACE_NAME: Partial<Record<Face, string>> = {
  skip: 'Skip',
  rev: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
};

/** "Red 7", "Blue Skip", "Wild Draw Four". */
export function cardName(id: number): string {
  const c = cardOf(id);
  const face = FACE_NAME[c.face] ?? c.face;
  return c.colour ? `${COLOUR_NAME[c.colour]} ${face}` : face;
}

/** Plays on the pile in the normal way: same colour, same number or symbol, or a wild. */
export function matches(id: number, top: number, colour: Colour): boolean {
  if (isWild(id)) return true;
  const c = cardOf(id);
  return c.colour === colour || c.face === cardOf(top).face;
}

/** Colour order, then numbers low to high, then the action cards, then the wilds. */
export function sortHand(hand: readonly number[]): number[] {
  return [...hand].sort((a, b) => a - b);
}
