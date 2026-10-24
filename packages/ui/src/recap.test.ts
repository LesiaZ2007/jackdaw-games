import { describe, expect, it } from 'vitest';
import { recapLine, withNames } from './recap';

const names = { p_rook: 'Rook', p_wren: 'Wren' };

describe('withNames', () => {
  it('swaps braced ids (the chat convention) without leaving braces', () => {
    expect(withNames('Hand 3: {p_rook} and {p_wren} won 40.', names)).toBe(
      'Hand 3: Rook and Wren won 40.',
    );
  });

  it('swaps bare ids', () => {
    expect(withNames('p_rook nominated p_wren', names)).toBe('Rook nominated Wren');
  });

  it('reads {actor} as the actor', () => {
    expect(withNames('{actor} goes first', names, 'p_wren')).toBe('Wren goes first');
  });
});

describe('recapLine', () => {
  it("doesn't print the actor before text that already names them", () => {
    expect(recapLine({ actor: 'p_rook', text: '{p_rook} bought back in.' }, names)).toEqual({
      actor: null,
      text: 'Rook bought back in.',
    });
    expect(recapLine({ actor: 'p_rook', text: 'p_rook nominated p_wren' }, names).actor).toBe(null);
  });

  it('prints the actor before text that leaves them out', () => {
    expect(recapLine({ actor: 'p_wren', text: 'passed' }, names)).toEqual({
      actor: 'Wren',
      text: 'passed',
    });
  });

  it('names players in the secret too', () => {
    expect(recapLine({ text: 'Hand 1', secret: '{p_wren} folded 7♣ 2♦' }, names).secret).toBe(
      'Wren folded 7♣ 2♦',
    );
  });
});
