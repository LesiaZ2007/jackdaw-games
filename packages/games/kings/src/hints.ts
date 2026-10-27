import { solve, type Puzzle } from './puzzle';

/**
 * Hints for someone playing alone: the next thing that can be worked out, said the way a person
 * would reason it, or a mark that's wrong. `cells` are the squares the hint is about; `area` the
 * squares that explain it (a colour, a row, a king). `marks` are the board's: 0 empty, 1 crossed
 * out, 2 a king.
 */
export interface Hint {
  text: string;
  cells: number[];
  area: number[];
  /** About a mark that's wrong. */
  mistake?: boolean;
}

interface Group {
  name: string;
  cells: number[];
}

const answers = new Map<string, Set<number>>();
function answerOf(p: Puzzle): Set<number> {
  const key = `${p.size}:${p.regions.join(',')}`;
  let a = answers.get(key);
  if (!a) {
    a = new Set((solve(p, 1)[0] ?? []).map((c, r) => r * p.size + c));
    if (answers.size > 50) answers.clear();
    answers.set(key, a);
  }
  return a;
}

/** Whether a king on `a` rules out `b`: same row, column or colour, or touching. */
function rules(p: Puzzle, a: number, b: number): boolean {
  const { size } = p;
  const [ar, ac, br, bc] = [Math.floor(a / size), a % size, Math.floor(b / size), b % size];
  return (
    ar === br ||
    ac === bc ||
    p.regions[a] === p.regions[b] ||
    (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)
  );
}

function groupsOf(p: Puzzle): Group[] {
  const { size } = p;
  const all = [...Array(size * size).keys()];
  return [
    ...[...Array(size).keys()].map((r) => ({
      name: `row ${r + 1}`,
      cells: all.filter((i) => Math.floor(i / size) === r),
    })),
    ...[...Array(size).keys()].map((c) => ({
      name: `column ${c + 1}`,
      cells: all.filter((i) => i % size === c),
    })),
    ...[...Array(size).keys()].map((g) => ({
      name: 'this colour',
      cells: all.filter((i) => p.regions[i] === g),
    })),
  ];
}

/** A king that isn't in the answer, or a cross on a king's square; null when all is right. */
export function findMistake(p: Puzzle, marks: readonly number[]): Hint | null {
  const answer = answerOf(p);
  const king = marks.findIndex((m, i) => m === 2 && !answer.has(i));
  if (king >= 0) {
    const clash = marks.findIndex((m, i) => m === 2 && i !== king && rules(p, king, i));
    return clash >= 0
      ? {
          text: 'These two kings rule each other out.',
          cells: [king, clash],
          area: [],
          mistake: true,
        }
      : { text: 'This king is in the wrong square.', cells: [king], area: [], mistake: true };
  }
  const cross = marks.findIndex((m, i) => m === 1 && answer.has(i));
  if (cross >= 0)
    return {
      text: 'This square is crossed out, but a king belongs here.',
      cells: [cross],
      area: [],
      mistake: true,
    };
  return null;
}

/** The next step: a wrong mark first, if there is one, or else the simplest thing that follows. */
export function nextStep(p: Puzzle, marks: readonly number[]): Hint {
  const mistake = findMistake(p, marks);
  if (mistake) return { ...mistake, text: `First, put this right: ${lower(mistake.text)}` };
  const n = p.size * p.size;
  const kings = [...Array(n).keys()].filter((i) => marks[i] === 2);
  const groups = groupsOf(p);
  const open = (i: number, extra: number[] = []) =>
    marks[i] === 0 && ![...kings, ...extra].some((k) => rules(p, k, i));
  const kingless = (g: Group, extra: number[] = []) =>
    !g.cells.some((i) => marks[i] === 2 || extra.includes(i));

  // A row, column or colour with one square left.
  for (const g of groups) {
    if (!kingless(g)) continue;
    const left = g.cells.filter((i) => open(i));
    if (left.length === 1)
      return {
        text: `Only one square is left for the king in ${g.name}, so it goes here.`,
        cells: left,
        area: g.cells,
      };
  }

  // Squares a king already rules out that aren't crossed out yet.
  for (const k of kings) {
    const out = [...Array(n).keys()].filter((i) => marks[i] === 0 && rules(p, k, i));
    if (out.length)
      return {
        text: 'This king rules out its row, its column, its colour and the squares touching it. Cross them out.',
        cells: out,
        area: [k],
      };
  }

  // A colour whose open squares sit in one row or column, or a row or column in one colour.
  const size = p.size;
  const lineOf = [
    { word: 'row', at: (i: number) => Math.floor(i / size) },
    { word: 'column', at: (i: number) => i % size },
  ];
  for (const g of groups.slice(2 * size)) {
    if (!kingless(g)) continue;
    const left = g.cells.filter((i) => open(i));
    for (const { word, at } of lineOf) {
      const where = new Set(left.map(at));
      if (left.length < 2 || where.size !== 1) continue;
      const line = [...where][0]!;
      const rest = [...Array(n).keys()].filter(
        (i) => at(i) === line && open(i) && !g.cells.includes(i),
      );
      if (rest.length)
        return {
          text: `Every square left in this colour is in ${word} ${line + 1}, so that ${word}'s king is in this colour. Cross out the rest of the ${word}.`,
          cells: rest,
          area: left,
        };
    }
  }
  for (const g of groups.slice(0, 2 * size)) {
    if (!kingless(g)) continue;
    const left = g.cells.filter((i) => open(i));
    const colours = new Set(left.map((i) => p.regions[i]));
    if (left.length < 2 || colours.size !== 1) continue;
    const colour = [...colours][0];
    const rest = [...Array(n).keys()].filter(
      (i) => p.regions[i] === colour && open(i) && !g.cells.includes(i),
    );
    if (rest.length)
      return {
        text: `Every square left in ${g.name} is one colour, so that colour's king is in ${g.name}. Cross out the rest of the colour.`,
        cells: rest,
        area: left,
      };
  }

  // A square that, holding a king, would leave a row, column or colour with nowhere for one.
  for (let i = 0; i < n; i++) {
    if (!open(i)) continue;
    const blocked = groups.find(
      (g) => !g.cells.includes(i) && kingless(g, [i]) && !g.cells.some((c) => open(c, [i])),
    );
    if (blocked)
      return {
        text: `A king here would leave nowhere for the king in ${blocked.name}. Cross it out.`,
        cells: [i],
        area: blocked.cells,
      };
  }

  const answer = answerOf(p);
  const region = groups
    .slice(2 * size)
    .filter((g) => kingless(g))
    .sort(
      (a, b) => a.cells.filter((i) => open(i)).length - b.cells.filter((i) => open(i)).length,
    )[0];
  const cell = region?.cells.find((i) => answer.has(i));
  return {
    text: 'Of the squares left in this colour, the king goes here.',
    cells: cell === undefined ? [] : [cell],
    area: region?.cells ?? [],
  };
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
