/**
 * The board: the classic forty spaces round a square, with the classic names, prices and rents.
 * Space 0 is GO, 10 is the jail, 20 Free Parking and 30 Go to Jail.
 */

export const GROUPS = ['brown', 'sky', 'pink', 'orange', 'red', 'yellow', 'green', 'navy'] as const;
export type Group = (typeof GROUPS)[number];

export interface Street {
  kind: 'street';
  name: string;
  group: Group;
  price: number;
  /** Rent bare, then with 1–4 houses, then with a hotel. */
  rent: readonly [number, number, number, number, number, number];
  house: number;
}

export interface Railroad {
  kind: 'railroad';
  name: string;
  price: number;
}

export interface Utility {
  kind: 'utility';
  name: string;
  price: number;
}

export type Deed = Street | Railroad | Utility;

export type Space =
  | Deed
  | { kind: 'go'; name: string }
  | { kind: 'jail'; name: string }
  | { kind: 'parking'; name: string }
  | { kind: 'gotojail'; name: string }
  | { kind: 'chance'; name: string }
  | { kind: 'chest'; name: string }
  | { kind: 'tax'; name: string; amount: number };

const street = (
  name: string,
  group: Group,
  price: number,
  house: number,
  rent: Street['rent'],
): Street => ({ kind: 'street', name, group, price, house, rent });
const railroad = (name: string): Railroad => ({ kind: 'railroad', name, price: 200 });
const utility = (name: string): Utility => ({ kind: 'utility', name, price: 150 });

export const BOARD: readonly Space[] = [
  { kind: 'go', name: 'GO' },
  street('Mediterranean Avenue', 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: 'chest', name: 'Community Chest' },
  street('Baltic Avenue', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: 'tax', name: 'Income Tax', amount: 200 },
  railroad('Reading Railroad'),
  street('Oriental Avenue', 'sky', 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: 'chance', name: 'Chance' },
  street('Vermont Avenue', 'sky', 100, 50, [6, 30, 90, 270, 400, 550]),
  street('Connecticut Avenue', 'sky', 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: 'jail', name: 'Jail' },
  street('St. Charles Place', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  utility('Electric Company'),
  street('States Avenue', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  street('Virginia Avenue', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  railroad('Pennsylvania Railroad'),
  street('St. James Place', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: 'chest', name: 'Community Chest' },
  street('Tennessee Avenue', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  street('New York Avenue', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: 'parking', name: 'Free Parking' },
  street('Kentucky Avenue', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: 'chance', name: 'Chance' },
  street('Indiana Avenue', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  street('Illinois Avenue', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  railroad('B. & O. Railroad'),
  street('Atlantic Avenue', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  street('Ventnor Avenue', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  utility('Water Works'),
  street('Marvin Gardens', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: 'gotojail', name: 'Go to Jail' },
  street('Pacific Avenue', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street('North Carolina Avenue', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: 'chest', name: 'Community Chest' },
  street('Pennsylvania Avenue', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  railroad('Short Line'),
  { kind: 'chance', name: 'Chance' },
  street('Park Place', 'navy', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: 'tax', name: 'Luxury Tax', amount: 100 },
  street('Boardwalk', 'navy', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
];

export const SPACES = BOARD.length;
export const GO = 0;
export const JAIL = 10;
export const GO_TO_JAIL = 30;
export const GO_SALARY = 200;
export const BAIL = 50;
export const START_CASH = 1500;
/** The bank's buildings: 32 houses and 12 hotels. */
export const HOUSES = 32;
export const HOTELS = 12;

/**
 * Which names the board wears: the classic ones, or the market town of our own, where the
 * railroads are coaching inns and the utilities are guilds. Prices and rules are the same.
 */
export type Names = 'classic' | 'town';

const TOWN: Readonly<Record<number, string>> = {
  1: 'Mudlark Row',
  3: 'Crowsfoot Alley',
  5: 'The Swan',
  6: 'Tanners Yard',
  8: 'Weavers Walk',
  9: 'Coopers Lane',
  11: 'Chapel Close',
  12: 'Lamplighters',
  13: 'Abbey Green',
  14: 'Cloister Way',
  15: 'The Owl',
  16: 'Fishmarket',
  18: 'Ferry Steps',
  19: 'Quayside',
  21: 'Rook Street',
  23: 'Magpie Market',
  24: 'Raven Hill',
  25: 'The Falcon',
  26: 'Guildhall Square',
  27: 'Mint Street',
  28: 'Conduit',
  29: 'Goldsmiths Row',
  31: 'Bishops Gate',
  32: 'Castle Mews',
  34: 'Heron Parade',
  35: 'The Jackdaw',
  37: 'Kingsmead',
  39: 'Crown Terrace',
};

/** A space's name on this board. */
export function spaceName(space: number, names: Names = 'classic'): string {
  return (names === 'town' ? TOWN[space] : undefined) ?? BOARD[space]?.name ?? '';
}

/** What this board calls a railroad and a utility. */
export function kindWord(kind: 'railroad' | 'utility', names: Names = 'classic'): string {
  if (names === 'classic') return kind;
  return kind === 'railroad' ? 'inn' : 'guild';
}

export function deedAt(space: number): Deed | null {
  const s = BOARD[space];
  return s && (s.kind === 'street' || s.kind === 'railroad' || s.kind === 'utility') ? s : null;
}

export function streetAt(space: number): Street | null {
  const s = BOARD[space];
  return s?.kind === 'street' ? s : null;
}

/** Every space you can own, in board order. */
export const DEEDS: readonly number[] = BOARD.flatMap((s, i) => (deedAt(i) ? [i] : []));
export const RAILROADS: readonly number[] = BOARD.flatMap((s, i) =>
  s.kind === 'railroad' ? [i] : [],
);
export const UTILITIES: readonly number[] = BOARD.flatMap((s, i) =>
  s.kind === 'utility' ? [i] : [],
);

/** The spaces of one colour group, in board order. */
export function groupSpaces(group: Group): number[] {
  return BOARD.flatMap((s, i) => (s.kind === 'street' && s.group === group ? [i] : []));
}

/** The spaces that share a deed's set: its colour group, the four railroads, or the two utilities. */
export function setOf(space: number): number[] {
  const deed = deedAt(space);
  if (!deed) return [];
  if (deed.kind === 'street') return groupSpaces(deed.group);
  return [...(deed.kind === 'railroad' ? RAILROADS : UTILITIES)];
}

/** What the bank lends on a deed. */
export function mortgageValue(space: number): number {
  return (deedAt(space)?.price ?? 0) / 2;
}

/** What it costs to lift a mortgage: the loan plus 10%. */
export function unmortgageCost(space: number): number {
  return Math.ceil((mortgageValue(space) * 11) / 10);
}

/** Steps forward from one space to another, 1–40. */
export function stepsTo(from: number, to: number): number {
  return ((to - from + SPACES - 1) % SPACES) + 1;
}

/** The first space of a kind ahead of `from`. */
export function nearest(from: number, spaces: readonly number[]): number {
  return spaces.reduce((best, s) => (stepsTo(from, s) < stepsTo(from, best) ? s : best));
}
