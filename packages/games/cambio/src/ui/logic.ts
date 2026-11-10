import type { Outcome } from '@jackdaw/ui';
import { cardName, type PowerKind } from '../cards';
import { CALL_PENALTY, type CambioTableView, type Move, type RoundResult } from '../rules';

type Name = (id: string) => string;

export const SLOT_NAME = ['top left', 'top right', 'bottom left', 'bottom right'] as const;

/** What discarding a drawn card with this power does, for the button. */
export const DISCARD_LABEL: Record<PowerKind, string> = {
  peek: 'Discard and peek',
  spy: 'Discard and spy',
  swap: 'Discard and swap',
  king: 'Discard and look',
};

export const discardLabel = (kind: PowerKind | null) => (kind ? DISCARD_LABEL[kind] : 'Discard');

/** The word stamped across the table while a power is used. */
export const STAMP: Record<PowerKind, string> = {
  peek: 'Peek',
  spy: 'Spy',
  swap: 'Swap',
  king: 'King',
};

export function roundLine(t: CambioTableView): string {
  if (t.rounds > 0) return `Round ${t.round} of ${t.rounds}`;
  return `Round ${t.round} · first to ${t.target}`;
}

/** The seats after `me` in turn order (or from the first seat, for a screen with no seat). */
export function around(players: string[], me?: string | null): string[] {
  const start = me && players.includes(me) ? players.indexOf(me) : 0;
  return players.map((_, k) => players[(start + k) % players.length]!);
}

/** Who is up and what they're doing, in one line. `me` makes it "Your turn". */
export function statusLine(t: CambioTableView, me: string | null, name: Name): string {
  if (t.phase === 'peek') {
    const left = t.players.filter((id) => !t.ready.includes(id));
    if (me && left.includes(me)) return 'Remember these two';
    if (left.length === 0) return 'Here we go';
    return `Waiting for ${left.map(name).join(', ')}`;
  }
  if (t.phase === 'scoring') return `Round ${t.round} scored`;
  if (t.phase === 'over') return 'Game over';
  if (!t.toAct) return '';
  if (t.toAct === me) return 'Your turn';
  const who = name(t.toAct);
  if (t.step === 'start') return `${who} is choosing a move`;
  if (t.step === 'held') {
    return t.holding?.from === 'discard'
      ? `${who} took a card and is choosing where it goes`
      : `${who} is choosing a card to swap`;
  }
  if (t.step === 'king') return `${who} is deciding whether to swap`;
  switch (t.power?.kind) {
    case 'peek':
      return `${who} is peeking at a card`;
    case 'spy':
      return `${who} is spying on a card`;
    case 'swap':
      return `${who} is choosing cards to swap`;
    case 'king':
      return `${who} is using a King`;
    default:
      return `${who} is playing`;
  }
}

/** One line of the play by play. */
export function moveLine(m: Move, name: Name, me?: string | null): string {
  const who = m.player === me ? 'You' : name(m.player);
  const of = (id?: string) => (id === me ? 'your' : `${id ? name(id) : 'someone'}’s`);
  const late = m.late ? ' (out of time)' : '';
  switch (m.kind) {
    case 'call':
      return `${who} called Cambio${late}`;
    case 'draw':
      return `${who} drew from the stock${late}`;
    case 'take':
      return `${who} took the ${m.card !== undefined ? cardName(m.card) : 'top card'}${late}`;
    case 'keep':
      return `${who} swapped a card in and discarded the ${m.card !== undefined ? cardName(m.card) : 'old card'}${late}`;
    case 'discard':
      return `${who} discarded the ${m.card !== undefined ? cardName(m.card) : 'card'}${late}`;
    case 'peek':
      return `${who} peeked at ${m.player === me ? 'one of your own' : 'one of their own'}${late}`;
    case 'spy':
      return `${who} looked at one of ${of(m.target)} cards${late}`;
    case 'swap':
    case 'kingSwap':
      return `${who} swapped a card with ${m.target === me ? 'you' : m.target ? name(m.target) : 'someone'}${late}`;
    case 'look':
      return `${who} looked at one of ${of(m.target)} cards and one of ${m.player === me ? 'your' : 'their'} own${late}`;
    case 'kingKeep':
      return `${who} left both cards${late}`;
    case 'skip':
      return `${who} skipped the power${late}`;
    case 'shuffle':
      return 'The discards were shuffled back into the stock';
  }
}

/** The slot keys (owner:slot) the newest move looked at, for the eye stamps. */
export function eyesOf(t: CambioTableView): Map<string, string> {
  const eyes = new Map<string, string>();
  const m = t.moves[t.moves.length - 1];
  if (!m || t.phase !== 'play') return eyes;
  if (m.kind === 'peek' && m.slot !== undefined) eyes.set(`${m.player}:${m.slot}`, m.player);
  if (m.kind === 'spy' && m.target && m.targetSlot !== undefined)
    eyes.set(`${m.target}:${m.targetSlot}`, m.player);
  if (m.kind === 'look') {
    if (m.slot !== undefined) eyes.set(`${m.player}:${m.slot}`, m.player);
    if (m.target && m.targetSlot !== undefined) eyes.set(`${m.target}:${m.targetSlot}`, m.player);
  }
  return eyes;
}

/** How the round's scoring worked, spelled out for the caller. */
export function ruleLine(r: RoundResult, name: Name, me?: string | null): string {
  const caller = r.caller === me ? 'You' : name(r.caller);
  const mine = r.totals[r.caller]!;
  const others = Object.keys(r.totals).filter((id) => id !== r.caller);
  const low = Math.min(...others.map((id) => r.totals[id]!));
  if (r.callerWon) {
    const tied = low === mine;
    return `${caller} called and ${tied ? 'tied for' : 'had'} the lowest: 0`;
  }
  const beat = others.filter((id) => r.totals[id] === low)[0]!;
  const rival = beat === me ? 'you' : name(beat);
  return `${caller} called but ${rival} ${beat === me ? 'were' : 'was'} lower: ${mine} + ${CALL_PENALTY}`;
}

/** Everyone's score for the round, lowest first. */
export function rankRound(r: RoundResult): string[] {
  return Object.keys(r.scored).sort((a, b) => r.scored[a]! - r.scored[b]!);
}

/** Your result for the round just scored, from public numbers only. */
export function roundMoment(
  t: CambioTableView,
  me: string | null,
  name: Name,
): { outcome: Outcome; title: string; detail: string } | null {
  const r = t.last;
  if (!r) return null;
  const low = Math.min(...Object.values(r.scored));
  const best = Object.keys(r.scored).filter((id) => r.scored[id] === low);
  const names = best.map(name).join(' and ');
  if (!me || !t.players.includes(me)) {
    return {
      outcome: 'reveal',
      title: best.length > 1 ? `${names} tied` : `${names} had the lowest`,
      detail: `${low} ${low === 1 ? 'point' : 'points'} this round`,
    };
  }
  const mine = r.scored[me]!;
  if (mine === low) {
    return best.length > 1
      ? {
          outcome: 'draw',
          title: 'A tie for lowest',
          detail: `You and ${best
            .filter((id) => id !== me)
            .map(name)
            .join(' and ')} scored ${mine}`,
        }
      : {
          outcome: 'win',
          title: 'You had the lowest!',
          detail: `${mine} ${mine === 1 ? 'point' : 'points'} this round`,
        };
  }
  return {
    outcome: 'loss',
    title: `${names} had the lowest`,
    detail: `You scored ${mine} this round.`,
  };
}
