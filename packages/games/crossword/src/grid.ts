/** Public grid geometry; never imports answers. */
export type Direction = 'across' | 'down';
export interface Clue {
  id: string;
  number: number;
  direction: Direction;
  text: string;
  cells: number[];
}
export interface Puzzle {
  id: string;
  title: string;
  author: string;
  rows: string[];
  across: string[];
  down: string[];
}
export function gridClues(rows: string[], across: string[], down: string[]): Clue[] {
  const width = rows[0]!.length;
  const clues: Clue[] = [];
  let number = 0;
  let a = 0;
  let d = 0;
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < width; c++) {
      if (rows[r]![c] === '#') continue;
      const startsAcross = c === 0 || rows[r]![c - 1] === '#';
      const startsDown = r === 0 || rows[r - 1]![c] === '#';
      if (startsAcross || startsDown) number++;
      for (const direction of ['across', 'down'] as const) {
        if (!(direction === 'across' ? startsAcross : startsDown)) continue;
        const cells: number[] = [];
        let y = r;
        let x = c;
        while (y < rows.length && x < width && rows[y]![x] !== '#') {
          cells.push(y * width + x);
          if (direction === 'across') x++;
          else y++;
        }
        clues.push({
          id: number + '-' + direction,
          number,
          direction,
          cells,
          text: (direction === 'across' ? across[a++] : down[d++]) ?? '',
        });
      }
    }
  return clues;
}
