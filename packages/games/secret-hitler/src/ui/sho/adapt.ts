import type { ScreenPlayer } from '@jackdaw/ui';
import type { Policy, Role as ShRole } from '../../lineup';
import type { ShPlayerView, ShReveal, ShTableView, WinReason } from '../../rules';
import {
  LobbyState,
  type GameState,
  type Look,
  type PlayerState,
  type PolicyType,
  type Role,
} from './types';

/**
 * Jackdaw's Secret Hitler views, reshaped into the game state secret-hitler.online's screens
 * read. Only what the view already holds goes in, so nothing hidden can leak through here: a
 * player's own role, the team a Fascist knows, and everyone's at the end.
 */

const up = (p: Policy) => p.toUpperCase() as PolicyType;
const ROLE: Record<ShRole, Role> = { liberal: 'LIBERAL', fascist: 'FASCIST', hitler: 'HITLER' };

export const VICTORY: Record<WinReason, LobbyState> = {
  'liberal-policies': LobbyState.LIBERAL_VICTORY_POLICY,
  'hitler-shot': LobbyState.LIBERAL_VICTORY_EXECUTION,
  'fascist-policies': LobbyState.FASCIST_VICTORY_POLICY,
  'hitler-elected': LobbyState.FASCIST_VICTORY_ELECTION,
};

/** A player's crest and colour, and their id for the seat animation. */
export const lookOf = (id: string, p?: ScreenPlayer): Look => ({
  crest: p?.avatar.crest ?? '',
  tint: p?.avatar.tint ?? '',
  id,
});

/** Display names by id. Jackdaw keeps names unique in a lobby, so they can key the game. */
export function namesFor(ids: string[], players: ScreenPlayer[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? id;
  const ids_ = new Map(ids.map((id) => [name(id), id]));
  return {
    name,
    idOf: (n: string) => ids_.get(n) ?? n,
    icon: Object.fromEntries(ids.map((id) => [name(id), lookOf(id, byId.get(id))])),
  };
}

type Public = Pick<
  ShTableView,
  'players' | 'dead' | 'governments' | 'chaos' | 'liberal' | 'fascist' | 'tracker'
>;

/** The last policy put on the board, by a government or by three failed elections. */
function lastPolicy(t: Public): string {
  let last: Policy | null = null;
  const chaosAfter = (n: number) => t.chaos.filter((c) => c.after === n);
  for (const c of chaosAfter(0)) last = c.enacted;
  for (const g of t.governments) {
    if (g.enacted) last = g.enacted;
    for (const c of chaosAfter(g.n)) last = c.enacted;
  }
  return last ? up(last) : '';
}

/** Three failed elections put the last policy down (no government came after it). */
function chaosLast(t: Public) {
  const c = t.chaos[t.chaos.length - 1];
  const g = t.governments[t.governments.length - 1];
  return Boolean(c && (!g || c.after >= g.n));
}

function stateOf(t: ShTableView): LobbyState {
  switch (t.phase) {
    case 'nominate':
      return LobbyState.CHANCELLOR_NOMINATION;
    case 'vote':
      return LobbyState.CHANCELLOR_VOTING;
    case 'president':
      return LobbyState.LEGISLATIVE_PRESIDENT;
    case 'chancellor':
      return LobbyState.LEGISLATIVE_CHANCELLOR;
    case 'veto':
      return LobbyState.LEGISLATIVE_PRESIDENT_VETO;
    case 'power':
      return t.pending === 'peek'
        ? LobbyState.PP_PEEK
        : t.pending === 'investigate'
          ? LobbyState.PP_INVESTIGATE
          : t.pending === 'special'
            ? LobbyState.PP_ELECTION
            : LobbyState.PP_EXECUTION;
    case 'post':
      return LobbyState.POST_LEGISLATIVE;
    case 'over':
      return t.reason ? VICTORY[t.reason] : LobbyState.POST_LEGISLATIVE;
  }
}

const POWER_STATE = {
  peek: LobbyState.PP_PEEK,
  investigate: LobbyState.PP_INVESTIGATE,
  special: LobbyState.PP_ELECTION,
  execute: LobbyState.PP_EXECUTION,
} as const;

function playersOf(
  t: Public,
  name: (id: string) => string,
  roleOf: (id: string) => ShRole | undefined,
): Record<string, PlayerState> {
  const investigated = new Set(
    t.governments.filter((g) => g.power?.kind === 'investigate').map((g) => g.power!.target),
  );
  return Object.fromEntries(
    t.players.map((id) => {
      const role = roleOf(id);
      const p: PlayerState = { alive: !t.dead.includes(id), investigated: investigated.has(id) };
      if (role) p.id = ROLE[role];
      return [name(id), p];
    }),
  );
}

/** The game as one player (or, with no view, a TV) sees it. */
export function toGameState(
  t: ShTableView,
  v: ShPlayerView | null,
  screenPlayers: ScreenPlayer[],
): GameState {
  const { name, icon } = namesFor(t.players, screenPlayers);
  const known = new Map<string, ShRole>(v ? v.known.map((k) => [k.id, k.role]) : []);
  if (v?.myRole) known.set(v.me, v.myRole);
  const roleOf = (id: string) => t.roles?.[id] ?? known.get(id);
  const gov = t.governments[t.governments.length - 1];
  const state = stateOf(t);
  const named = (votes: Record<string, boolean>) =>
    Object.fromEntries(Object.entries(votes).map(([id, ja]) => [name(id), ja]));

  let lastState: LobbyState = LobbyState.CHANCELLOR_NOMINATION;
  if (state === LobbyState.POST_LEGISLATIVE && gov) {
    lastState = gov.power
      ? POWER_STATE[gov.power.kind]
      : gov.enacted
        ? LobbyState.LEGISLATIVE_CHANCELLOR
        : LobbyState.CHANCELLOR_VOTING;
  }

  const meIs = (who: string | null) => Boolean(v && who && v.me === who);
  const gs: GameState = {
    state,
    lastState,
    playerOrder: t.players.map(name),
    players: playersOf(t, name, roleOf),
    president: name(t.president),
    chancellor: t.phase === 'nominate' || !t.nominee ? '' : name(t.nominee),
    lastPresident: t.lastPresident ? name(t.lastPresident) : '',
    lastChancellor: t.lastChancellor ? name(t.lastChancellor) : '',
    electionTracker: t.tracker,
    electionTrackerAdvanced: chaosLast(t),
    // During a vote only who has voted is public; the votes themselves show once it's counted.
    userVotes:
      t.phase === 'vote'
        ? Object.fromEntries(t.voted.map((id) => [name(id), false]))
        : named(gov?.votes ?? {}),
    liberalPolicies: t.liberal,
    fascistPolicies: t.fascist,
    drawSize: t.deckCount,
    discardSize: t.discardCount,
    lastPolicy: lastPolicy(t),
    vetoOccurred: t.vetoAsked,
    icon,
    deckTotal: t.deckTotal,
    lineup: t.lineup,
  };
  if (t.phase === 'president' && meIs(t.president)) gs.presidentChoices = v!.hand.map(up);
  if ((t.phase === 'chancellor' || t.phase === 'veto') && meIs(t.nominee))
    gs.chancellorChoices = v!.hand.map(up);
  if (v?.peek) gs.peek = v.peek.map(up);
  if (state === LobbyState.POST_LEGISLATIVE && gov?.power?.target)
    gs.targetUser = name(gov.power.target);
  return gs;
}

/** The final state once the game is over, from the reveal: everyone's role shows. */
export function finalGameState(r: ShReveal, screenPlayers: ScreenPlayer[]): GameState {
  const { name, icon } = namesFor(r.players, screenPlayers);
  const gov = r.governments[r.governments.length - 1];
  const t: Public = {
    players: r.players,
    dead: r.dead,
    governments: r.governments,
    chaos: r.chaos,
    liberal: r.liberal,
    fascist: r.fascist,
    tracker: r.tracker,
  };
  const gs: GameState = {
    state: VICTORY[r.reason],
    lastState: LobbyState.POST_LEGISLATIVE,
    playerOrder: r.players.map(name),
    players: playersOf(t, name, (id) => r.roles[id]),
    president: gov ? name(gov.president) : '',
    chancellor: gov ? name(gov.chancellor) : '',
    lastPresident: '',
    lastChancellor: '',
    electionTracker: r.tracker,
    electionTrackerAdvanced: chaosLast(t),
    userVotes: Object.fromEntries(
      Object.entries(gov?.votes ?? {}).map(([id, ja]) => [name(id), ja]),
    ),
    liberalPolicies: r.liberal,
    fascistPolicies: r.fascist,
    drawSize: r.deckCount,
    discardSize: r.discardCount,
    lastPolicy: lastPolicy(t),
    vetoOccurred: false,
    icon,
    deckTotal: r.deckTotal,
    lineup: r.lineup,
  };
  if (r.reason === 'hitler-shot' && gov?.power?.target) gs.targetUser = name(gov.power.target);
  return gs;
}
