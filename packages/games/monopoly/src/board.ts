/**
 * The board: forty spaces round a square, in the classic order and at the classic prices, with
 * streets, inns and guilds named for a market town of our own. Space 0 is GO, 10 is the jail,
 * 20 Free Parking and 30 Go to Jail.
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

export interface Inn {
  kind: 'inn';
  name: string;
  price: number;
}

export interface Guild {
  kind: 'guild';
  name: string;
  price: number;
}

export type Deed = Street | Inn | Guild;

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
const inn = (name: string): Inn => ({ kind: 'inn', name, price: 200 });
const guild = (name: string): Guild => ({ kind: 'guild', name, price: 150 });

export const BOARD: readonly Space[] = [
  { kind: 'go', name: 'GO' },
  street('Mudlark Row', 'brown', 60, 50, [2, 10, 30, 90, 160, 250]),
  { kind: 'chest', name: 'Community Chest' },
  street('Crowsfoot Alley', 'brown', 60, 50, [4, 20, 60, 180, 320, 450]),
  { kind: 'tax', name: 'Income Tax', amount: 200 },
  inn('The Swan'),
  street('Tanners Yard', 'sky', 100, 50, [6, 30, 90, 270, 400, 550]),
  { kind: 'chance', name: 'Chance' },
  street('Weavers Walk', 'sky', 100, 50, [6, 30, 90, 270, 400, 550]),
  street('Coopers Lane', 'sky', 120, 50, [8, 40, 100, 300, 450, 600]),
  { kind: 'jail', name: 'Jail' },
  street('Chapel Close', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  guild('Lamplighters'),
  street('Abbey Green', 'pink', 140, 100, [10, 50, 150, 450, 625, 750]),
  street('Cloister Way', 'pink', 160, 100, [12, 60, 180, 500, 700, 900]),
  inn('The Owl'),
  street('Fishmarket', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  { kind: 'chest', name: 'Community Chest' },
  street('Ferry Steps', 'orange', 180, 100, [14, 70, 200, 550, 750, 950]),
  street('Quayside', 'orange', 200, 100, [16, 80, 220, 600, 800, 1000]),
  { kind: 'parking', name: 'Free Parking' },
  street('Rook Street', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  { kind: 'chance', name: 'Chance' },
  street('Magpie Market', 'red', 220, 150, [18, 90, 250, 700, 875, 1050]),
  street('Raven Hill', 'red', 240, 150, [20, 100, 300, 750, 925, 1100]),
  inn('The Falcon'),
  street('Guildhall Square', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  street('Mint Street', 'yellow', 260, 150, [22, 110, 330, 800, 975, 1150]),
  guild('Conduit'),
  street('Goldsmiths Row', 'yellow', 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { kind: 'gotojail', name: 'Go to Jail' },
  street('Bishops Gate', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street('Castle Mews', 'green', 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { kind: 'chest', name: 'Community Chest' },
  street('Heron Parade', 'green', 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  inn('The Jackdaw'),
  { kind: 'chance', name: 'Chance' },
  street('Kingsmead', 'navy', 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { kind: 'tax', name: 'Luxury Tax', amount: 100 },
  street('Crown Terrace', 'navy', 400, 200, [50, 200, 600, 1400, 1700, 2000]),
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

export function deedAt(space: number): Deed | null {
  const s = BOARD[space];
  return s && (s.kind === 'street' || s.kind === 'inn' || s.kind === 'guild') ? s : null;
}

export function streetAt(space: number): Street | null {
  const s = BOARD[space];
  return s?.kind === 'street' ? s : null;
}

/** Every space you can own, in board order. */
export const DEEDS: readonly number[] = BOARD.flatMap((s, i) => (deedAt(i) ? [i] : []));
export const INNS: readonly number[] = BOARD.flatMap((s, i) => (s.kind === 'inn' ? [i] : []));
export const GUILDS: readonly number[] = BOARD.flatMap((s, i) => (s.kind === 'guild' ? [i] : []));

/** The spaces of one colour group, in board order. */
export function groupSpaces(group: Group): number[] {
  return BOARD.flatMap((s, i) => (s.kind === 'street' && s.group === group ? [i] : []));
}

/** The spaces that share a deed's set: its colour group, the four inns, or the two guilds. */
export function setOf(space: number): number[] {
  const deed = deedAt(space);
  if (!deed) return [];
  if (deed.kind === 'street') return groupSpaces(deed.group);
  return [...(deed.kind === 'inn' ? INNS : GUILDS)];
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
