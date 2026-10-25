import { describe, expect, it } from 'vitest';
import {
  NEUTRAL,
  STARTING_ARMIES,
  attackTargets,
  continentsHeld,
  reachable,
  reinforcementCount,
  territoriesOf,
  type Owner,
} from './board';
import { MAPS } from './maps';

const map = MAPS.world;
const ids = map.territories.map((t) => t.id);
/** Everything belongs to `rest`, except the listed territories. */
const board = (mine: string[], me = 'a', rest = 'b'): Owner =>
  Object.fromEntries(ids.map((t) => [t, mine.includes(t) ? me : rest]));
const AUSTRALIA = ['indonesia', 'new-guinea', 'western-australia', 'eastern-australia'];

describe('reinforcements', () => {
  it('are at least 3', () => {
    expect(reinforcementCount(map, board(ids.slice(0, 8)), 'a')).toBe(3);
  });

  it('are territories / 3 plus continent bonuses', () => {
    const mine = [...AUSTRALIA, 'alaska', 'peru', 'egypt', 'ural', 'japan'];
    expect(territoriesOf(board(mine), 'a')).toHaveLength(9);
    expect(continentsHeld(map, board(mine), 'a')).toEqual(['australia']);
    expect(reinforcementCount(map, board(mine), 'a')).toBe(5);
  });
});

describe('attacking and moving', () => {
  const owner = board(['alaska', 'alberta', 'ontario', 'quebec']);
  const armies = Object.fromEntries(ids.map((t) => [t, 3]));

  it('targets enemy neighbours, from a territory with 2 or more armies', () => {
    expect(attackTargets(map, owner, armies, 'a', 'alaska').sort()).toEqual([
      'kamchatka',
      'northwest-territory',
    ]);
    expect(attackTargets(map, owner, { ...armies, alaska: 1 }, 'a', 'alaska')).toEqual([]);
    expect(attackTargets(map, owner, armies, 'a', 'kamchatka')).toEqual([]);
  });

  it('can attack the neutral', () => {
    const o = { ...owner, kamchatka: NEUTRAL };
    expect(attackTargets(map, o, armies, 'a', 'alaska')).toContain('kamchatka');
  });

  it('moves only through your own territories', () => {
    expect(reachable(map, owner, 'a', 'alaska').sort()).toEqual(['alberta', 'ontario', 'quebec']);
    expect(reachable(map, board(['alaska', 'ontario']), 'a', 'alaska')).toEqual([]);
  });
});

describe('starting armies', () => {
  it('follow the classic table', () => {
    expect(STARTING_ARMIES).toEqual({ 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 });
  });
});
