import type { Rng } from '@jackdaw/engine';
import type { Puzzle } from './grid';
import { WORD_BANK } from './bank';
interface Placement {
  answer: string;
  clue: string;
  row: number;
  col: number;
  down: boolean;
}
/** Interlocking crosswords: no accidental adjacent words, no duplicate answers, one connected grid. */
export function generatePuzzle(size: number, rng: Rng): Puzzle {
  let best: Placement[] = [];
  let bestGrid: string[][] = [];
  const words = WORD_BANK.filter((w) => w.answer.length <= size);
  for (let attempt = 0; attempt < 12; attempt++) {
    const grid = Array.from({ length: size }, () => Array<string>(size).fill('#'));
    const axes = Array.from({ length: size }, () => Array<number>(size).fill(0));
    const placed: Placement[] = [];
    const put = (p: Placement) => {
      for (let k = 0; k < p.answer.length; k++) {
        const r = p.row + (p.down ? k : 0),
          c = p.col + (p.down ? 0 : k);
        grid[r]![c] = p.answer[k]!;
        axes[r]![c]! |= p.down ? 2 : 1;
      }
      placed.push(p);
    };
    const first = rng.pick(
      words.filter(
        (w) => w.answer.length >= Math.min(5, size) && w.answer.length <= Math.min(size, 8),
      ),
    );
    put({
      ...first,
      row: Math.floor(size / 2),
      col: Math.floor((size - first.answer.length) / 2),
      down: false,
    });
    const get = (r: number, c: number) =>
      r < 0 || c < 0 || r >= size || c >= size ? '#' : grid[r]![c]!;
    for (let pass = 0; pass < 3; pass++)
      for (const word of rng.shuffle(words)) {
        if (placed.some((p) => p.answer === word.answer)) continue;
        const candidates: { p: Placement; score: number }[] = [];
        for (let r = 0; r < size; r++)
          for (let c = 0; c < size; c++) {
            if (grid[r]![c] === '#') continue;
            for (let k = 0; k < word.answer.length; k++)
              if (word.answer[k] === grid[r]![c])
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
                  if (valid && crosses > 0 && crosses < word.answer.length)
                    candidates.push({
                      p: { ...word, row, col, down },
                      score:
                        crosses * 8 +
                        word.answer.length -
                        Math.abs(row + endR - size + 1) * 0.1 -
                        Math.abs(col + endC - size + 1) * 0.1 +
                        rng.next(),
                    });
                }
          }
        candidates.sort((a, b) => b.score - a.score);
        if (candidates[0]) put(candidates[0].p);
      }
    if (placed.length > best.length) {
      best = placed;
      bestGrid = grid;
    }
  }
  const across = best
    .filter((p) => !p.down)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((p) => p.clue);
  const down = best
    .filter((p) => p.down)
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((p) => p.clue);
  return {
    id: 'generated-' + rng.int(0x40000000).toString(36),
    title: size + ' × ' + size + ' · Fresh ink',
    author: 'Jackdaw Games',
    rows: bestGrid.map((r) => r.join('')),
    across,
    down,
  };
}
