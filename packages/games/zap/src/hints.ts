import { links, solve, type Puzzle } from './puzzle';

/**
 * Hints for someone playing alone: where the line goes next and why, or where it went wrong.
 * `cells` are the squares the hint is about; `area` the squares that explain it.
 */
export interface Hint {
  text: string;
  cells: number[];
  area: number[];
  /** About a mark that's wrong. */
  mistake?: boolean;
}

const answers = new Map<string, number[]>();
function answerOf(p: Puzzle): number[] {
  const key = `${p.size}:${p.dots.join(',')}:${p.walls.join(';')}`;
  let a = answers.get(key);
  if (!a) {
    a = solve(p, 1, Infinity)?.[0] ?? [];
    if (answers.size > 50) answers.clear();
    answers.set(key, a);
  }
  return a;
}

/** Where the line leaves the answer, or null while it's still on it. */
export function findMistake(p: Puzzle, path: readonly number[]): Hint | null {
  const answer = answerOf(p);
  const at = path.findIndex((c, i) => c !== answer[i]);
  if (at < 0) return null;
  return {
    text:
      at === 0
        ? 'The line has to start on 1.'
        : 'The line goes wrong from here. Take it back to the square before.',
    cells: [path[at]!],
    area: at > 0 ? [path[at - 1]!] : [],
    mistake: true,
  };
}

/** The next step: where the line went wrong, if it did, or else the next square and why. */
export function nextStep(p: Puzzle, path: readonly number[]): Hint {
  const mistake = findMistake(p, path);
  if (mistake) return { ...mistake, text: `First, put this right: ${lower(mistake.text)}` };
  if (!path.length) return { text: 'Start on 1.', cells: [p.dots[0]!], area: [] };
  const answer = answerOf(p);
  const next = answer[path.length];
  if (next === undefined) return { text: 'The line is finished.', cells: [], area: [] };
  const end = path[path.length - 1]!;
  const adj = links(p);
  const on = new Set(path);
  const free = (c: number) => adj[c]!.filter((x) => !on.has(x));
  const last = p.dots[p.dots.length - 1];
  const reached = path.filter((c) => p.dots.includes(c)).length;

  if (free(end).length === 1)
    return { text: 'There’s only one way on from here.', cells: [next], area: [end] };
  if (next !== last && free(next).filter((x) => x !== end).length <= 1)
    return {
      text: 'This square has only one other way out. If the line doesn’t pass through it now, it gets cut off.',
      cells: [next],
      area: [end, ...free(next).filter((x) => x !== end)],
    };
  if (next === p.dots[reached])
    return { text: `The line goes on to ${reached + 1}, right here.`, cells: [next], area: [end] };
  return { text: 'The line goes here next.', cells: [next], area: [end] };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
