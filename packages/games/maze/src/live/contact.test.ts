import { describe, expect, it } from 'vitest';
import { resolveContacts, type Contender } from './contact';

const c = (id: string, x: number, y: number, o: Partial<Contender> = {}): Contender => ({
  id,
  x,
  y,
  hunting: false,
  immuneUntil: 0,
  score: 300,
  ...o,
});

describe('resolveContacts', () => {
  it('bump when two plain chompers touch', () => {
    expect(resolveContacts([c('A', 5, 5), c('B', 5.7, 5)], 1000)).toEqual([
      { kind: 'bump', a: 'A', b: 'B', cost: 50 },
    ]);
  });

  it('no contact at the touch distance or further', () => {
    expect(resolveContacts([c('A', 0, 5), c('B', 0.8, 5)], 1000)).toEqual([]);
    expect(resolveContacts([c('A', 5, 5), c('B', 7, 5)], 1000)).toEqual([]);
  });

  it('hunter eats', () => {
    expect(resolveContacts([c('B', 5.5, 5), c('A', 5, 5, { hunting: true })], 1000)).toEqual([
      { kind: 'eat', by: 'A', eaten: 'B', cost: 200, gain: 400 },
    ]);
  });

  it('both hunting is a bump', () => {
    const r = resolveContacts(
      [c('A', 5, 5, { hunting: true }), c('B', 5.5, 5, { hunting: true })],
      1000,
    );
    expect(r).toEqual([{ kind: 'bump', a: 'A', b: 'B', cost: 50 }]);
  });

  it('events carry nominal costs', () => {
    const r = resolveContacts([c('A', 5, 5, { hunting: true }), c('B', 5.5, 5, { score: 120 })], 0);
    expect(r).toEqual([{ kind: 'eat', by: 'A', eaten: 'B', cost: 200, gain: 400 }]);
  });

  it('dying or shielded chompers are ignored', () => {
    expect(resolveContacts([c('A', 5, 5), c('B', 5.5, 5, { immuneUntil: 1500 })], 1000)).toEqual(
      [],
    );
    expect(
      resolveContacts([c('A', 5, 5, { hunting: true, immuneUntil: 1001 }), c('B', 5.5, 5)], 1000),
    ).toEqual([]);
  });

  it('three-way meeting charges each pair once', () => {
    const r = resolveContacts([c('C', 5.25, 5.4), c('B', 5.5, 5), c('A', 5, 5)], 1000);
    expect(r).toEqual([
      { kind: 'bump', a: 'A', b: 'B', cost: 50 },
      { kind: 'bump', a: 'A', b: 'C', cost: 50 },
      { kind: 'bump', a: 'B', b: 'C', cost: 50 },
    ]);
  });
});
