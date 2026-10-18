import { beats, type Pick, type RoundResult } from './rules';

/**
 * How a resolved round went, worked out only from the public round result (every pick is public
 * once the round resolves), so phones and the TV can celebrate it without any hidden info.
 */
export interface RoundOutcome {
  /** The round's top scorers. Empty when everyone scored the same (a stand-off). */
  winners: string[];
  /** For one player: did they take the round (alone or shared), lose it, or was it a stand-off? */
  outcome: 'win' | 'loss' | 'draw';
  /** Who this player's throw beat, and who beat it. */
  beat: string[];
  lostTo: string[];
}

export function roundWinners(result: RoundResult): string[] {
  const ids = Object.keys(result.picks);
  const points = ids.map((id) => result.points[id] ?? 0);
  const best = Math.max(0, ...points);
  if (points.every((p) => p === best)) return [];
  return ids.filter((id) => (result.points[id] ?? 0) === best);
}

export function roundOutcome(result: RoundResult, me: string): RoundOutcome {
  const winners = roundWinners(result);
  const mine = result.picks[me];
  const others = Object.keys(result.picks).filter((id) => id !== me);
  const beat = mine ? others.filter((id) => beats(mine, result.picks[id]!)) : [];
  const lostTo = mine ? others.filter((id) => beats(result.picks[id]!, mine)) : [];
  const outcome = winners.length === 0 ? 'draw' : winners.includes(me) ? 'win' : 'loss';
  return { winners, outcome, beat, lostTo };
}

/** "Rook", "Rook and Magpie", "Rook, Magpie and 2 others". */
export function listNames(ids: string[], name: (id: string) => string, max = 2): string {
  const names = ids.map(name);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`;
}

/** One plain line for a player's round: who their throw beat, or what beat it. */
export function describeRound(
  result: RoundResult,
  me: string,
  name: (id: string) => string,
): string {
  const { outcome, beat, lostTo } = roundOutcome(result, me);
  const mine = result.picks[me];
  if (!mine) return '';
  if (outcome === 'draw') {
    if (new Set(Object.values(result.picks)).size === 1) return `Everyone threw ${mine}.`;
    return 'Rock, paper and scissors all came out, so nobody got ahead.';
  }
  const points = result.points[me] ?? 0;
  const pts = `+${points} point${points === 1 ? '' : 's'}`;
  if (beat.length > 0 && lostTo.length === 0)
    return `Your ${mine} beat ${listNames(beat, name)}. ${pts}.`;
  if (beat.length > 0)
    return `Your ${mine} beat ${listNames(beat, name)} but lost to ${listNames(lostTo, name)}. ${pts}.`;
  if (lostTo.length > 0) {
    const theirs: Pick = result.picks[lostTo[0]!]!;
    return `${listNames(lostTo, name)} beat your ${mine} with ${theirs}.`;
  }
  return `Your ${mine} didn't beat anyone this time.`;
}
