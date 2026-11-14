import { describe, expect, it } from 'vitest';
import { MIN_STRIP, handSlots, perRowFor } from './hand-layout';

describe('perRowFor', () => {
  it('keeps every card at least a thumb wide on a phone', () => {
    const per = perRowFor(343, 56);
    expect(per).toBe(7);
    // The step between cards in a full row is never under the strip.
    expect((343 - 56) / (per - 1)).toBeGreaterThanOrEqual(MIN_STRIP);
  });

  it('fits more across a laptop, with bigger cards showing more of each', () => {
    expect(perRowFor(860, 110)).toBe(15);
  });

  it('always allows one card, and guesses before anything is measured', () => {
    expect(perRowFor(40, 56)).toBe(1);
    expect(perRowFor(0, 0)).toBe(7);
  });
});

describe('handSlots', () => {
  it('keeps a short hand in one row', () => {
    const { rows, slots } = handSlots(7, 7);
    expect(rows).toBe(1);
    expect(slots.every((s) => s.r === 0 && s.rn === 7)).toBe(true);
  });

  it('balances the rows of a long hand', () => {
    const { rows, slots } = handSlots(12, 7);
    expect(rows).toBe(2);
    expect(slots.filter((s) => s.r === 0)).toHaveLength(6);
    expect(slots.filter((s) => s.r === 1)).toHaveLength(6);
  });

  it('never puts more in a row than fits, and keeps hand order', () => {
    for (let n = 1; n <= 60; n++) {
      const { rows, slots } = handSlots(n, 7);
      expect(slots).toHaveLength(n);
      expect(rows).toBe(Math.ceil(n / 7));
      for (const s of slots) expect(s.rn).toBeLessThanOrEqual(7);
      const order = slots.map((s) => s.r * 100 + s.c);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });

  it('is empty with no cards', () => {
    expect(handSlots(0, 7)).toEqual({ rows: 0, slots: [] });
  });
});
