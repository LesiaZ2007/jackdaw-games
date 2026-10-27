import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { findMistake, nextStep } from './hints';
import { makePuzzle, solve } from './puzzle';

describe('hints', () => {
  it('lead the line square by square to the end', () => {
    const p = makePuzzle(6, createRng(8));
    const answer = solve(p, 1, Infinity)![0]!;
    const path: number[] = [];
    expect(nextStep(p, path)).toMatchObject({ text: 'Start on 1.', cells: [p.dots[0]] });
    while (path.length < answer.length) {
      const h = nextStep(p, path);
      expect(h.cells).toEqual([answer[path.length]]);
      path.push(h.cells[0]!);
    }
    expect(nextStep(p, path).text).toBe('The line is finished.');
  });

  it('give a reason when the way on is forced', () => {
    const p = makePuzzle(6, createRng(9));
    const answer = solve(p, 1, Infinity)![0]!;
    const reasons = answer.slice(1).map((_, i) => nextStep(p, answer.slice(0, i + 1)).text);
    expect(reasons.some((t) => /only one way on|cut off/.test(t))).toBe(true);
  });

  it('find where the line went wrong', () => {
    const p = makePuzzle(6, createRng(10));
    const answer = solve(p, 1, Infinity)![0]!;
    expect(findMistake(p, answer.slice(0, 5))).toBeNull();
    const wrong = [...answer.slice(0, 3), 99];
    expect(findMistake(p, wrong)!.cells).toEqual([99]);
    expect(nextStep(p, wrong).text).toMatch(/^First, put this right/);
  });
});
