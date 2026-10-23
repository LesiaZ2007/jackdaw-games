import type { MapDef } from './maps';
import type { Battle } from './rules';

export interface Moment {
  outcome: 'win' | 'loss' | 'reveal';
  title: string;
  detail: string;
}

/**
 * Which dice lost their pair in one throw (dice highest first): highest against highest, the
 * defender winning ties. Dice with no pair (the attacker's third) lose nothing.
 */
export function beaten(attack: number[], defend: number[]) {
  const pairs = Math.min(attack.length, defend.length);
  return {
    attack: attack.map((a, i) => i < pairs && a <= defend[i]!),
    defend: defend.map((d, i) => i < pairs && attack[i]! > d),
  };
}

/**
 * What a settled battle means to `me`: the attacker took it or was repelled, the defender lost it
 * or held. Anyone else sees it on the map; the TV (`me` null) gets a reveal. Public data only.
 */
export function battleMoment(
  b: Battle | null,
  me: string | null,
  map: MapDef,
  nameOf: (pid: string) => string,
): Moment | null {
  if (!b?.ended) return null;
  const to = map.territories.find((t) => t.id === b.to)?.name ?? b.to;
  // A run of Rolls is one fight: the verdict counts all of it, not just the last throw.
  const lost = b.runLost ?? { attacker: b.attackerLost, defender: b.defenderLost };
  if (me === b.attacker)
    return {
      outcome: b.conquered ? 'win' : 'loss',
      title: b.conquered ? `${to} taken` : `Repelled at ${to}`,
      detail: `You lost ${lost.attacker}, ${nameOf(b.defender)} lost ${lost.defender}`,
    };
  if (me === b.defender)
    return {
      outcome: b.conquered ? 'loss' : 'win',
      title: b.conquered ? `${to} lost` : `${to} held`,
      detail: `You lost ${lost.defender}, ${nameOf(b.attacker)} lost ${lost.attacker}`,
    };
  if (me !== null) return null;
  return {
    outcome: 'reveal',
    title: b.conquered ? `${nameOf(b.attacker)} takes ${to}` : `${to} holds`,
    detail: `${nameOf(b.attacker)} lost ${lost.attacker}, ${nameOf(b.defender)} lost ${lost.defender}`,
  };
}
