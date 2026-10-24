import type { CatanTableView } from './rules';

/**
 * The results you feel (see "Every game" in CLAUDE.md), worked out from the public table view
 * only, so a phone never learns anything it shouldn't. `me` is null on the TV, which sees every
 * moment as a reveal. Keys move on with each event, for `useMoment`.
 */
export interface Moment {
  key: number;
  outcome: 'win' | 'loss' | 'reveal';
  kind: 'robbery' | 'road' | 'army';
  /** The thief, or the new holder of the award. */
  who: string | null;
  /** The victim, or the award's old holder. */
  other: string | null;
}

/** Someone took a card: the victim loses, the thief wins. */
export function robberyMoment(tv: CatanTableView, me: string | null): Moment | null {
  const r = tv.robbery;
  if (!r?.victim || !r.took) return null;
  const outcome = me === null ? 'reveal' : me === r.thief ? 'win' : me === r.victim ? 'loss' : null;
  return outcome && { key: r.seq, outcome, kind: 'robbery', who: r.thief, other: r.victim };
}

/** Longest Road or Largest Army changed hands: the new holder wins, the old one loses. */
export function awardMoment(tv: CatanTableView, me: string | null): Moment | null {
  const a = tv.award;
  if (!a) return null;
  const outcome =
    me === null ? (a.to ? 'reveal' : null) : me === a.to ? 'win' : me === a.from ? 'loss' : null;
  return outcome && { key: a.seq, outcome, kind: a.kind, who: a.to, other: a.from };
}
