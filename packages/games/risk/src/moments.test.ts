import { describe, expect, it } from 'vitest';
import { MAPS } from './maps';
import { battleMoment, beaten } from './moments';
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
  throws: 4,
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

  it('counts the whole run of attacks, not just the last throw', () => {
    const run = battle({ mode: 'roll', attackerLost: 0, defenderLost: 2 });
    expect(
      battleMoment({ ...run, runLost: { attacker: 3, defender: 5 } }, 'a', map, names),
    ).toMatchObject({ detail: 'You lost 3, Bram lost 5' });
    expect(battleMoment(run, null, map, names)).toMatchObject({
      detail: 'Ada lost 0, Bram lost 2',
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

describe('beaten dice', () => {
  it('pairs highest with highest, the defender winning ties', () => {
    expect(beaten([6, 4, 2], [5, 4])).toEqual({
      attack: [false, true, false],
      defend: [true, false],
    });
    expect(beaten([3], [3, 1])).toEqual({ attack: [true], defend: [false, false] });
  });
});
