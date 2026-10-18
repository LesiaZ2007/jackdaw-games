import type { MapDef } from './maps';
import type { Battle } from './rules';

export interface Moment {
  outcome: 'win' | 'loss' | 'reveal';
  title: string;
  detail: string;
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
  if (me === b.attacker)
    return {
      outcome: b.conquered ? 'win' : 'loss',
      title: b.conquered ? `${to} taken` : `Repelled at ${to}`,
      detail: `You lost ${b.attackerLost}, ${nameOf(b.defender)} lost ${b.defenderLost}`,
    };
  if (me === b.defender)
    return {
      outcome: b.conquered ? 'loss' : 'win',
      title: b.conquered ? `${to} lost` : `${to} held`,
      detail: `You lost ${b.defenderLost}, ${nameOf(b.attacker)} lost ${b.attackerLost}`,
    };
  if (me !== null) return null;
  return {
    outcome: 'reveal',
    title: b.conquered ? `${nameOf(b.attacker)} takes ${to}` : `${to} holds`,
    detail: `${nameOf(b.attacker)} lost ${b.attackerLost}, ${nameOf(b.defender)} lost ${b.defenderLost}`,
  };
}
