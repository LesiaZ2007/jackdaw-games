import { describe, expect, it } from 'vitest';
import { NEUTRAL } from '../board';
import { ARMIES, armyColour, armyOf } from './armies';

describe('army colours', () => {
  const seats = ['a', 'b', 'c', 'd', 'e', 'f'];

  it('gives six seats six different colours, in seat order', () => {
    expect(seats.map((p) => armyOf(p, seats))).toEqual([...ARMIES]);
  });

  it('draws the neutral army, and anyone not seated, in grey', () => {
    expect(armyOf(NEUTRAL, seats)).toBeNull();
    expect(armyColour(NEUTRAL, seats)).toBe('var(--rule)');
    expect(armyColour('zz', seats)).toBe('var(--rule)');
    expect(armyColour('b', seats)).toBe('var(--azure)');
  });
});
