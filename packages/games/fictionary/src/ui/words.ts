import type { Outcome } from '@jackdaw/ui';
import { CATEGORIES } from '../bank/types';
import { LIE_BEAT_MS, TRUTH_BEAT_MS } from '../constants';
import type { CardResult, FictionaryTableView, RevealEntry } from '../rules';

/**
 * Words and timing shared by Fictionary's screens. The reveal plays the same on every screen from
 * the public `revealAt`, so it needs no requests while it runs: one beat for each lie someone fell
 * for (fewest fooled first), then the truth, then the scores.
 */

export type Beat =
  | { kind: 'lie'; entry: RevealEntry; i: number }
  | { kind: 'truth'; entry: RevealEntry }
  | { kind: 'scores' };

/** The lies that fooled someone, in the order the reveal shows them. */
export function fooledLies(card: CardResult): RevealEntry[] {
  return card.entries
    .filter((e) => !e.truth && e.pickers.length > 0)
    .sort((a, b) => a.pickers.length - b.pickers.length || a.id.localeCompare(b.id));
}

/** Where the reveal is `ms` after it started. */
export function beatAt(card: CardResult, ms: number): Beat {
  const lies = fooledLies(card);
  const i = Math.floor(Math.max(0, ms) / LIE_BEAT_MS);
  if (i < lies.length) return { kind: 'lie', entry: lies[i]!, i };
  if (ms < lies.length * LIE_BEAT_MS + TRUTH_BEAT_MS)
    return { kind: 'truth', entry: card.entries.find((e) => e.truth)! };
  return { kind: 'scores' };
}

/** A beat's own key, so its stamp lands once. */
export const beatKey = (b: Beat) => (b.kind === 'scores' ? 'scores' : `${b.kind}:${b.entry.id}`);

export const catName = (c: string | null) =>
  c ? (CATEGORIES[c as keyof typeof CATEGORIES] ?? c) : '';

export const stageName = (stage: number) =>
  stage === 3 ? 'The Final Fib' : stage === 2 ? 'Round 2' : 'Round 1';

/** "Points doubled" and the like, for the round's banner. */
export const stageLine = (stage: number) =>
  stage === 3
    ? 'One card. Points tripled.'
    : stage === 2
      ? 'Points doubled.'
      : 'Write a lie. Find the truth.';

/** "Card 4 of 7". */
export const cardLine = (t: FictionaryTableView) => `Card ${t.play.n} of ${t.total}`;

/** Names joined for a sentence: "Wren", "Wren and Rook", "Wren, Rook and Finch". */
export function names(ids: string[], name: (id: string) => string): string {
  const n = ids.map(name);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** What everyone is doing, for the head of a screen. */
export function statusLine(t: FictionaryTableView, name: (id: string) => string): string {
  const p = t.play;
  switch (t.phase) {
    case 'choose':
      return p.chooser ? `${name(p.chooser)} is choosing a tab` : 'Choosing a tab';
    case 'write': {
      const left = t.players.length - p.written.length;
      return left === 0 ? 'All lies are in' : `Writing lies: ${left} to go`;
    }
    case 'pick': {
      const left = t.players.length - p.picked.length;
      return left === 0 ? 'All picks are in' : `Finding the truth: ${left} to go`;
    }
    case 'reveal':
      return 'The truth comes out';
    default:
      return 'The book is closed';
  }
}

export const pts = (n: number) => n.toLocaleString('en-US');

/** A player's own moment once the scores come in: found the truth, fooled people, or fell for it. */
export function myMoment(
  card: CardResult,
  me: string | null,
  name: (id: string) => string,
): { outcome: Outcome; title: string; detail: string } {
  const truth = card.entries.find((e) => e.truth)!;
  if (!me || !(me in card.gains))
    return {
      outcome: 'reveal',
      title: truth.pickers.length ? `${truth.pickers.length} found the truth` : 'Nobody found it',
      detail: `It was “${card.answer}”.`,
    };
  const gain = card.gains[me] ?? 0;
  const fooled = card.entries
    .filter((e) => e.by.includes(me))
    .reduce((n, e) => n + e.pickers.length, 0);
  const plus = gain > 0 ? ` +${pts(gain)}` : '';
  if (truth.pickers.includes(me))
    return {
      outcome: 'win',
      title: fooled > 0 ? 'Truth found, and fooled' : 'You found the truth',
      detail: fooled > 0 ? `And your lie fooled ${fooled}.${plus}` : `“${card.answer}”${plus}`,
    };
  if (fooled > 0)
    return {
      outcome: 'win',
      title: `You fooled ${fooled}`,
      detail: `You missed the truth, but your lie worked.${plus}`,
    };
  const fell = card.entries.find((e) => !e.truth && e.pickers.includes(me));
  return {
    outcome: 'loss',
    title: fell ? 'You fell for it' : 'No points this time',
    detail: fell
      ? fell.by.length
        ? `“${fell.text}” was ${names(fell.by, name)}’s lie.`
        : `“${fell.text}” was a house lie.`
      : `It was “${card.answer}”.`,
  };
}
