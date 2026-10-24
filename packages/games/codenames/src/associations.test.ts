import { describe, expect, it } from 'vitest';
import { HINTS, THEMES, UNKNOWN_TAGS } from './associations';
import { clueOnBoard, clueProblem } from './rules';
import { WORDS } from './words';

const BOARD = new Set(WORDS);

/** Clues that only happen to start or end with a board word's letters (checked by hand). */
const CHANCE = new Set(
  `ELEPHANT FAIRYTALE VEGETABLE BATHROOM OFFICE INVOICE EDEN GRAIL COWL SOAR COMBINATION ACORN
  ROWING COCONUT OINK POLICE WOODEN HEAT TINY HARD OPEN VIKING JAPAN BATTLE LOVE CAR PLUMBER
  SOCKET SATIN RINK SLIME STOCKING CYGNET BUGLE HOWL`.split(/\s+/),
);

/**
 * Why a clue a bot gives would be unfair: not a legal clue, a board word (or its plural), or a
 * compound built on one (SNOWMAN for SNOW), which Codenames doesn't allow.
 */
function unfair(clue: string): string[] {
  const out: string[] = [];
  const problem = clueProblem(clue);
  if (problem) out.push(problem);
  if (clueOnBoard(clue, WORDS)) out.push('on the board');
  if (CHANCE.has(clue)) return out;
  const bare = clue.replace(/['-]/g, '');
  // A board word at either end of the clue, or the clue at either end of a board word. (A word
  // buried in the middle, like CHEST in ORCHESTRA, is chance, not a compound.)
  for (const w of WORDS) {
    if (bare.startsWith(w) || bare.endsWith(w)) out.push(`built on ${w}`);
    else if (bare.length >= 3 && (w.startsWith(bare) || w.endsWith(bare))) out.push(`part of ${w}`);
  }
  return out;
}

describe('the bots’ word table', () => {
  it('only lists words that are in the game', () => {
    const missing = [
      ...THEMES.flatMap((t) =>
        t.members.filter((m) => !BOARD.has(m)).map((m) => `${t.names[0]}: ${m}`),
      ),
      ...Object.keys(HINTS).filter((w) => !BOARD.has(w)),
    ];
    expect(missing).toEqual([]);
  });

  it('gives only fair, legal clues', () => {
    const bad = [
      ...THEMES.map((t) => [t.names[0]!, unfair(t.names[0]!)] as const),
      ...Object.entries(HINTS).map(([w, h]) => [`${w} -> ${h}`, unfair(h)] as const),
    ].filter(([, why]) => why.length > 0);
    expect(bad).toEqual([]);
  });

  it('never reads a theme name as a board word', () => {
    expect(THEMES.flatMap((t) => t.names).filter((n) => BOARD.has(n))).toEqual([]);
  });

  it('has a hint for every word, each used once and never a theme name', () => {
    expect(WORDS.filter((w) => !HINTS[w])).toEqual([]);
    const hints = Object.values(HINTS);
    expect(hints.filter((h, i) => hints.indexOf(h) !== i)).toEqual([]);
    const names = new Set(THEMES.flatMap((t) => t.names));
    expect(hints.filter((h) => names.has(h))).toEqual([]);
  });

  it('tags words only with themes that exist', () => {
    expect(UNKNOWN_TAGS).toEqual([]);
  });

  it('keeps theme names apart', () => {
    const names = THEMES.flatMap((t) => t.names);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it('has themes with room for a clue of two or more', () => {
    for (const t of THEMES) expect(t.members.length, t.names[0]).toBeGreaterThanOrEqual(4);
    for (const t of THEMES) expect(new Set(t.members).size, t.names[0]).toBe(t.members.length);
  });
});
