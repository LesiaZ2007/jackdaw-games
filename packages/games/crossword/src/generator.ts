import type { Rng } from '@jackdaw/engine';
import { gridClues, type Puzzle } from './grid';
import { puzzleWords, type PuzzleDifficulty } from './bank';
import { HARD_CLUES } from './challenge';
interface Placement {
  answer: string;
  clue: string;
  row: number;
  col: number;
  down: boolean;
}
/** Generate a connected crossword; index matching letters instead of scanning every giant grid cell. */
export function generatePuzzle(
  size: number,
  rng: Rng,
  difficulty: PuzzleDifficulty = 'normal',
): Puzzle {
  let best: Placement[] = [];
  let bestGrid: string[][] = [];
  const words = puzzleWords(size, difficulty);
  const attempts = size > 13 ? 6 : 10;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const grid = Array.from({ length: size }, () => Array<string>(size).fill('#'));
    const axes = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const positions = new Map<string, number[]>();
    const placed: Placement[] = [];
    const used = new Set<string>();
    const put = (p: Placement) => {
      for (let k = 0; k < p.answer.length; k++) {
        const r = p.row + (p.down ? k : 0),
          c = p.col + (p.down ? 0 : k),
          letter = p.answer[k]!;
        if (grid[r]![c] === '#') {
          const cells = positions.get(letter) ?? [];
          cells.push(r * size + c);
          positions.set(letter, cells);
        }
        grid[r]![c] = letter;
        axes[r]![c]! |= p.down ? 2 : 1;
      }
      placed.push(p);
      used.add(p.answer);
    };
    const maxLength = Math.min(size, difficulty === 'easy' ? 8 : difficulty === 'hard' ? 15 : 12);
    const first = rng.pick(
      words.filter((w) => w.answer.length >= Math.min(5, size) && w.answer.length <= maxLength),
    );
    put({
      ...first,
      row: Math.floor(size / 2),
      col: Math.floor((size - first.answer.length) / 2),
      down: false,
    });
    const get = (r: number, c: number) =>
      r < 0 || c < 0 || r >= size || c >= size ? '#' : grid[r]![c]!;
    for (let pass = 0; pass < 3; pass++) {
      const order = rng
        .shuffle(words)
        .map((word) => ({
          word,
          rank:
            difficulty === 'easy'
              ? rng.next()
              : Math.min(word.answer.length, difficulty === 'hard' ? 15 : 10) +
                rng.next() * (difficulty === 'hard' ? 2 : 6),
        }))
        .sort((a, b) => b.rank - a.rank);
      for (const { word } of order) {
        if (used.has(word.answer)) continue;
        let chosen: { p: Placement; score: number } | undefined;
        for (let k = 0; k < word.answer.length; k++)
          for (const cell of positions.get(word.answer[k]!) ?? []) {
            const r = Math.floor(cell / size),
              c = cell % size;
            for (const down of [false, true]) {
              const row = r - (down ? k : 0),
                col = c - (down ? 0 : k),
                dr = down ? 1 : 0,
                dc = down ? 0 : 1;
              const endR = row + dr * (word.answer.length - 1),
                endC = col + dc * (word.answer.length - 1);
              if (
                row < 0 ||
                col < 0 ||
                endR >= size ||
                endC >= size ||
                get(row - dr, col - dc) !== '#' ||
                get(endR + dr, endC + dc) !== '#'
              )
                continue;
              let crosses = 0,
                valid = true;
              for (let j = 0; j < word.answer.length; j++) {
                const y = row + dr * j,
                  x = col + dc * j,
                  old = get(y, x);
                if (old !== '#') {
                  if (old !== word.answer[j] || axes[y]![x]! & (down ? 2 : 1)) {
                    valid = false;
                    break;
                  }
                  crosses++;
                } else if (get(y - dc, x - dr) !== '#' || get(y + dc, x + dr) !== '#') {
                  valid = false;
                  break;
                }
              }
              if (!valid || crosses === 0 || crosses === word.answer.length) continue;
              const score =
                crosses * 8 +
                word.answer.length -
                Math.abs(row + endR - size + 1) * 0.1 -
                Math.abs(col + endC - size + 1) * 0.1 +
                rng.next();
              if (!chosen || score > chosen.score)
                chosen = { p: { ...word, row, col, down }, score };
            }
          }
        if (chosen) put(chosen.p);
      }
    }
    if (placed.length > best.length) {
      best = placed;
      bestGrid = grid;
    }
  }
  return {
    id: 'generated-' + rng.int(0x40000000).toString(36),
    title:
      size +
      ' × ' +
      size +
      ' · ' +
      (difficulty === 'hard' ? 'Hard ink' : difficulty === 'easy' ? 'Easy ink' : 'Fresh ink'),
    author: 'Jackdaw Games',
    difficulty,
    rows: bestGrid.map((r) => r.join('')),
    across: best
      .filter((p) => !p.down)
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((p) => p.clue),
    down: best
      .filter((p) => p.down)
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((p) => p.clue),
  };
}
export function withDifficulty(puzzle: Puzzle, difficulty: PuzzleDifficulty): Puzzle {
  if (difficulty !== 'hard') return { ...puzzle, difficulty };
  const flat = puzzle.rows.join('');
  const clues = gridClues(puzzle.rows, puzzle.across, puzzle.down);
  const text = (direction: 'across' | 'down') =>
    clues
      .filter((c) => c.direction === direction)
      .map((c) => HARD_CLUES[c.cells.map((i) => flat[i]).join('')] ?? c.text);
  return {
    ...puzzle,
    difficulty,
    title: puzzle.title + ' · Hard',
    across: text('across'),
    down: text('down'),
  };
}
