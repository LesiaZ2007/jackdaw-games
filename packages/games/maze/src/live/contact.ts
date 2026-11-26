/**
 * Contact between chompers in the live (Contact) maze, decided on the server (docs/maze/LIVE.md,
 * "Contact rules", Lesia 2026-11-26). Values are the starting point; tune in playtest.
 */

/** Chompers whose centers are closer than this (in tiles) touch. */
export const TOUCH_TILES = 0.8;
/** A bump costs both chompers this much. */
export const BUMP_COST = 50;
/** After a bump, neither chomper can bump or be eaten again for this long. */
export const BUMP_SHIELD_MS = 1500;
/** Being eaten costs this much (never below 0; the caller caps). */
export const EAT_COST = 200;
/** Eating another chomper scores this much. */
export const EAT_GAIN = 400;

export interface Contender {
  id: string;
  x: number;
  y: number;
  hunting: boolean;
  /** Dying, spawn-shielded or bump-shielded until then: ignored. */
  immuneUntil: number;
  score: number;
}

export type ContactEvent =
  | { kind: 'bump'; a: string; b: string; cost: number }
  | { kind: 'eat'; by: string; eaten: string; cost: number; gain: number };

/**
 * Every touching pair, in id order, each at most once. Exactly one hunting: the hunter eats the
 * other; otherwise a bump. Costs are nominal; the caller caps each score at 0.
 */
export function resolveContacts(cs: readonly Contender[], tMs: number): ContactEvent[] {
  const live = cs.filter((c) => c.immuneUntil <= tMs).sort((a, b) => (a.id < b.id ? -1 : 1));
  const out: ContactEvent[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) >= TOUCH_TILES) continue;
      if (a.hunting !== b.hunting) {
        const [by, eaten] = a.hunting ? [a, b] : [b, a];
        out.push({ kind: 'eat', by: by.id, eaten: eaten.id, cost: EAT_COST, gain: EAT_GAIN });
      } else {
        out.push({ kind: 'bump', a: a.id, b: b.id, cost: BUMP_COST });
      }
    }
  }
  return out;
}
