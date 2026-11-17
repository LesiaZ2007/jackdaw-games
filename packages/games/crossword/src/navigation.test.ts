import { describe, it, expect } from 'vitest';
import { gridClues } from './grid';
import { afterLetter } from './navigation';
const clues = gridClues(
  ['PEN##', 'ERAS#', 'ARIAS', '#SLIP', '##SLY'],
  ['pen', 'eras', 'arias', 'slip', 'sly'],
  ['pea', 'errs', 'nails', 'sail', 'spy'],
);
const letters = () => Array<string>(25).fill('');
describe('automatic crossword navigation', () => {
  it('moves through a word and advances after the last letter', () => {
    const l = letters();
    l[0] = 'P';
    l[1] = 'E';
    expect(afterLetter(clues, '1-across', l, 1, 'E')).toEqual({ cell: 2, direction: 'across' });
    expect(afterLetter(clues, '1-across', l, 2, 'N')).toEqual({ cell: 5, direction: 'across' });
  });
  it('skips completed words when advancing', () => {
    const l = letters();
    for (const [i, c] of [
      [0, 'P'],
      [1, 'E'],
      [5, 'E'],
      [6, 'R'],
      [7, 'A'],
      [8, 'S'],
    ] as const)
      l[i] = c;
    expect(afterLetter(clues, '1-across', l, 2, 'N')).toEqual({ cell: 10, direction: 'across' });
  });
  it('does not skip filled crossings while the player types a whole answer', () => {
    const l = letters();
    l[1] = 'E';
    expect(afterLetter(clues, '1-across', l, 0, 'P')).toEqual({ cell: 1, direction: 'across' });
  });
  it('wraps to a hole if the current word is still incomplete', () => {
    const l = letters();
    l[0] = 'P';
    expect(afterLetter(clues, '1-across', l, 2, 'N')).toEqual({ cell: 1, direction: 'across' });
  });
  it('skips revealed cells and advances from the last editable square', () => {
    const l = letters();
    l[1] = 'E';
    l[2] = 'N';
    expect(afterLetter(clues, '1-across', l, 0, 'P', [1, 2])).toEqual({
      cell: 5,
      direction: 'across',
    });
  });
  it('moves from the last across entry to unfinished down entries', () => {
    const l = letters();
    l[22] = 'S';
    l[23] = 'L';
    expect(afterLetter(clues, '9-across', l, 24, 'Y')).toEqual({ cell: 0, direction: 'down' });
  });
  it('does not advance on erase or when the whole grid is filled', () => {
    expect(afterLetter(clues, '1-across', letters(), 0, '')).toBeNull();
    const l = [...'PEN##ERAS#ARIAS#SLIP##SLY'].map((c) => (c === '#' ? '' : c));
    expect(afterLetter(clues, '9-across', l, 24, 'Y')).toBeNull();
  });
});
