import type { Puzzle } from './grid';
/** Answers never enter the browser bundle. */
export const PUZZLES: Puzzle[] = [];

export function generatePuzzle(): Puzzle {
  throw new Error('Puzzles are generated on the server.');
}

export function withDifficulty(puzzle: Puzzle): Puzzle {
  return puzzle;
}
