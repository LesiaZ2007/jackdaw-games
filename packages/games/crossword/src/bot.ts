import { botChoose, botSlips, type BotContext } from '@jackdaw/engine';
import { CLUE_KNOWLEDGE } from '#clue-bank';
import type { CrosswordView, CrosswordAction } from './rules';
const key = (clue: string) =>
  clue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
let vocabulary: Map<string, string[]> | undefined;
function answers(text: string, length: number): string[] {
  if (!vocabulary) {
    vocabulary = new Map();
    for (const w of CLUE_KNOWLEDGE) {
      const k = key(w.clue);
      const known = vocabulary.get(k) ?? [];
      if (!known.includes(w.answer)) known.push(w.answer);
      vocabulary.set(k, known);
    }
  }
  return (vocabulary.get(key(text)) ?? []).filter((w) => w.length === length);
}
/** Think from the seat's own clue sheet and crossings. No state, puzzle rows or opponent letters. */
export function crosswordBot(
  ctx: BotContext<CrosswordView, CrosswordView>,
): CrosswordAction | null {
  const { view: v, playerId: me, now, level, rng } = ctx;
  if (v.finishedAt !== null || !v.players.includes(me)) return null;
  const since = v.cursors[me]?.at ?? v.startedAt;
  const busy = new Set<number>();
  if (v.mode === 'cooperative')
    for (const [id, cursor] of Object.entries(v.cursors))
      if (id !== me && now - cursor.at < 5000) {
        const clue = v.clues.find(
          (c) => c.direction === cursor.direction && c.cells.includes(cursor.cell),
        );
        for (const cell of clue?.cells ?? []) busy.add(cell);
      }
  const candidates = v.clues.flatMap((clue) => {
    const known = answers(clue.text, clue.cells.length);
    if (!known.length) return [];
    const word = [...known].sort(
      (a, b) =>
        clue.cells.filter((cell, i) => v.letters[cell] === b[i]).length -
        clue.cells.filter((cell, i) => v.letters[cell] === a[i]).length,
    )[0]!;
    const wrong = clue.cells.filter(
      (cell, i) => !v.revealed.includes(cell) && !busy.has(cell) && v.letters[cell] !== word[i],
    );
    if (!wrong.length) return [];
    const occupied =
      v.mode === 'cooperative' &&
      Object.entries(v.cursors).some(
        ([id, cursor]) =>
          id !== me &&
          now - cursor.at < 5000 &&
          cursor.direction === clue.direction &&
          clue.cells.includes(cursor.cell),
      );
    if (occupied) return [];
    const own = v.cursors[me];
    const continuing = !!own && own.direction === clue.direction && clue.cells.includes(own.cell);
    return [
      {
        clue,
        word,
        wrong,
        continuing,
        score:
          clue.cells.filter((cell, i) => v.letters[cell] === word[i]).length * 4 -
          clue.cells.length * 0.2,
      },
    ];
  });
  if (!candidates.length) return null;
  const continuing = candidates.filter((c) => c.continuing);
  const picked = botChoose(continuing.length ? continuing : candidates, (c) => c.score, level, rng);
  const think = continuing.length
    ? 0
    : { easy: 7000, normal: 4200, hard: 2200 }[level] +
      picked.word.length * { easy: 400, normal: 180, hard: 80 }[level];
  if (now - since < think) return null;
  const ownMistake = picked.wrong.find((cell) => v.letters[cell] && v.authors[cell] === me);
  const cell = ownMistake ?? picked.wrong.find((cell) => !v.letters[cell]) ?? picked.wrong[0]!;
  let letter = picked.word[picked.clue.cells.indexOf(cell)]!;
  // Occasional typos are corrected from the same visible clue on later moves.
  if (!v.letters[cell] && botSlips(level, rng))
    letter = rng.pick([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((c) => c !== letter));
  return {
    type: 'edit',
    cell,
    letter,
    revision: v.revisions[cell]!,
    direction: picked.clue.direction,
  };
}
