import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { battleMoment } from './moments';
import type { Battle } from './rules';

const names = (p: string) => ({ a: 'Ada', b: 'Bram' })[p] ?? p;
const battle = (o: Partial<Battle>): Battle => ({
  seq: 3,
  attacker: 'a',
  defender: 'b',
  from: 'alaska',
  to: 'kamchatka',
  mode: 'blitz',
  attackDice: [6, 5],
  defendDice: [3],
  attackerLost: 1,
  defenderLost: 4,
  conquered: true,
  ended: true,
  ...o,
});

describe('battle moments', () => {
  const map = MAPS.world;

  it('the attacker takes it or is repelled', () => {
    expect(battleMoment(battle({}), 'a', map, names)).toEqual({
      outcome: 'win',
      title: 'Kamchatka taken',
      detail: 'You lost 1, Bram lost 4',
    });
    expect(battleMoment(battle({ conquered: false }), 'a', map, names)).toMatchObject({
      outcome: 'loss',
      title: 'Repelled at Kamchatka',
    });
  });

  it('the defender loses it or holds', () => {
    expect(battleMoment(battle({}), 'b', map, names)).toEqual({
      outcome: 'loss',
      title: 'Kamchatka lost',
      detail: 'You lost 4, Ada lost 1',
    });
    expect(battleMoment(battle({ conquered: false }), 'b', map, names)).toMatchObject({
      outcome: 'win',
      title: 'Kamchatka held',
    });
  });

  it('others see it on the map; the TV gets a reveal', () => {
    expect(battleMoment(battle({}), 'c', map, names)).toBeNull();
    expect(battleMoment(battle({}), null, map, names)).toEqual({
      outcome: 'reveal',
      title: 'Ada takes Kamchatka',
      detail: 'Ada lost 1, Bram lost 4',
    });
    expect(battleMoment(battle({ conquered: false }), null, map, names)).toMatchObject({
      outcome: 'reveal',
      title: 'Kamchatka holds',
    });
  });

  it('nothing until a battle is settled', () => {
    expect(battleMoment(battle({ ended: false, conquered: false }), 'a', map, names)).toBeNull();
    expect(battleMoment(null, 'a', map, names)).toBeNull();
  });
});
