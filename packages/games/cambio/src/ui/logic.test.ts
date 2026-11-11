import { describe, expect, it } from 'vitest';
import { DEFAULT_HOUSE, type House } from '../cards';
import type { RoundResult } from '../rules';
import { delta, dropLine, houseRules, num, ruleLine } from './logic';

const name = (id: string) => ({ wren: 'Wren', rook: 'Rook', magpie: 'Magpie' })[id] ?? id;
const result = (over: Partial<RoundResult>): RoundResult => ({
  round: 1,
  caller: 'wren',
  totals: { wren: 14, rook: 10, magpie: 30 },
  scored: { wren: 24, rook: 10, magpie: 30 },
  callerWon: false,
  hands: {},
  ...over,
});
const house = (over: Partial<House>): House => ({ ...DEFAULT_HOUSE, ...over });

describe('the screens read the house rules', () => {
  it('writes nothing for the standard game, and the changed rules otherwise', () => {
    expect(houseRules(DEFAULT_HOUSE)).toEqual([]);
    expect(
      houseRules(
        house({
          redKing: -1,
          swap: '7 and 8',
          peek: 'Jack and Queen',
          peekSlots: [],
          penalty: 'double',
          jokers: true,
        }),
      ),
    ).toEqual([
      'Jack and Queen peek',
      '7 and 8 swap',
      'Red Kings are worth −1',
      'A caller who isn’t lowest doubles their total',
      'No opening peek',
      'Two jokers per deck, worth 0',
    ]);
  });

  it('spells out the caller’s score for each scoring rule', () => {
    expect(ruleLine(result({}), name)).toBe('Wren called but Rook was lower: 14 + 10');
    expect(ruleLine(result({}), name, 'rook')).toBe('Wren called but you were lower: 14 + 10');
    expect(
      ruleLine(
        result({ scored: { wren: 28, rook: 10, magpie: 30 } }),
        name,
        null,
        house({ penalty: 'double' }),
      ),
    ).toBe('Wren called but Rook was lower: 14 doubled: 28');
    expect(
      ruleLine(
        result({ scored: { wren: 19, rook: 10, magpie: 30 } }),
        name,
        null,
        house({ penalty: 5 }),
      ),
    ).toBe('Wren called but Rook was lower: 14 + 5');
    const won = result({
      callerWon: true,
      totals: { wren: 3, rook: 10, magpie: 30 },
      scored: { wren: -5, rook: 10, magpie: 30 },
    });
    expect(ruleLine(won, name)).toBe('Wren called and had the lowest: −5');
  });

  it('says a player dropped back to 50', () => {
    expect(dropLine(result({ dropped: ['rook'] }), name)).toBe(
      'Rook landed on exactly 100: back to 50.',
    );
    expect(dropLine(result({}), name)).toBeNull();
  });

  it('prints a proper minus sign', () => {
    expect([num(-3), num(4), delta(-5), delta(10)]).toEqual(['−3', '4', '−5', '+10']);
  });
});
