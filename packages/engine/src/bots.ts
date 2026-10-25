import type { BotLevel } from './protocol';
import { createRng, type Rng } from './rng';

/**
 * How computer players vary their play by level (Lesia, 2026-10-24: "too fast and too good…
 * a bit more randomized but still can win"). Every game's bot ranks its choices as before and
 * then asks these helpers, so an Easy bot often settles for a worse move, a Normal one now and
 * then, and a Hard one almost never.
 */

export const BOT_LEVELS = ['easy', 'normal', 'hard'] as const satisfies readonly BotLevel[];

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** A new bot's level, and any bot's saved before levels existed. */
export const DEFAULT_BOT_LEVEL: BotLevel = 'normal';

/** How likely a bot is to get one decision wrong (a careless guess, a weaker play). */
const SLIP: Record<BotLevel, number> = { easy: 0.3, normal: 0.12, hard: 0.03 };

/** How quickly a bot's taste falls off from its best choice to the next ones down. */
const DECAY: Record<BotLevel, number> = { easy: 0.65, normal: 0.35, hard: 0.06 };

/** True when a bot at this level slips up on this decision. */
export function botSlips(level: BotLevel, rng: Rng, scale = 1): boolean {
  return rng.next() < SLIP[level] * scale;
}

/**
 * One of `items`, usually a good one: ranked by `score` (highest first), the best is the most
 * likely and each one down is less likely by the level's decay. Throws on an empty list.
 */
export function botChoose<T>(
  items: readonly T[],
  score: (x: T) => number,
  level: BotLevel,
  rng: Rng,
): T {
  if (items.length === 0) throw new RangeError('botChoose() from an empty list');
  const ranked = items
    .map((x, i) => ({ x, s: score(x), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i);
  const d = DECAY[level];
  let total = 0;
  const weights = ranked.map((_, k) => (total += d ** k));
  const r = rng.next() * total;
  return ranked[weights.findIndex((w) => r < w)]?.x ?? ranked[0]!.x;
}

/**
 * Randomness fixed by `key` rather than drawn from the session: for a choice a bot makes over
 * several moves (Codenames suggests a word, then guesses it), so it comes out the same each time
 * it's asked. Same key, same draws.
 */
export function botFate(key: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return createRng(h >>> 0);
}
