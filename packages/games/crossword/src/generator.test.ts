import { describe, it, expect } from 'vitest';
import { createRng } from '@jackdaw/engine';
import { generatePuzzle, withDifficulty } from './generator';
import { gridClues, type Puzzle } from './grid';
import { WORD_BANK, puzzleWords, type PuzzleDifficulty } from './bank';
import { CHALLENGE_WORDS, HARD_CLUES } from './challenge';
import { PUZZLES } from './puzzles';
function validate(p: Puzzle, size: number, difficulty: PuzzleDifficulty) {
  const clues = gridClues(p.rows, p.across, p.down),
    flat = p.rows.join('');
  const vocabulary = puzzleWords(size, difficulty);
  expect(p.rows).toHaveLength(size);
  expect(p.rows.every((r) => r.length === size)).toBe(true);
  const answers = clues.map((c) => c.cells.map((i) => flat[i]).join(''));
  expect(new Set(answers).size).toBe(answers.length);
  expect(clues.length).toBeGreaterThanOrEqual(size === 5 ? 3 : Math.min(size, 20));
  for (const c of clues)
    expect(vocabulary.find((w) => w.answer === c.cells.map((i) => flat[i]).join(''))?.clue).toBe(
      c.text,
    );
  const white = new Set([...flat].flatMap((c, i) => (c === '#' ? [] : [i])));
  for (const i of white) expect(clues.some((c) => c.cells.includes(i))).toBe(true);
  const seen = new Set([white.values().next().value!]);
  for (const i of seen) {
    const r = Math.floor(i / size),
      c = i % size;
    for (const [y, x] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ])
      if (y! >= 0 && y! < size && x! >= 0 && x! < size && white.has(y! * size + x!))
        seen.add(y! * size + x!);
  }
  expect(seen.size).toBe(white.size);
}
describe('generated original crosswords', () => {
  it('contains a broad original word and clue vocabulary', () => {
    expect(WORD_BANK.length).toBeGreaterThan(350);
    expect(CHALLENGE_WORDS.length).toBeGreaterThan(100);
    for (const w of [...WORD_BANK, ...CHALLENGE_WORDS]) {
      expect(w.answer).toMatch(/^[A-Z]{3,15}$/);
      expect(w.clue.length).toBeGreaterThan(3);
    }
  });
  it('never gives the answer away inside its own clue', () => {
    const named = PUZZLES.flatMap((p) => {
      const flat = p.rows.join('');
      return gridClues(p.rows, p.across, p.down).map((c) => ({
        answer: c.cells.map((i) => flat[i]).join(''),
        clue: c.text,
      }));
    });
    const all = [
      ...WORD_BANK,
      ...CHALLENGE_WORDS,
      ...Object.entries(HARD_CLUES).map(([answer, clue]) => ({ answer, clue })),
      ...named,
    ];
    const giveaways = all.filter((w) =>
      w.clue
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .includes(w.answer.length > 4 ? w.answer.slice(0, -1) : w.answer),
    );
    expect(giveaways).toEqual([]);
  });
  for (const size of [5, 9, 13, 17, 21, 31])
    for (const difficulty of ['easy', 'normal', 'hard'] as const)
      it(
        size + ' × ' + size + ' ' + difficulty + ' is connected and fully clued',
        () => {
          validate(generatePuzzle(size, createRng(13), difficulty), size, difficulty);
        },
        20000,
      );
  it('uses different clues and vocabulary for Hard', () => {
    expect(puzzleWords(13, 'easy').some((w) => w.answer === 'HYPOTHESIS')).toBe(false);
    expect(puzzleWords(13, 'hard').find((w) => w.answer === 'PEN')?.clue).toBe(HARD_CLUES.PEN);
    expect(puzzleWords(13, 'normal').some((w) => w.answer === 'HYPOTHESIS')).toBe(true);
    const hard = withDifficulty(PUZZLES[0]!, 'hard');
    expect(hard.rows).toEqual(PUZZLES[0]!.rows);
    expect(hard.across).not.toEqual(PUZZLES[0]!.across);
  });
  it('is deterministic but varies across seeds', () => {
    expect(generatePuzzle(9, createRng(12), 'hard')).toEqual(
      generatePuzzle(9, createRng(12), 'hard'),
    );
    const layouts = new Set(
      Array.from({ length: 8 }, (_, seed) => generatePuzzle(9, createRng(seed)).rows.join('')),
    );
    expect(layouts.size).toBeGreaterThanOrEqual(7);
  }, 20000);
});
