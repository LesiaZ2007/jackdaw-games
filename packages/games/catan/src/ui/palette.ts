import type { Resource, Terrain } from '../types';

/**
 * Catan's piece colours, in seat order (the classic four, then green and brown at five and six).
 * The colours themselves are tokens at the top of catan.css.
 */
export const SEAT_COLOURS = ['red', 'blue', 'white', 'orange', 'green', 'brown'] as const;
export type SeatColour = (typeof SEAT_COLOURS)[number];

export const SEAT_NAMES: Record<SeatColour, string> = {
  red: 'Red',
  blue: 'Blue',
  white: 'White',
  orange: 'Orange',
  green: 'Green',
  brown: 'Brown',
};

export function seatColourOf(pid: string, seats: readonly string[]): SeatColour | null {
  const i = seats.indexOf(pid);
  return i < 0 ? null : SEAT_COLOURS[i % SEAT_COLOURS.length]!;
}

/** The CSS colour of a seat's pieces. */
export const seatColour = (pid: string, seats: readonly string[]): string => {
  const c = seatColourOf(pid, seats);
  return c ? `var(--ctn-pc-${c})` : 'var(--rule)';
};

export const TERRAIN_OF: Record<Resource, Terrain> = {
  lumber: 'forest',
  brick: 'hills',
  wool: 'pasture',
  grain: 'fields',
  ore: 'mountains',
};

export const RESOURCE_NAME: Record<Resource, string> = {
  lumber: 'Lumber',
  brick: 'Brick',
  wool: 'Wool',
  grain: 'Grain',
  ore: 'Ore',
};
