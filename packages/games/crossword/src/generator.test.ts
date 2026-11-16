import { describe, it, expect } from 'vitest';
import { createRng } from '@jackdaw/engine';
import { generatePuzzle } from './generator';
import { gridClues } from './grid';
import { WORD_BANK } from './bank';
describe('generated original crosswords', () => {
  it('has hundreds of unique, clued answer words', () => {
    expect(WORD_BANK.length).toBeGreaterThan(350);
    expect(new Set(WORD_BANK.map((w) => w.answer)).size).toBe(WORD_BANK.length);
    for (const w of WORD_BANK) {
      expect(w.answer).toMatch(/^[A-Z]{3,8}$/);
      expect(w.clue.length).toBeGreaterThan(3);
    }
  });
  for (const size of [5, 9, 13])
    for (let seed = 1; seed <= 4; seed++)
      it(
        size + ' × ' + size + ', seed ' + seed + ' has connected, valid, unique entries',
        () => {
          const p = generatePuzzle(size, createRng(seed));
          const clues = gridClues(p.rows, p.across, p.down);
          const flat = p.rows.join('');
          expect(p.rows).toHaveLength(size);
          expect(p.rows.every((r) => r.length === size)).toBe(true);
          const answers = clues.map((c) => c.cells.map((i) => flat[i]).join(''));
          expect(new Set(answers).size).toBe(answers.length);
          expect(clues.length).toBeGreaterThanOrEqual(size === 5 ? 3 : size === 9 ? 7 : 13);
          for (const c of clues) {
            const word = c.cells.map((i) => flat[i]).join('');
            expect(WORD_BANK.find((w) => w.answer === word)?.clue).toBe(c.text);
          }
          const white = [...flat].flatMap((c, i) => (c === '#' ? [] : [i]));
          for (const cell of white) expect(clues.some((c) => c.cells.includes(cell))).toBe(true);
          const seen = new Set([white[0]!]);
          let prior = 0;
          while (seen.size !== prior) {
            prior = seen.size;
            for (const i of seen)
              for (const j of white)
                if (
                  Math.abs(i - j) === size ||
                  (Math.floor(i / size) === Math.floor(j / size) && Math.abs(i - j) === 1)
                )
                  seen.add(j);
          }
          expect(seen.size).toBe(white.length);
        },
        15000,
      );
  it('is deterministic for a seed and yields many different layouts', () => {
    const signatures = new Set<string>();
    for (let seed = 30; seed < 42; seed++)
      signatures.add(generatePuzzle(9, createRng(seed)).rows.join(''));
    expect(signatures.size).toBeGreaterThanOrEqual(10);
    expect(generatePuzzle(5, createRng(7))).toEqual(generatePuzzle(5, createRng(7)));
  }, 15000);
});
