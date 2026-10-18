import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import type { Owner } from './board';
import { MAPS } from './maps';
import {
  dealMissions,
  fallback,
  missionDeck,
  missionDone,
  missionLabel,
  missionText,
  type Mission,
} from './missions';

const map = MAPS.world;
const ids = map.territories.map((t) => t.id);
const inContinent = (c: string) =>
  map.territories.filter((t) => t.continent === c).map((t) => t.id);
const board = (mine: string[]): Owner =>
  Object.fromEntries(ids.map((t) => [t, mine.includes(t) ? 'a' : 'b']));
const ones = Object.fromEntries(ids.map((t) => [t, 1]));
const names = (p: string) => ({ a: 'Ada', b: 'Bram', c: 'Cy' })[p] ?? p;

describe('the mission deck', () => {
  it('has 6 continent goals, 2 territory goals and one destroy per player (none at 2)', () => {
    expect(missionDeck(map, ['a', 'b'])).toHaveLength(8);
    expect(missionDeck(map, ['a', 'b', 'c'])).toHaveLength(11);
    expect(missionDeck(map, ['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(14);
    expect(missionDeck(map, ['a', 'b']).some((m) => m.kind === 'destroy')).toBe(false);
  });

  it('never asks you to destroy yourself', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const dealt = dealMissions(map, ['a', 'b', 'c', 'd'], createRng(seed));
      for (const [pid, m] of Object.entries(dealt)) {
        if (m.kind === 'destroy') expect(m.target).not.toBe(pid);
      }
      expect(Object.keys(dealt).sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('missions done', () => {
  const pair: Mission = { kind: 'continents', ids: ['asia', 'south-america'], any: false };
  const pairPlus: Mission = { kind: 'continents', ids: ['europe', 'australia'], any: true };

  it('holding two continents', () => {
    const both = [...inContinent('asia'), ...inContinent('south-america')];
    expect(missionDone(pair, map, board(both), ones, 'a', {})).toBe(true);
    expect(missionDone(pair, map, board(both.slice(1)), ones, 'a', {})).toBe(false);
  });

  it('two continents and any third', () => {
    const two = [...inContinent('europe'), ...inContinent('australia')];
    expect(missionDone(pairPlus, map, board(two), ones, 'a', {})).toBe(false);
    const three = [...two, ...inContinent('south-america')];
    expect(missionDone(pairPlus, map, board(three), ones, 'a', {})).toBe(true);
  });

  it('24 territories', () => {
    const m: Mission = { kind: 'territories', n: 24 };
    expect(missionDone(m, map, board(ids.slice(0, 24)), ones, 'a', {})).toBe(true);
    expect(missionDone(m, map, board(ids.slice(0, 23)), ones, 'a', {})).toBe(false);
  });

  it('18 territories with 2 armies on each', () => {
    const m: Mission = { kind: 'territories2', n: 18 };
    const mine = ids.slice(0, 18);
    const twos = Object.fromEntries(ids.map((t) => [t, 2]));
    expect(missionDone(m, map, board(mine), twos, 'a', {})).toBe(true);
    expect(missionDone(m, map, board(mine), { ...twos, [mine[0]!]: 1 }, 'a', {})).toBe(false);
  });

  it('destroying an army: only when you took them out', () => {
    const m: Mission = { kind: 'destroy', target: 'c' };
    expect(missionDone(m, map, board([]), ones, 'a', { c: 'a' })).toBe(true);
    expect(missionDone(m, map, board([]), ones, 'a', { c: 'b' })).toBe(false);
    expect(missionDone(m, map, board([]), ones, 'a', {})).toBe(false);
  });
});

describe('falling back', () => {
  it('becomes 24 territories when someone else destroys your target', () => {
    const m: Mission = { kind: 'destroy', target: 'c' };
    expect(fallback(m, 'a', { c: 'b' })).toEqual({ kind: 'territories', n: 24 });
    expect(fallback(m, 'a', { c: 'a' })).toEqual(m);
    expect(fallback(m, 'a', {})).toEqual(m);
  });
});

describe('mission text', () => {
  it('reads plainly', () => {
    expect(
      missionText({ kind: 'continents', ids: ['asia', 'south-america'], any: false }, map, names),
    ).toBe('Hold Asia and South America');
    expect(
      missionText({ kind: 'continents', ids: ['europe', 'australia'], any: true }, map, names),
    ).toBe('Hold Europe, Australia and one more continent');
    expect(missionText({ kind: 'territories', n: 24 }, map, names)).toBe('Hold 24 territories');
    expect(missionText({ kind: 'territories2', n: 18 }, map, names)).toBe(
      'Hold 18 territories with at least 2 armies on each',
    );
    expect(missionText({ kind: 'destroy', target: 'b' }, map, names)).toBe('Destroy Bram’s army');
    expect(missionLabel({ kind: 'destroy', target: 'b' }, map)).toBe('Destroy an army');
  });
});
