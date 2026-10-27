import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { findMistake, nextStep } from './hints';
import { BOARD_SIZES, makePuzzle, MOON, solve, SUN } from './puzzle';

describe('hints', () => {
  it('walk a whole puzzle by reasoning, each step about empty squares', () => {
    for (const size of BOARD_SIZES) {
      const rng = createRng(size * 7);
      for (let k = 0; k < 4; k++) {
        const p = makePuzzle(size, rng);
        const answer = solve(p, 1)[0]!;
        const marks = Array<number>(size * size).fill(0);
        for (let step = 0; step < size * size; step++) {
          if (p.given.every((g, i) => g || marks[i])) break;
          const h = nextStep(p, marks);
          expect(h.text).not.toMatch(/^This square is/);
          expect(h.cells.length).toBeGreaterThan(0);
          for (const c of h.cells) {
            expect(p.given[c] || marks[c]).toBe(0);
            marks[c] = answer[c]!;
          }
        }
        expect(p.given.map((g, i) => g || marks[i])).toEqual(answer);
      }
    }
  });

  it('explain themselves in words', () => {
    const p = { size: 4, given: [SUN, SUN, 0, 0, ...Array(12).fill(0)], signs: [] };
    const h = nextStep(p, Array(16).fill(0));
    expect(h.text).toMatch(/Two suns side by side/);
    expect(h.cells).toEqual([2]);
    expect(h.area).toEqual([0, 1]);
  });

  it('find a wrong mark, and say so before the next step', () => {
    const p = makePuzzle(6, createRng(5));
    const answer = solve(p, 1)[0]!;
    const marks = Array<number>(36).fill(0);
    expect(findMistake(p, marks)).toBeNull();
    const open = p.given.findIndex((g) => !g);
    marks[open] = answer[open] === SUN ? MOON : SUN;
    expect(findMistake(p, marks)!.cells).toEqual([open]);
    expect(nextStep(p, marks).text).toMatch(/^First, put this right/);
  });
});
