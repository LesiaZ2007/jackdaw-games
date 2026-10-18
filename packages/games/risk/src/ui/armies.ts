import { NEUTRAL } from '../board';

/**
 * Each seat's army colour, in seat order: six heraldic tinctures far enough apart to tell at a
 * glance, so whose land is whose reads across the whole map. (Players' own tints are muted and
 * close together; their crest tokens keep them.) Seats follow the lobby's order, so the lobby can
 * show each seat its colour before the game starts.
 */
export const ARMIES = ['gules', 'azure', 'vert', 'or', 'purpure', 'tenne'] as const;
export type Army = (typeof ARMIES)[number];

export const ARMY_NAME: Record<Army, string> = {
  gules: 'Red',
  azure: 'Blue',
  vert: 'Green',
  or: 'Gold',
  purpure: 'Purple',
  tenne: 'Orange',
};

/** The tincture of a seat's armies (null for the neutral army or someone not seated). */
export function armyOf(pid: string, seats: readonly string[]): Army | null {
  const i = seats.indexOf(pid);
  return pid === NEUTRAL || i < 0 ? null : ARMIES[i % ARMIES.length]!;
}

/** A seat's army colour as CSS (the neutral army is grey). */
export function armyColour(pid: string, seats: readonly string[]): string {
  const a = armyOf(pid, seats);
  return a ? `var(--${a})` : 'var(--rule)';
}
