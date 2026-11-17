import type { Clue, Direction } from './grid';
export interface NextSquare {
  cell: number;
  direction: Direction;
}
/** Across clues, then down clues; skip completed entries and retain holes within the current word. */
export function afterLetter(
  clues: Clue[],
  activeId: string,
  letters: string[],
  cell: number,
  letter: string,
  revealed: readonly number[] = [],
): NextSquare | null {
  if (!letter) return null;
  const active = clues.find((c) => c.id === activeId);
  if (!active) return null;
  const updated = [...letters];
  updated[cell] = letter;
  const at = active.cells.indexOf(cell);
  const nextSquare = active.cells.slice(at + 1).find((i) => !revealed.includes(i));
  if (nextSquare !== undefined) return { cell: nextSquare, direction: active.direction };
  const hole = active.cells.find((i) => !updated[i]);
  if (hole !== undefined) return { cell: hole, direction: active.direction };
  const ordered = [
    ...clues.filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number),
    ...clues.filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number),
  ];
  const index = ordered.findIndex((c) => c.id === active.id);
  for (let step = 1; step <= ordered.length; step++) {
    const clue = ordered[(index + step) % ordered.length]!;
    const next = clue.cells.find((i) => !updated[i]);
    if (next !== undefined) return { cell: next, direction: clue.direction };
  }
  return null;
}
const ordered = (clues: Clue[]) => [
  ...clues.filter((c) => c.direction === 'across').sort((a, b) => a.number - b.number),
  ...clues.filter((c) => c.direction === 'down').sort((a, b) => a.number - b.number),
];
/** Backspace on an empty or revealed square: the editable square before it, in the word or the clue before. */
export function beforeSquare(
  clues: Clue[],
  activeId: string,
  cell: number,
  revealed: readonly number[] = [],
): NextSquare | null {
  const editable = (i: number) => !revealed.includes(i);
  const active = clues.find((c) => c.id === activeId);
  if (!active) return null;
  const inWord = active.cells.slice(0, active.cells.indexOf(cell)).reverse().find(editable);
  if (inWord !== undefined) return { cell: inWord, direction: active.direction };
  const list = ordered(clues);
  const at = list.findIndex((c) => c.id === active.id);
  for (let step = 1; step < list.length; step++) {
    const clue = list[(at - step + list.length) % list.length]!;
    const last = [...clue.cells].reverse().find(editable);
    if (last !== undefined) return { cell: last, direction: clue.direction };
  }
  return null;
}
