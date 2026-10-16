import type { Power } from './lineup';
import { lastVoted, tally } from './moments';
import { reasonText, type ShTableView } from './rules';

/**
 * Where the game stands, in words and markers everyone can read, worked out from the public
 * table only (who has voted, never how). Modelled on secret-hitler.online: busy markers on
 * exactly the players the game is waiting on, one named status line, the vote tally once a vote
 * is counted, and a phase banner whenever the phase changes.
 */

/** The players the game is waiting on right now. */
export function busyPlayers(t: ShTableView): string[] {
  const alive = t.players.filter((id) => !t.dead.includes(id));
  switch (t.phase) {
    case 'nominate':
    case 'president':
    case 'veto':
    case 'power':
      return [t.president];
    case 'vote':
      return alive.filter((id) => !t.voted.includes(id));
    case 'chancellor':
      return t.nominee ? [t.nominee] : [];
    case 'over':
      return [];
  }
}

const POWER_STATUS: Record<Power, (p: string) => string> = {
  peek: (p) =>
    `Policy peek: ${p} ${p === 'you' ? 'are' : 'is'} looking at the next three policies.`,
  investigate: (p) => `Investigation: waiting for ${p} to choose a player to investigate.`,
  special: (p) => `Special election: waiting for ${p} to choose the next president.`,
  execute: (p) => `Execution: waiting for ${p} to choose a player to execute.`,
};

/** "the owner, the president" or "you, the president". */
function who(id: string, role: string, me: string | null, name: (id: string) => string) {
  return id === me ? `you, the ${role}` : `${name(id)}, the ${role}`;
}

/** One named line for what the game is waiting on. */
export function statusText(
  t: ShTableView,
  name: (id: string) => string,
  me: string | null = null,
): string {
  const president = who(t.president, 'president', me, name);
  const chancellor = t.nominee ? who(t.nominee, 'chancellor', me, name) : '';
  switch (t.phase) {
    case 'nominate':
      return `Waiting for ${president}, to nominate a chancellor.`;
    case 'vote': {
      const waiting = busyPlayers(t);
      if (waiting.length === 0) return 'Counting the votes.';
      const names = waiting.map((id) => (id === me ? 'you' : name(id)));
      return waiting.length === t.players.length - t.dead.length
        ? `Waiting for everyone to vote on ${name(t.president)} and ${name(t.nominee!)}.`
        : `Waiting for ${names.length === 1 ? names[0] : `${names.length} players`} to vote${names.length > 1 ? `: ${names.join(', ')}` : ''}.`;
    }
    case 'president':
      return `Waiting for ${president}, to choose a policy to discard.`;
    case 'chancellor':
      return `Waiting for ${chancellor}, to choose a policy to enact.`;
    case 'veto':
      return `${cap(chancellor)} has moved to veto the agenda. Waiting for ${president}, to decide.`;
    case 'power':
      return t.pending
        ? POWER_STATUS[t.pending](t.president === me ? 'you' : name(t.president))
        : '';
    case 'over':
      return t.reason ? `${reasonText(t.reason)}.` : 'The game is over.';
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What `me` has to do right now, or null when the game isn't waiting on them. */
export function yourMove(t: ShTableView, me: string | null): string | null {
  if (!me || !t.players.includes(me) || t.dead.includes(me)) return null;
  if (!busyPlayers(t).includes(me)) return null;
  switch (t.phase) {
    case 'nominate':
      return 'Nominate a chancellor';
    case 'vote':
      return 'Vote Ja or Nein';
    case 'president':
      return 'Discard one policy';
    case 'chancellor':
      return 'Enact one policy';
    case 'veto':
      return 'Accept or refuse the veto';
    case 'power':
      return t.pending === 'peek'
        ? 'Look at the next three policies'
        : t.pending === 'investigate'
          ? 'Choose a player to investigate'
          : t.pending === 'special'
            ? 'Choose the next president'
            : 'Choose a player to execute';
    default:
      return null;
  }
}

/** "Ja 3 – Nein 2: elected", for the vote just counted (until the next vote starts). */
export function tallyLine(t: ShTableView): string | null {
  if (t.phase === 'vote') return null;
  const g = lastVoted(t);
  if (!g || t.governments[t.governments.length - 1]?.n !== g.n) return null;
  const { ja, nein } = tally(g);
  return `Ja ${ja} – Nein ${nein}: ${g.passed ? 'elected' : 'voted down'}`;
}

export type BannerPhase = 'nominate' | 'vote' | 'legislate' | 'power';

const BANNER: Record<BannerPhase, string> = {
  nominate: 'Chancellor nomination',
  vote: 'Voting',
  legislate: 'Legislative session',
  power: 'Presidential power',
};

/**
 * The phase banner for this moment, and a key that changes exactly when a new phase starts (so a
 * refresh shows nothing, and the veto's back-and-forth stays inside one legislative session).
 */
export function phaseBanner(t: ShTableView): { key: string; title: string } | null {
  const phase: BannerPhase | null =
    t.phase === 'nominate'
      ? 'nominate'
      : t.phase === 'vote'
        ? 'vote'
        : t.phase === 'president' || t.phase === 'chancellor' || t.phase === 'veto'
          ? 'legislate'
          : t.phase === 'power'
            ? 'power'
            : null;
  if (!phase) return null;
  return { key: `${t.governments.length}:${t.chaos.length}:${phase}`, title: BANNER[phase] };
}
