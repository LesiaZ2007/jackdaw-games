import type { Outcome } from '@jackdaw/ui';
import { other, TEAM_NAME, type RoundResult, type Team, type WavelengthTableView } from '../rules';
import type { Spectrum } from '../spectrums';

type Name = (id: string) => string;

/** The card in play this round: the one chosen, or null while the psychic is choosing. */
export function cardOf(t: WavelengthTableView): Spectrum | null {
  return t.round.card === null ? null : t.round.spectrums[t.round.card];
}

/** "Sun" or, in Together, "The team". */
export const teamWord = (t: WavelengthTableView, team: Team) =>
  t.mode === 'teams' ? TEAM_NAME[team] : 'The team';

/** "Round 3 of 7" (Together) or "First to 10" (Teams). */
export function roundLine(t: WavelengthTableView): string {
  return t.mode === 'together'
    ? `Round ${t.round.n} of ${t.rounds}`
    : `Round ${t.round.n} · first to ${t.goal}`;
}

/** What's happening, in one line, for a screen that isn't acting (the TV, a waiting phone). */
export function statusLine(t: WavelengthTableView, name: Name): string {
  const psychic = name(t.round.psychic);
  const team = teamWord(t, t.round.team);
  switch (t.phase) {
    case 'clue':
      return `${psychic} is reading the dial`;
    case 'guess':
      return t.guessing === 'shared'
        ? `${team === 'The team' ? 'Everyone' : team} is turning the dial`
        : `${team === 'The team' ? 'Everyone' : team} is setting their dials`;
    case 'call':
      return `${TEAM_NAME[other(t.round.team)]}: left or right?`;
    case 'reveal': {
      const last = t.history[t.history.length - 1];
      return last ? pointsLine(last) : '';
    }
    case 'over':
      return 'Game over';
  }
}

/** "Bullseye!", "3 points", "Missed". */
export function pointsLine(r: RoundResult): string {
  return r.points === 4 ? 'Bullseye!' : r.points ? `${r.points} points` : 'Missed';
}

/** This player's result for the round just revealed, for the moment over the screen. */
export function roundMoment(
  t: WavelengthTableView,
  me: string | null,
  name: Name,
): { outcome: Outcome; title: string; detail: string } | null {
  const r = t.history[t.history.length - 1];
  if (!r) return null;
  const team = t.mode === 'teams' ? TEAM_NAME[r.team] : 'The team';
  const callNote =
    t.mode === 'teams' && r.call
      ? ` ${TEAM_NAME[other(r.team)]} called ${r.call}${r.callPoint ? ': +1' : ', wrong'}.`
      : '';
  const detail = `“${r.clue}” by ${name(r.psychic)}: ${r.points ? `+${r.points}` : 'no points'}.${callNote}`;
  const mine = me ? t.teams[me] : undefined;
  if (!mine) return { outcome: 'reveal', title: `${team}: ${pointsLine(r)}`, detail };
  if (t.mode === 'together') {
    const outcome: Outcome = r.points >= 3 ? 'win' : r.points === 2 ? 'draw' : 'loss';
    return { outcome, title: pointsLine(r), detail };
  }
  if (mine === r.team) {
    return {
      outcome: r.points >= 3 ? 'win' : r.points === 2 ? 'draw' : 'loss',
      title: r.points ? `${pointsLine(r)} for ${team}` : 'Missed',
      detail,
    };
  }
  if (r.callPoint) return { outcome: 'win', title: 'Good call: +1', detail };
  return {
    outcome: r.points >= 3 ? 'loss' : 'draw',
    title: `${team}: ${pointsLine(r)}`,
    detail,
  };
}
