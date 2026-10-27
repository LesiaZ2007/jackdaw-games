import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { findMistake, nextStep } from './hints';
import { makePuzzle, MAX_SIZE, MIN_SIZE, solve } from './puzzle';

const answerSet = (p: ReturnType<typeof makePuzzle>) =>
  new Set(solve(p, 1)[0]!.map((c, r) => r * p.size + c));

/** Follows hints from an empty board to the end; returns how many had to give the king away. */
function walk(p: ReturnType<typeof makePuzzle>): number {
  const answer = answerSet(p);
  const marks = Array<number>(p.size * p.size).fill(0);
  let given = 0;
  for (let step = 0; step < 400; step++) {
    if ([...answer].every((k) => marks[k] === 2)) return given;
    const h = nextStep(p, marks);
    expect(h.cells.length).toBeGreaterThan(0);
    const king = /goes here/.test(h.text);
    if (/^Of the squares left/.test(h.text)) given++;
    for (const c of h.cells) {
      expect(marks[c]).toBe(0);
      expect(answer.has(c)).toBe(king);
      marks[c] = king ? 2 : 1;
    }
  }
  throw new Error('hints went round in circles');
}

describe('hints', () => {
  it('only ever say true things, and walk a puzzle to the end', () => {
    let given = 0;
    let kings = 0;
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      const rng = createRng(size * 13);
      for (let k = 0; k < 4; k++) {
        given += walk(makePuzzle(size, rng));
        kings += size;
      }
    }
    // Nearly every king is found by reasoning rather than handed over.
    expect(given / kings).toBeLessThan(0.1);
  });

  it('find a wrong king or a crossed-out king square', () => {
    const p = makePuzzle(6, createRng(4));
    const answer = answerSet(p);
    const marks = Array<number>(36).fill(0);
    expect(findMistake(p, marks)).toBeNull();
    const wrong = [...Array(36).keys()].find((i) => !answer.has(i))!;
    marks[wrong] = 2;
    expect(findMistake(p, marks)!.cells).toContain(wrong);
    marks[wrong] = 0;
    const right = [...answer][0]!;
    marks[right] = 1;
    expect(findMistake(p, marks)!.text).toMatch(/a king belongs here/);
    expect(nextStep(p, marks).text).toMatch(/^First, put this right/);
  });
});
