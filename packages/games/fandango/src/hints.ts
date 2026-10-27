import { MOON, rowFills, SUN, solve, type Puzzle } from './puzzle';

/**
 * Hints for someone playing alone: the next thing that can be worked out, said the way a person
 * would reason it, or a mark that's wrong. `cells` are the squares the hint is about; `area` the
 * squares that explain it (a row, a sign's other side).
 */
export interface Hint {
  text: string;
  cells: number[];
  area: number[];
  /** About a mark that's wrong. */
  mistake?: boolean;
}

const word = (v: number) => (v === SUN ? 'sun' : 'moon');
const other = (v: number) => 3 - v;

function linesOf(size: number): { name: string; cells: number[] }[] {
  const out: { name: string; cells: number[] }[] = [];
  for (let r = 0; r < size; r++)
    out.push({ name: `row ${r + 1}`, cells: [...Array(size).keys()].map((c) => r * size + c) });
  for (let c = 0; c < size; c++)
    out.push({ name: `column ${c + 1}`, cells: [...Array(size).keys()].map((r) => r * size + c) });
  return out;
}

const answers = new Map<string, number[]>();
function answerOf(p: Puzzle): number[] {
  const key = JSON.stringify(p);
  let a = answers.get(key);
  if (!a) {
    a = solve(p, 1)[0] ?? [];
    if (answers.size > 50) answers.clear();
    answers.set(key, a);
  }
  return a;
}

/** The board as it stands: the puzzle's squares and the player's marks. */
const boardOf = (p: Puzzle, marks: readonly number[]) => p.given.map((g, i) => g || marks[i] || 0);

/** A mark that isn't in the answer, or null when everything so far is right. */
export function findMistake(p: Puzzle, marks: readonly number[]): Hint | null {
  const answer = answerOf(p);
  const board = boardOf(p, marks);
  const wrong = board.findIndex((v, i) => v && !p.given[i] && v !== answer[i]);
  if (wrong < 0) return null;
  const v = board[wrong]!;
  return {
    text: `This ${word(v)} should be a ${word(other(v))}.`,
    cells: [wrong],
    area: [],
    mistake: true,
  };
}

/** The next step: a wrong mark first, if there is one, or else the simplest thing that follows. */
export function nextStep(p: Puzzle, marks: readonly number[]): Hint {
  const mistake = findMistake(p, marks);
  if (mistake) return { ...mistake, text: `First, put this right: ${lower(mistake.text)}` };
  const b = boardOf(p, marks);
  const half = p.size / 2;
  const lines = linesOf(p.size);

  for (const s of p.signs) {
    const [x, y] = [b[s.a]!, b[s.b]!];
    if (!x === !y) continue;
    const known = x ? s.a : s.b;
    const cell = x ? s.b : s.a;
    const v = s.same ? b[known]! : other(b[known]!);
    return {
      text: s.same
        ? `= means these two match, so this one is a ${word(v)} too.`
        : `× means these two differ, so this one is a ${word(v)}.`,
      cells: [cell],
      area: [known],
    };
  }

  for (const { cells } of lines) {
    for (let i = 0; i + 1 < cells.length; i++) {
      const v = b[cells[i]!]!;
      if (!v || b[cells[i + 1]!] !== v) continue;
      const ends = [cells[i - 1], cells[i + 2]].filter(
        (c): c is number => c !== undefined && !b[c],
      );
      if (ends.length)
        return {
          text: `Two ${word(v)}s side by side, so the squares either side of them are ${word(other(v))}s: three in a row isn't allowed.`,
          cells: ends,
          area: [cells[i]!, cells[i + 1]!],
        };
    }
    for (let i = 0; i + 2 < cells.length; i++) {
      const v = b[cells[i]!]!;
      if (!v || b[cells[i + 2]!] !== v || b[cells[i + 1]!]) continue;
      return {
        text: `A square between two ${word(v)}s has to be a ${word(other(v))}: three in a row isn't allowed.`,
        cells: [cells[i + 1]!],
        area: [cells[i]!, cells[i + 2]!],
      };
    }
  }

  for (const { name, cells } of lines) {
    const open = cells.filter((c) => !b[c]);
    if (!open.length) continue;
    for (const v of [SUN, MOON]) {
      if (cells.filter((c) => b[c] === v).length === half)
        return {
          text: `${cap(name)} already has ${half} ${word(v)}s, so the rest of it is ${word(other(v))}s.`,
          cells: open,
          area: cells,
        };
    }
  }

  // Every way to finish a line that keeps the rules: a square they all agree on.
  for (const { name, cells } of lines) {
    if (cells.every((c) => b[c])) continue;
    const fits = rowFills(p.size).filter(
      (o) =>
        o.every((v, i) => !b[cells[i]!] || b[cells[i]!] === v) &&
        p.signs.every((s) => {
          const i = cells.indexOf(s.a);
          return i < 0 || cells[i + 1] !== s.b || (o[i] === o[i + 1]) === s.same;
        }),
    );
    const at = cells.findIndex(
      (c, i) => !b[c] && fits.length && fits.every((o) => o[i] === fits[0]![i]),
    );
    if (at >= 0) {
      const v = fits[0]![at]!;
      return {
        text: `Try the ways ${name} could be finished: every one that keeps the rules has a ${word(v)} here.`,
        cells: [cells[at]!],
        area: cells,
      };
    }
  }

  const answer = answerOf(p);
  const cell = b.findIndex((v) => !v);
  return {
    text: `This square is a ${word(answer[cell]!)}.`,
    cells: cell < 0 ? [] : [cell],
    area: [],
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
