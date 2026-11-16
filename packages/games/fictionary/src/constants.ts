/**
 * Fictionary's numbers, apart from the rules so screens can use them without importing the bank
 * (which must never reach a browser).
 */

export const DECKS = ['Mixed', 'Facts', 'Words'] as const;
export const LENGTHS = ['Short', 'Standard', 'Long'] as const;
export const TIMERS = ['Relaxed', 'Quick', 'Off'] as const;
export const TABS = ['Chooser picks', 'Random'] as const;

/** Cards in Round 1 and Round 2, by length; the Final Fib is always one card. */
export const ROUND_CARDS: Record<(typeof LENGTHS)[number], [number, number]> = {
  Short: [2, 2],
  Standard: [3, 3],
  Long: [4, 4],
};
/** Seconds to write a lie and to pick an answer, by timer. */
export const TIMES: Record<(typeof TIMERS)[number], { write: number; pick: number } | null> = {
  Relaxed: { write: 90, pick: 40 },
  Quick: { write: 50, pick: 25 },
  Off: null,
};
/** The chooser always has a timer, so nobody waits on a tab forever. */
export const CHOOSE_MS = 20_000;
/** Once someone who's done starts the countdown, the rest have this long. */
export const NUDGE_MS = 20_000;
/** Points: finding the truth, each player your lie fooled, each like. Times the round. */
export const TRUTH_POINTS = 1000;
export const FOOL_POINTS = 500;
export const LIKE_POINTS = 100;
/** Longest lie, in characters. */
export const LIE_MAX = 40;
/** At least this many answers to pick from: house lies fill up to it. */
export const MIN_ANSWERS = 4;
/** The reveal: one beat per lie that fooled someone, a longer one for the truth, then scores. */
export const LIE_BEAT_MS = 3_400;
export const TRUTH_BEAT_MS = 5_000;
export const SCORES_BEAT_MS = 5_000;
/** The Final Fib's reveal holds the scores a little longer. */
export const FINAL_EXTRA_MS = 2_000;
/** Tabs offered to the chooser. */
export const OFFER = 3;
