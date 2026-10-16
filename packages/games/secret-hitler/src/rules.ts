import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  FASCIST_WIN,
  HITLER_ZONE,
  LIBERAL_WIN,
  VETO_AT,
  boardFor,
  deckFor,
  defaultOptions,
  fascistTeamSize,
  optionsSchema,
  validateShOptions,
  type Policy,
  type Power,
  type Role,
  type ShOptions,
  type Team,
} from './lineup';
import { meta } from './meta';

/**
 * Secret Hitler for 5 to 15 players. 5 to 10 follow the official rules exactly; 11 to 15 use
 * the house rules in lineup.ts.
 *
 * A round: the president nominates a chancellor, everyone alive votes Ja or Nein at once, and a
 * passed government legislates (the president draws three policies and discards one, the
 * chancellor enacts one of the two left). Fascist policies give the president a power. Three
 * failed elections in a row enact the top policy with no power and clear the term limits.
 */

export type Phase = 'nominate' | 'vote' | 'president' | 'chancellor' | 'veto' | 'power' | 'over';
export type Winner = 'liberal' | 'fascist';
export type WinReason = 'liberal-policies' | 'fascist-policies' | 'hitler-elected' | 'hitler-shot';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('nominate'), chancellor: z.string().min(1).max(64) }),
  z.object({ type: z.literal('vote'), ja: z.boolean() }),
  /** President: the policy to throw away from the three drawn. */
  z.object({ type: z.literal('discard'), policy: z.enum(['liberal', 'fascist']) }),
  /** Chancellor: the policy to enact from the two passed on. */
  z.object({ type: z.literal('enact'), policy: z.enum(['liberal', 'fascist']) }),
  /** Chancellor, once veto is unlocked: ask the president to throw both away. */
  z.object({ type: z.literal('veto') }),
  z.object({ type: z.literal('vetoReply'), accept: z.boolean() }),
  /** President: use the power. Investigate, special election and execution need a target. */
  z.object({ type: z.literal('power'), target: z.string().min(1).max(64).optional() }),
]);
export type ShAction = z.infer<typeof actionSchema>;

/** One government, from nomination to whatever it did. Hidden parts stay server-side. */
export interface Government {
  n: number;
  president: string;
  chancellor: string;
  /** Filled in once the vote resolves (votes are hidden until everyone has voted). */
  votes: Record<string, boolean>;
  passed: boolean;
  /** Hidden until the game ends: what the president drew and discarded, what the chancellor dropped. */
  drawn?: Policy[];
  presidentDiscard?: Policy;
  chancellorDiscard?: Policy;
  enacted?: Policy;
  vetoAsked?: boolean;
  vetoed?: boolean;
  power?: { kind: Power; target?: string };
  /** The hidden result of an investigation, or the cards seen by a peek. */
  secret?: { team?: Team; cards?: Policy[] };
  /** Electing Hitler chancellor after three Fascist policies ended the game. */
  hitlerElected?: boolean;
}

/** A top-decked policy after three failed elections in a row. */
export interface Chaos {
  /** The government count it came after, so it sorts into the timeline. */
  after: number;
  enacted: Policy;
}

export interface ShState {
  players: string[];
  roles: Record<string, Role>;
  dead: string[];
  /** Fascist policy slots' powers for this table. */
  board: (Power | null)[];
  deck: Policy[];
  discard: Policy[];
  liberal: number;
  fascist: number;
  tracker: number;
  phase: Phase;
  /** The regular presidential rotation (a special election doesn't move it). */
  rotation: string;
  president: string;
  nominee: string | null;
  /** Term limits: the last elected government. Cleared by chaos. */
  lastPresident: string | null;
  lastChancellor: string | null;
  /** Secret ballots for the current vote. Never leave the server until everyone has voted. */
  ballots: Record<string, boolean>;
  /** The president's three, then the chancellor's two. */
  hand: Policy[];
  /** A special election picked this player as the next president. */
  special: string | null;
  /** The power waiting for the president. */
  pending: Power | null;
  governments: Government[];
  chaos: Chaos[];
  /** Who investigated whom, and what they learned (each player can be investigated once). */
  investigations: { by: string; target: string; team: Team }[];
  winner: Winner | null;
  reason: WinReason | null;
  options: ShOptions;
  recap: RecapEvent[];
}

/** A government as everyone saw it. */
export interface PublicGovernment {
  n: number;
  president: string;
  chancellor: string;
  votes: Record<string, boolean>;
  passed: boolean;
  enacted?: Policy;
  vetoed?: boolean;
  /** The power used and on whom (not what it showed). */
  power?: { kind: Power; target?: string };
}

/** The last thing that happened, for the TV's announcements and the phones' moments. */
export type ShEvent =
  | { kind: 'vote'; n: number; passed: boolean }
  | { kind: 'enacted'; policy: Policy; by: 'government' | 'chaos'; count: number }
  | { kind: 'veto'; n: number }
  | { kind: 'power'; power: Power; president: string; target?: string };

/** Everything public: the TV and every phone render this. */
export interface ShTableView {
  players: string[];
  dead: string[];
  board: (Power | null)[];
  liberal: number;
  fascist: number;
  tracker: number;
  phase: Phase;
  president: string;
  nominee: string | null;
  lastPresident: string | null;
  lastChancellor: string | null;
  /** Who has voted in the current election. Not how. */
  voted: string[];
  /** Who may be nominated chancellor right now. */
  eligible: string[];
  deckCount: number;
  discardCount: number;
  pending: Power | null;
  vetoUnlocked: boolean;
  /** This government's chancellor already asked for a veto (it can only be asked once). */
  vetoAsked: boolean;
  governments: PublicGovernment[];
  chaos: Chaos[];
  /** Counts so everyone knows the shape of the table. */
  lineup: { liberals: number; fascists: number };
  /** Counts that move on whenever a vote resolves or a policy is enacted (for moments). */
  votesResolved: number;
  enactedCount: number;
  event: ShEvent | null;
  /** Players ruled out as Hitler by being elected chancellor with three or more Fascist policies down. */
  notHitler: string[];
  winner: Winner | null;
  reason: WinReason | null;
  /** Only once the game is over. */
  roles: Record<string, Role> | null;
}

export interface ShPlayerView extends ShTableView {
  me: string;
  myRole: Role | null;
  /** Who you know is on the Fascist team, with their roles. */
  known: { id: string; role: Role }[];
  /** Your ballot in the current vote, if you've cast it. */
  myVote: boolean | null;
  /** Policy cards in your hand right now (president or chancellor during legislation). */
  hand: Policy[];
  /** Results of investigations you made. */
  investigations: { target: string; team: Team }[];
  /** The top three cards, if you are the president using a peek right now. */
  peek: Policy[] | null;
}

export const teamOf = (role: Role): Team => (role === 'liberal' ? 'liberal' : 'fascist');
const alive = (s: ShState) => s.players.filter((id) => !s.dead.includes(id));

function fail(message: string, code = 'ILLEGAL'): never {
  throw new GameError(code, message);
}

/** The next alive player after `id`, clockwise. */
function nextAlive(s: ShState, id: string): string {
  const n = s.players.length;
  const start = s.players.indexOf(id);
  for (let i = 1; i <= n; i++) {
    const p = s.players[(start + i) % n]!;
    if (!s.dead.includes(p)) return p;
  }
  return id;
}

/** Who the president may nominate: alive, not themself, not term-limited. */
export function eligibleChancellors(s: ShState): string[] {
  const living = alive(s);
  return living.filter((id) => {
    if (id === s.president) return false;
    if (id === s.lastChancellor) return false;
    // The last president is term-limited too, unless only five players are left.
    if (id === s.lastPresident && living.length > 5) return false;
    return true;
  });
}

/** Shuffle the discards back in once fewer than three cards are left to draw. */
function refill(s: ShState, rng: Rng): Pick<ShState, 'deck' | 'discard'> {
  if (s.deck.length >= 3) return { deck: s.deck, discard: s.discard };
  return { deck: rng.shuffle([...s.deck, ...s.discard]), discard: [] };
}

/** After a government ends or chaos: start the next round with the next president. */
function nextRound(s: ShState): ShState {
  if (s.winner) return s;
  let president: string;
  let rotation = s.rotation;
  let special = s.special;
  if (special && !s.dead.includes(special)) {
    president = special;
    special = null;
  } else {
    special = null;
    rotation = nextAlive(s, s.rotation);
    president = rotation;
  }
  return {
    ...s,
    phase: 'nominate',
    president,
    rotation,
    special,
    nominee: null,
    ballots: {},
    hand: [],
    pending: null,
  };
}

function checkPolicyWin(s: ShState): ShState {
  if (s.liberal >= LIBERAL_WIN)
    return { ...s, phase: 'over', winner: 'liberal', reason: 'liberal-policies' };
  if (s.fascist >= FASCIST_WIN)
    return { ...s, phase: 'over', winner: 'fascist', reason: 'fascist-policies' };
  return s;
}

function enact(s: ShState, policy: Policy): ShState {
  return {
    ...s,
    liberal: s.liberal + (policy === 'liberal' ? 1 : 0),
    fascist: s.fascist + (policy === 'fascist' ? 1 : 0),
  };
}

const updateGov = (s: ShState, patch: Partial<Government>): Government[] =>
  s.governments.map((g, i) => (i === s.governments.length - 1 ? { ...g, ...patch } : g));

const current = (s: ShState) => s.governments[s.governments.length - 1]!;

/** Three failed elections: the top policy goes straight onto the board, with no power. */
function chaos(s: ShState, rng: Rng): ShState {
  const policy = s.deck[0]!;
  let next: ShState = enact(
    {
      ...s,
      deck: s.deck.slice(1),
      tracker: 0,
      lastPresident: null,
      lastChancellor: null,
      chaos: [...s.chaos, { after: s.governments.length, enacted: policy }],
      recap: [
        ...s.recap,
        {
          text: `Three governments failed in a row: the top policy, ${policy}, was enacted with no power.`,
          data: { kind: 'chaos', policy },
        },
      ],
    },
    policy,
  );
  next = { ...next, ...refill(next, rng) };
  next = checkPolicyWin(next);
  return nextRound(next);
}

/** A government enacted `policy`: count it, check for a win, then any power. */
function afterEnactment(s: ShState, policy: Policy, rng: Rng): ShState {
  let next: ShState = enact({ ...s, tracker: 0, hand: [] }, policy);
  next = { ...next, ...refill(next, rng) };
  next = checkPolicyWin(next);
  if (next.winner) return next;
  const power = policy === 'fascist' ? (next.board[next.fascist - 1] ?? null) : null;
  if (power) return { ...next, phase: 'power', pending: power };
  return nextRound(next);
}

function setup(playerIds: string[], options: ShOptions, rng: Rng): ShState {
  const n = playerIds.length;
  const team = fascistTeamSize(n, options);
  const roles: Role[] = [
    'hitler',
    ...Array<Role>(team - 1).fill('fascist'),
    ...Array<Role>(n - team).fill('liberal'),
  ];
  const dealt = rng.shuffle(roles);
  const deckSize = deckFor(n, options);
  const deck = rng.shuffle<Policy>([
    ...Array<Policy>(deckSize.liberal).fill('liberal'),
    ...Array<Policy>(deckSize.fascist).fill('fascist'),
  ]);
  const first = playerIds[rng.int(n)]!;
  return {
    players: playerIds,
    roles: Object.fromEntries(playerIds.map((id, i) => [id, dealt[i]!])),
    dead: [],
    board: boardFor(n),
    deck,
    discard: [],
    liberal: 0,
    fascist: 0,
    tracker: 0,
    phase: 'nominate',
    rotation: first,
    president: first,
    nominee: null,
    lastPresident: null,
    lastChancellor: null,
    ballots: {},
    hand: [],
    special: null,
    pending: null,
    governments: [],
    chaos: [],
    investigations: [],
    winner: null,
    reason: null,
    options,
    recap: [],
  };
}

function publicGovernment(g: Government): PublicGovernment {
  return {
    n: g.n,
    president: g.president,
    chancellor: g.chancellor,
    votes: g.votes,
    passed: g.passed,
    ...(g.enacted ? { enacted: g.enacted } : {}),
    ...(g.vetoed ? { vetoed: true } : {}),
    ...(g.power ? { power: g.power } : {}),
  };
}

/** The last public event, worked out from the state (so it never carries anything hidden). */
function lastEvent(s: ShState): ShEvent | null {
  const g = s.governments[s.governments.length - 1];
  const c = s.chaos[s.chaos.length - 1];
  const enactedCount = s.liberal + s.fascist;
  if (c && (!g || c.after >= g.n))
    return { kind: 'enacted', policy: c.enacted, by: 'chaos', count: enactedCount };
  if (!g) return null;
  if (g.power && (s.phase !== 'power' || s.pending === null))
    return { kind: 'power', power: g.power.kind, president: g.president, target: g.power.target };
  if (g.enacted)
    return { kind: 'enacted', policy: g.enacted, by: 'government', count: enactedCount };
  if (g.vetoed) return { kind: 'veto', n: g.n };
  if (Object.keys(g.votes).length > 0) return { kind: 'vote', n: g.n, passed: g.passed };
  return null;
}

function tableView(s: ShState): ShTableView {
  const over = s.phase === 'over';
  const team = fascistTeamSize(s.players.length, s.options);
  return {
    players: s.players,
    dead: s.dead,
    board: s.board,
    liberal: s.liberal,
    fascist: s.fascist,
    tracker: s.tracker,
    phase: s.phase,
    president: s.president,
    nominee: s.nominee,
    lastPresident: s.lastPresident,
    lastChancellor: s.lastChancellor,
    voted: s.phase === 'vote' ? Object.keys(s.ballots) : [],
    eligible: s.phase === 'nominate' ? eligibleChancellors(s) : [],
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    pending: s.pending,
    vetoUnlocked: s.fascist >= VETO_AT,
    vetoAsked:
      (s.phase === 'chancellor' || s.phase === 'veto') && Boolean(s.governments.at(-1)?.vetoAsked),
    governments: s.governments.map(publicGovernment),
    chaos: s.chaos,
    lineup: { liberals: s.players.length - team, fascists: team - 1 },
    votesResolved: s.governments.filter((g) => Object.keys(g.votes).length > 0).length,
    enactedCount: s.liberal + s.fascist,
    event: lastEvent(s),
    notHitler: s.governments
      .filter((g) => g.passed && !g.hitlerElected && fascistBefore(s, g) >= HITLER_ZONE)
      .map((g) => g.chancellor),
    winner: s.winner,
    reason: s.reason,
    roles: over ? s.roles : null,
  };
}

/** How many Fascist policies were down when government `g` was voted in. */
function fascistBefore(s: ShState, g: Government): number {
  let f = 0;
  for (const other of s.governments) {
    if (other.n >= g.n) break;
    if (other.enacted === 'fascist') f++;
  }
  for (const c of s.chaos) if (c.after < g.n && c.enacted === 'fascist') f++;
  return f;
}

/** Who this player knows is Fascist: Fascists know the team; Hitler only at 5–6 players. */
function knownTo(s: ShState, id: string): { id: string; role: Role }[] {
  const role = s.roles[id];
  const sees = role === 'fascist' || (role === 'hitler' && s.players.length <= 6);
  if (!sees) return [];
  return s.players
    .filter((p) => p !== id && s.roles[p] !== 'liberal')
    .map((p) => ({ id: p, role: s.roles[p]! }));
}

function playerView(s: ShState, id: string): ShPlayerView {
  const seated = s.players.includes(id);
  const holdsHand =
    (s.phase === 'president' && id === s.president) ||
    ((s.phase === 'chancellor' || s.phase === 'veto') && id === s.nominee);
  return {
    ...tableView(s),
    me: id,
    myRole: seated ? s.roles[id]! : null,
    known: seated ? knownTo(s, id) : [],
    myVote: s.phase === 'vote' && id in s.ballots ? s.ballots[id]! : null,
    hand: holdsHand ? s.hand : [],
    investigations: s.investigations
      .filter((x) => x.by === id)
      .map(({ target, team }) => ({ target, team })),
    peek:
      s.phase === 'power' && s.pending === 'peek' && id === s.president ? s.deck.slice(0, 3) : null,
  };
}

const NAMES: Record<Role, string> = { liberal: 'Liberal', fascist: 'Fascist', hitler: 'Hitler' };
export const roleName = (r: Role) => NAMES[r];

function apply(s: ShState, me: string, a: ShAction, rng: Rng): ShState {
  if (s.phase === 'over') fail('The game is over.', 'GAME_OVER');
  if (!s.players.includes(me)) fail("You're not in this game.", 'NOT_A_PLAYER');
  if (s.dead.includes(me)) fail('Executed players take no further part.', 'DEAD');

  switch (a.type) {
    case 'nominate': {
      if (s.phase !== 'nominate') fail('Not the time to nominate.');
      if (me !== s.president) fail('Only the president nominates.');
      if (!eligibleChancellors(s).includes(a.chancellor))
        fail("That player can't be chancellor this round.");
      return { ...s, phase: 'vote', nominee: a.chancellor, ballots: {} };
    }

    case 'vote': {
      if (s.phase !== 'vote') fail('There is no vote right now.');
      // You can change your vote until the last one is in.
      const ballots = { ...s.ballots, [me]: a.ja };
      const living = alive(s);
      if (living.some((id) => !(id in ballots))) return { ...s, ballots };

      const ja = living.filter((id) => ballots[id]).length;
      const passed = ja > living.length / 2;
      const gov: Government = {
        n: s.governments.length + 1,
        president: s.president,
        chancellor: s.nominee!,
        votes: ballots,
        passed,
      };
      const voted: ShState = { ...s, ballots: {}, governments: [...s.governments, gov] };
      const tally = `Ja ${ja}, Nein ${living.length - ja}`;
      if (!passed) {
        const failed: ShState = {
          ...voted,
          tracker: s.tracker + 1,
          recap: [
            ...s.recap,
            {
              round: gov.n,
              actor: s.president,
              text: `${s.president} nominated ${s.nominee}: ${tally}. Voted down.`,
              data: { kind: 'vote', n: gov.n },
            },
          ],
        };
        return failed.tracker >= 3 ? chaos(failed, rng) : nextRound(failed);
      }
      const elected: ShState = {
        ...voted,
        lastPresident: s.president,
        lastChancellor: s.nominee,
        recap: [
          ...s.recap,
          {
            round: gov.n,
            actor: s.president,
            text: `${s.president} nominated ${s.nominee}: ${tally}. Elected.`,
            data: { kind: 'vote', n: gov.n },
          },
        ],
      };
      if (s.fascist >= HITLER_ZONE && s.roles[s.nominee!] === 'hitler') {
        return {
          ...elected,
          governments: updateGov(elected, { hitlerElected: true }),
          phase: 'over',
          winner: 'fascist',
          reason: 'hitler-elected',
        };
      }
      const drawn = s.deck.slice(0, 3);
      return {
        ...elected,
        phase: 'president',
        deck: s.deck.slice(3),
        hand: drawn,
        governments: updateGov(elected, { drawn }),
      };
    }

    case 'discard': {
      if (s.phase !== 'president') fail('Not the time to discard.');
      if (me !== s.president) fail('Only the president discards now.');
      const i = s.hand.indexOf(a.policy);
      if (i < 0) fail(`You don't hold a ${a.policy} policy.`);
      const hand = s.hand.filter((_, j) => j !== i);
      return {
        ...s,
        phase: 'chancellor',
        hand,
        discard: [...s.discard, a.policy],
        governments: updateGov(s, { presidentDiscard: a.policy }),
      };
    }

    case 'enact': {
      if (s.phase !== 'chancellor') fail('Not the time to enact.');
      if (me !== s.nominee) fail('Only the chancellor enacts.');
      const i = s.hand.indexOf(a.policy);
      if (i < 0) fail(`You don't hold a ${a.policy} policy.`);
      const dropped = s.hand[1 - i]!;
      const g = current(s);
      const withGov: ShState = {
        ...s,
        discard: [...s.discard, dropped],
        governments: updateGov(s, { enacted: a.policy, chancellorDiscard: dropped }),
        recap: [
          ...s.recap,
          {
            round: g.n,
            actor: s.nominee!,
            text: `${s.nominee} enacted a ${a.policy} policy.`,
            secret: `${s.president} drew ${g.drawn!.join(', ')} and discarded ${g.presidentDiscard}; ${s.nominee} discarded ${dropped}.`,
            data: { kind: 'enacted', n: g.n },
          },
        ],
      };
      return afterEnactment(withGov, a.policy, rng);
    }

    case 'veto': {
      if (s.phase !== 'chancellor') fail('Not the time to veto.');
      if (me !== s.nominee) fail('Only the chancellor can ask for a veto.');
      if (s.fascist < VETO_AT) fail('Veto unlocks after five Fascist policies.');
      if (current(s).vetoAsked) fail('The president already refused a veto this session.');
      return { ...s, phase: 'veto', governments: updateGov(s, { vetoAsked: true }) };
    }

    case 'vetoReply': {
      if (s.phase !== 'veto') fail('Nobody has asked for a veto.');
      if (me !== s.president) fail('Only the president answers a veto.');
      if (!a.accept) return { ...s, phase: 'chancellor' };
      // Both cards are thrown away, and it counts as a failed government on the tracker.
      const g = current(s);
      const vetoed: ShState = {
        ...s,
        hand: [],
        discard: [...s.discard, ...s.hand],
        tracker: s.tracker + 1,
        governments: updateGov(s, { vetoed: true }),
        recap: [
          ...s.recap,
          {
            round: g.n,
            actor: s.president,
            text: `${s.nominee} asked for a veto and ${s.president} agreed. Nothing was enacted.`,
            secret: `${s.president} drew ${g.drawn!.join(', ')} and discarded ${g.presidentDiscard}; both ${s.hand.join(' and ')} were vetoed.`,
            data: { kind: 'veto', n: g.n },
          },
        ],
      };
      const refilled: ShState = { ...vetoed, ...refill(vetoed, rng) };
      return refilled.tracker >= 3 ? chaos(refilled, rng) : nextRound(refilled);
    }

    case 'power': {
      if (s.phase !== 'power' || !s.pending) fail('There is no power to use.');
      if (me !== s.president) fail('Only the president uses the power.');
      const power = s.pending;
      const g = current(s);
      if (power === 'peek') {
        const cards = s.deck.slice(0, 3);
        return nextRound({
          ...s,
          governments: updateGov(s, { power: { kind: 'peek' }, secret: { cards } }),
          recap: [
            ...s.recap,
            {
              round: g.n,
              actor: me,
              text: `${me} looked at the top three policies.`,
              secret: `They were ${cards.join(', ')}.`,
              data: { kind: 'power', power },
            },
          ],
        });
      }
      const target = a.target;
      if (!target || !alive(s).includes(target) || target === me)
        fail('Pick another player who is still in the game.');
      if (power === 'investigate') {
        if (s.investigations.some((x) => x.target === target))
          fail('That player has already been investigated.');
        const team = teamOf(s.roles[target]!);
        return nextRound({
          ...s,
          investigations: [...s.investigations, { by: me, target, team }],
          governments: updateGov(s, { power: { kind: power, target }, secret: { team } }),
          recap: [
            ...s.recap,
            {
              round: g.n,
              actor: me,
              text: `${me} investigated ${target}.`,
              secret: `${target} is ${team === 'liberal' ? 'a Liberal' : 'on the Fascist team'}.`,
              data: { kind: 'power', power },
            },
          ],
        });
      }
      if (power === 'special') {
        return nextRound({
          ...s,
          special: target,
          governments: updateGov(s, { power: { kind: power, target } }),
          recap: [
            ...s.recap,
            {
              round: g.n,
              actor: me,
              text: `${me} called a special election: ${target} is the next president.`,
              data: { kind: 'power', power },
            },
          ],
        });
      }
      // Execution.
      const shot: ShState = {
        ...s,
        dead: [...s.dead, target],
        governments: updateGov(s, { power: { kind: power, target } }),
        recap: [
          ...s.recap,
          {
            round: g.n,
            actor: me,
            text: `${me} executed ${target}.`,
            data: { kind: 'power', power },
          },
        ],
      };
      if (s.roles[target] === 'hitler')
        return { ...shot, pending: null, phase: 'over', winner: 'liberal', reason: 'hitler-shot' };
      return nextRound(shot);
    }
  }
}

const REASON: Record<WinReason, string> = {
  'liberal-policies': 'Liberals win: five Liberal policies enacted',
  'fascist-policies': 'Fascists win: six Fascist policies enacted',
  'hitler-elected': 'Fascists win: Hitler was elected chancellor',
  'hitler-shot': 'Liberals win: Hitler was executed',
};
export const reasonText = (r: WinReason) => REASON[r];

/** Everything about the game, now that it's over: the reveal behind the recap screen. */
export interface ShReveal {
  roles: Record<string, Role>;
  governments: Government[];
  chaos: Chaos[];
  dead: string[];
  winner: Winner;
  reason: WinReason;
  liberal: number;
  fascist: number;
}

export const secretHitler: GameModule<ShState, ShAction, ShPlayerView, ShTableView, ShOptions> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,
  validateOptions: validateShOptions,
  setup: ({ playerIds, options, rng }) => setup(playerIds, options, rng),
  getPlayerView: playerView,
  getTableView: tableView,
  applyAction: (state, playerId, action, rng) => apply(state, playerId, action, rng),

  getResult(s): GameResult | null {
    if (s.phase !== 'over' || !s.winner || !s.reason) return null;
    const winners = s.players.filter((id) => teamOf(s.roles[id]!) === s.winner);
    const reveal: ShReveal = {
      roles: s.roles,
      governments: s.governments,
      chaos: s.chaos,
      dead: s.dead,
      winner: s.winner,
      reason: s.reason,
      liberal: s.liberal,
      fascist: s.fascist,
    };
    return {
      winners,
      summary: REASON[s.reason],
      reveal,
      recap: s.recap,
      standings: s.players.map((playerId) => {
        const role = s.roles[playerId]!;
        return {
          playerId,
          outcome: teamOf(role) === s.winner ? 'win' : 'loss',
          team: teamOf(role) === 'liberal' ? 'Liberal' : 'Fascist',
          role: NAMES[role],
        };
      }),
    };
  },

  announce(prev, next) {
    if (!prev) return ['The roles are dealt. {' + next.president + '} is the first president.'];
    const lines: string[] = [];
    if (next.liberal + next.fascist > prev.liberal + prev.fascist) {
      const policy = next.liberal > prev.liberal ? 'Liberal' : 'Fascist';
      lines.push(`A ${policy} policy was enacted.`);
    }
    for (const id of next.dead) if (!prev.dead.includes(id)) lines.push(`{${id}} was executed.`);
    return lines;
  },
};
