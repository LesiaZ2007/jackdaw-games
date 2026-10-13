import type { Policy, Power } from './lineup';
import type { PublicGovernment, ShTableView } from './rules';

/**
 * What a phone (or the TV) celebrates, worked out from the public table only. A policy moment
 * looks the same on every phone, in the policy's own colour: a "you won" seal for a Fascist
 * policy would tell the person beside you which side you're on. A vote moment is personal,
 * because every vote is public once it's counted.
 */

export type MomentOutcome = 'win' | 'loss' | 'draw' | 'reveal';

export interface Moment {
  outcome: MomentOutcome;
  title: string;
  detail: string;
}

/** The last government that went to a vote. */
export const lastVoted = (t: ShTableView): PublicGovernment | undefined =>
  [...t.governments].reverse().find((g) => Object.keys(g.votes).length > 0);

export function tally(g: PublicGovernment): { ja: number; nein: number } {
  const votes = Object.values(g.votes);
  const ja = votes.filter(Boolean).length;
  return { ja, nein: votes.length - ja };
}

/** The vote that just resolved, from `me`'s own vote (or as news for anyone who didn't vote). */
export function voteMoment(
  t: ShTableView,
  me: string | null,
  name: (id: string) => string,
): Moment | null {
  const g = lastVoted(t);
  if (!g) return null;
  const { ja, nein } = tally(g);
  const detail = `Ja ${ja}, Nein ${nein}. ${name(g.president)} and ${name(g.chancellor)} ${g.passed ? 'take office' : 'are voted down'}.`;
  const mine = me ? g.votes[me] : undefined;
  if (mine === undefined)
    return {
      outcome: 'reveal',
      title: g.passed ? 'Government elected' : 'Government rejected',
      detail,
    };
  const gotIt = mine === g.passed;
  return {
    outcome: gotIt ? 'win' : 'loss',
    title: g.passed
      ? mine
        ? 'Your Ja carried it'
        : 'Elected over your Nein'
      : mine
        ? 'Voted down despite your Ja'
        : 'Your Nein carried it',
    detail,
  };
}

/** A policy just went on the board. Same for everyone: Liberal blue, Fascist red. */
export function policyMoment(t: ShTableView, policy: Policy, chaos: boolean): Moment {
  const count = policy === 'liberal' ? t.liberal : t.fascist;
  const of = policy === 'liberal' ? 5 : 6;
  return {
    outcome: policy === 'liberal' ? 'reveal' : 'loss',
    title: policy === 'liberal' ? 'Liberal policy enacted' : 'Fascist policy enacted',
    detail: `${chaos ? 'Three failed governments: the top card went straight down. ' : ''}${count} of ${of} on the ${policy === 'liberal' ? 'Liberal' : 'Fascist'} track.`,
  };
}

const POWER_TEXT: Record<Power, string> = {
  peek: 'looks at the top three policies',
  investigate: 'investigates a player',
  special: 'calls a special election',
  execute: 'must execute a player',
};

/** "Bran looks at the top three policies" and the like, for the power waiting now. */
export const powerLine = (power: Power, president: string, name: (id: string) => string) =>
  `${name(president)} ${POWER_TEXT[power]}`;

export const POWER_LABEL: Record<Power, string> = {
  peek: 'Policy peek',
  investigate: 'Investigate',
  special: 'Special election',
  execute: 'Execution',
};
