import { z } from 'zod';

/**
 * Who sits at the table and what the board looks like, by player count. 5 to 10 players use the
 * official rules exactly. 11 to 15 players use house rules, which the host can adjust: the
 * official game stops at 10 (Lesia's group plays bigger), so these are suggestions to confirm
 * with the group.
 */

export type Team = 'liberal' | 'fascist';
export type Role = 'liberal' | 'fascist' | 'hitler';
export type Policy = 'liberal' | 'fascist';
export type Power = 'peek' | 'investigate' | 'special' | 'execute';

export const OFFICIAL_MAX = 10;

/** The Fascist team (Fascists plus Hitler) by player count, official at 5–10. */
const OFFICIAL_TEAM: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 4, 10: 4 };

/**
 * House rules for 11–15: the official pattern (the Fascist team is just under half the table)
 * carried on, so Liberals always keep a clear majority: 6 to 5, 7 to 5, 7 to 6, 8 to 6, 8 to 7.
 */
export const HOUSE_TEAM: Record<number, number> = { 11: 5, 12: 5, 13: 6, 14: 6, 15: 7 };

export const optionsSchema = z.object({
  /** House rules only (11+ players). 0 means the suggested size for the count. */
  fascistTeam: z
    .number()
    .int()
    .min(0)
    .max(7)
    .describe('Fascist team at 11+ players (0 = suggested)'),
  /** House rules only (11+ players): more cards, so the deck reshuffles less often. */
  bigDeck: z.boolean().describe('Bigger policy deck at 11+ players'),
});
export type ShOptions = z.infer<typeof optionsSchema>;

export const defaultOptions = (): ShOptions => ({ fascistTeam: 0, bigDeck: true });

/** Fascists plus Hitler. */
export function fascistTeamSize(n: number, o: ShOptions): number {
  if (n <= OFFICIAL_MAX) return OFFICIAL_TEAM[n] ?? 2;
  return o.fascistTeam > 0 ? o.fascistTeam : (HOUSE_TEAM[n] ?? Math.floor((n - 1) / 2));
}

/**
 * The policy deck: 6 Liberal and 11 Fascist officially. The bigger house deck for 11+ keeps the
 * official share of Liberal cards (about a third) but adds cards, because a bigger table runs
 * more governments before anyone wins and a small deck reshuffles every few rounds, which
 * makes counting the discards too easy: 7 + 12 for 11–12 players, 8 + 13 for 13–15.
 */
export function deckFor(n: number, o: ShOptions): { liberal: number; fascist: number } {
  if (n <= OFFICIAL_MAX || !o.bigDeck) return { liberal: 6, fascist: 11 };
  return n <= 12 ? { liberal: 7, fascist: 12 } : { liberal: 8, fascist: 13 };
}

/**
 * The presidential power for each Fascist policy slot (1st to 5th; the 6th wins). 5–6 players:
 * peek at 3. 7–8: investigate at 2, special election at 3. 9 and up: investigate at 1 and 2,
 * special election at 3. Every board executes at 4 and 5.
 */
export function boardFor(n: number): (Power | null)[] {
  if (n <= 6) return [null, null, 'peek', 'execute', 'execute'];
  if (n <= 8) return [null, 'investigate', 'special', 'execute', 'execute'];
  return ['investigate', 'investigate', 'special', 'execute', 'execute'];
}

export const LIBERAL_WIN = 5;
export const FASCIST_WIN = 6;
/** Fascist policies after which electing Hitler chancellor wins for the Fascists. */
export const HITLER_ZONE = 3;
/** Fascist policies after which a government may veto. */
export const VETO_AT = 5;

/** Error text for options that can't work at this count, or null. */
export function validateShOptions(o: ShOptions, n: number): string | null {
  if (n <= OFFICIAL_MAX) return null;
  const team = fascistTeamSize(n, o);
  if (team < 2) return 'The Fascist team needs at least one Fascist and Hitler.';
  if (n - team <= team)
    return `With ${n} players the Liberals must outnumber the Fascist team: at most ${Math.floor((n - 1) / 2)} Fascists including Hitler.`;
  return null;
}

/** The deal for this many players, for the lobby preview. */
export function lineupFor(n: number, o: ShOptions) {
  const team = fascistTeamSize(n, o);
  return {
    liberals: n - team,
    fascists: team - 1,
    house: n > OFFICIAL_MAX,
    deck: deckFor(n, o),
    board: boardFor(n),
    hitlerKnows: n <= 6,
  };
}
