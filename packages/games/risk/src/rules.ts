import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  NEUTRAL,
  STARTING_ARMIES,
  attackTargets,
  continentsHeld,
  reachable,
  reinforcementCount,
  territoriesOf,
  type Armies,
  type Owner,
} from './board';
import { allSets, bestSet, isSet, makeDeck, setValue, type Card, type CardSets } from './cards';
import { getMap, type MapDef, type MapId } from './maps';
import { riskBot } from './bot';
import { visibleTo } from './fog';
import { meta } from './meta';
import {
  dealMissions,
  fallback,
  missionDone,
  missionLabel,
  missionText,
  type Mission,
} from './missions';

/**
 * Risk for 2–6 players on the classic world or Jackdaw's own realm. Territories are dealt at
 * random; each turn you reinforce (territories / 3, at least 3, plus continents and card sets),
 * attack as often as you like (Roll one exchange or Blitz until it's settled), then fortify once.
 * Taking a territory earns a card at the end of your turn. With secret missions the first to
 * complete theirs wins; in world domination, the last player standing. Two players share the
 * board with a passive neutral army. See docs/superpowers/specs/2026-10-18-risk-design.md.
 */

/** The Map option's names for each board (Skerries and Twin Crowns added 2026-10-24). */
export const MAPS_BY_NAME = {
  World: 'world',
  Realm: 'realm',
  Skerries: 'skerries',
  'Twin Crowns': 'twin',
} as const satisfies Record<string, MapId>;
const GOALS = ['Secret missions', 'World domination'] as const;
const SETUPS = ['Quick', 'Draft'] as const;
const CARD_SETS = ['Rising', 'Fixed'] as const;
const CLOCKS = ['Off', '1 minute', '2 minutes', '3 minutes'] as const;

export const optionsSchema = z.object({
  map: z.enum(['World', 'Realm', 'Skerries', 'Twin Crowns']).describe('Map'),
  goal: z.enum(GOALS).describe('Goal'),
  setup: z.enum(SETUPS).describe('Setup'),
  cardSets: z.enum(CARD_SETS).describe('Card sets'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
  fog: z.boolean().describe('Fog of war'),
});
export type RiskOptions = z.infer<typeof optionsSchema>;

const territory = z.string().min(1).max(40);
const placements = z.record(territory, z.number().int().positive().max(500));

export const actionSchema = z.discriminatedUnion('type', [
  /** Draft setup: all of your remaining starting armies at once. */
  z.object({ type: z.literal('draft'), placements }),
  z.object({ type: z.literal('trade'), cards: z.tuple([z.string(), z.string(), z.string()]) }),
  /** Every army you have to place, at once. */
  z.object({ type: z.literal('reinforce'), placements }),
  z.object({
    type: z.literal('attack'),
    from: territory,
    to: territory,
    mode: z.enum(['roll', 'blitz']),
  }),
  /** After a conquest: how many armies move in. */
  z.object({ type: z.literal('occupy'), n: z.number().int().positive() }),
  z.object({ type: z.literal('endAttack') }),
  z.object({
    type: z.literal('fortify'),
    from: territory,
    to: territory,
    n: z.number().int().positive(),
  }),
  z.object({ type: z.literal('endTurn') }),
]);
export type RiskAction = z.infer<typeof actionSchema>;

export type Phase = 'draft' | 'reinforce' | 'attack' | 'occupy' | 'fortify' | 'over';

/** One attack move (a single Roll, or a whole Blitz): the last dice and what it cost. */
export interface Battle {
  seq: number;
  attacker: string;
  defender: string;
  from: string;
  to: string;
  mode: 'roll' | 'blitz';
  /** The last throw's dice, highest first (a blitz shows its last throw). */
  attackDice: number[];
  defendDice: number[];
  /** How many throws it took (1 for a roll). */
  throws: number;
  attackerLost: number;
  defenderLost: number;
  /**
   * Both sides' losses over the whole run of attacks on this border this turn (a few Rolls, say),
   * for the verdict when it's settled. Older games don't have it.
   */
  runLost?: { attacker: number; defender: number };
  conquered: boolean;
  /** Settled: taken, or the attacker can't go on from there. */
  ended: boolean;
}

export interface RiskState {
  map: MapId;
  goal: 'missions' | 'domination';
  cardSets: CardSets;
  turnSecs: number;
  /**
   * Fog of war: each player sees owners and armies only on their own territories and the ones
   * next door; the table view carries none until the game is over. Older games don't have it.
   */
  fog?: boolean;
  /** Players in seat order (the neutral isn't one). */
  seats: string[];
  /** Whose turn opens each round. */
  first: string;
  neutral: boolean;
  owner: Owner;
  armies: Armies;
  phase: Phase;
  turn: string;
  round: number;
  /** Armies the player to move still has to place. */
  toPlace: number;
  /** A trade forced mid-attack (6+ cards after an elimination) returns to attacking. */
  returnTo: 'attack' | null;
  drafts: Record<string, { left: number; placed: Record<string, number> | null }> | null;
  occupy: { from: string; to: string; min: number; max: number } | null;
  takenThisTurn: number;
  deck: Card[];
  discard: Card[];
  hands: Record<string, Card[]>;
  setsTraded: number;
  missions: Record<string, Mission> | null;
  /** Out of the game, in order. */
  eliminated: string[];
  /** Who took each eliminated player out. */
  eliminatedBy: Record<string, string>;
  battle: Battle | null;
  battleSeq: number;
  /**
   * The attack run under way (same from → to): both sides' losses together, for the bloodiest
   * battle, and each side's (older games don't have them), for the verdict.
   */
  run: {
    from: string;
    to: string;
    lost: number;
    attackerLost?: number;
    defenderLost?: number;
  } | null;
  /** The 2 armies for a traded territory you hold come once a turn: given already this turn. */
  tradeBonus?: boolean;
  best: {
    battle: { pid: string; value: number; text: string } | null;
    conquest: { pid: string; value: number } | null;
  };
  log: RecapEvent[];
  actBy: number | null;
  winner: string | null;
}

export interface RiskTableView {
  map: MapId;
  goal: RiskState['goal'];
  cardSets: CardSets;
  seats: string[];
  neutral: boolean;
  /** Fog of war is down (on, and the game not over): `owner` and `armies` are empty here. */
  fog: boolean;
  /** Territories each seat (and the neutral) holds: public even in the fog. */
  held: Record<string, number>;
  owner: Owner;
  armies: Armies;
  phase: Phase;
  turn: string;
  round: number;
  toPlace: number;
  occupy: RiskState['occupy'];
  handCounts: Record<string, number>;
  /** What the next set is worth (rising sets only). */
  nextSetValue: number | null;
  setsTraded: number;
  /** Players who've finished drafting. */
  draftDone: string[];
  eliminated: string[];
  battle: Battle | null;
  actBy: number | null;
  log: RecapEvent[];
  /** Everyone's mission, once the game is over. */
  missions: Record<string, Mission> | null;
  winner: string | null;
}

export interface RiskView {
  hand: Card[];
  mission: Mission | null;
  /** Your draft, while it's still hidden from the others. */
  draft: Record<string, number> | null;
  draftLeft: number;
  /** In fog of war, what you can see through it (null with the fog off, or once it's over). */
  sight: FogSight | null;
}

/**
 * What one player sees through the fog: owners and armies on their own territories and their
 * neighbours, and the parts of the turn that would give positions away (only to whoever they
 * concern). `seen` lays it over the table view.
 */
export interface FogSight {
  owner: Owner;
  armies: Armies;
  /** Your armies still to place, on your turn. */
  toPlace: number;
  /** Your move-in after a conquest. */
  occupy: RiskState['occupy'];
  /** The last battle, if you fought in it or can see both ends of it. */
  battle: Battle | null;
}

/** The log is the recap, so it keeps a whole game (a long one runs to a few hundred lines). */
const LOG_KEEP = 1000;
const LOG_SHOWN = 12;

export const mapOf = (s: { map: MapId }): MapDef => getMap(s.map);

function turnSecsOf(o: RiskOptions): number {
  return o.turnTimer === 'Off' ? 0 : Number.parseInt(o.turnTimer, 10) * 60;
}

/** Sets `actBy` when the turn changes or a draft starts (none with the timer off or once over). */
function stamp(prev: RiskState | null, s: RiskState, now: number): RiskState {
  if (!s.turnSecs || s.phase === 'over') return s.actBy === null ? s : { ...s, actBy: null };
  const fresh = !prev || prev.turn !== s.turn || (prev.phase === 'draft') !== (s.phase === 'draft');
  return fresh ? { ...s, actBy: now + s.turnSecs * 1000 } : s;
}

function setup(ctx: {
  playerIds: string[];
  options: RiskOptions;
  rng: Rng;
  now: number;
}): RiskState {
  const { playerIds, options: o, rng, now } = ctx;
  const map = getMap(MAPS_BY_NAME[o.map]);
  const neutral = playerIds.length === 2;
  const holders = neutral ? [...playerIds, NEUTRAL] : playerIds;
  const owner: Owner = {};
  const armies: Armies = {};
  rng.shuffle(map.territories.map((t) => t.id)).forEach((t, i) => {
    owner[t] = holders[i % holders.length]!;
    armies[t] = 1;
  });
  const startWith = STARTING_ARMIES[playerIds.length]!;
  const draft = o.setup === 'Draft';
  const spread = (pid: string, n: number) => {
    const mine = territoriesOf(owner, pid);
    for (let k = 0; k < n; k++) armies[rng.pick(mine)]! += 1;
  };
  for (const h of holders) {
    if (h === NEUTRAL || !draft) spread(h, startWith - territoriesOf(owner, h).length);
  }
  const first = playerIds[rng.int(playerIds.length)]!;
  const s: RiskState = {
    map: map.id,
    goal: o.goal === 'Secret missions' ? 'missions' : 'domination',
    cardSets: o.cardSets === 'Rising' ? 'rising' : 'fixed',
    turnSecs: turnSecsOf(o),
    fog: !!o.fog,
    seats: [...playerIds],
    first,
    neutral,
    owner,
    armies,
    phase: draft ? 'draft' : 'reinforce',
    turn: first,
    round: 1,
    toPlace: draft ? 0 : reinforcementCount(map, owner, first),
    returnTo: null,
    drafts: draft
      ? Object.fromEntries(
          playerIds.map((p) => [
            p,
            { left: startWith - territoriesOf(owner, p).length, placed: null },
          ]),
        )
      : null,
    occupy: null,
    takenThisTurn: 0,
    deck: rng.shuffle(makeDeck(map)),
    discard: [],
    hands: Object.fromEntries(playerIds.map((p) => [p, []])),
    setsTraded: 0,
    missions: o.goal === 'Secret missions' ? dealMissions(map, playerIds, rng) : null,
    eliminated: [],
    eliminatedBy: {},
    battle: null,
    battleSeq: 0,
    run: null,
    tradeBonus: false,
    best: { battle: null, conquest: null },
    log: [{ round: 1, actor: first, text: '{actor} goes first' }],
    actBy: null,
    winner: null,
  };
  return stamp(null, s, now);
}

/** Fog of war is down on the board: on, and the game still going. */
const fogged = (s: RiskState) => !!s.fog && s.phase !== 'over';

/** Recap lines that name a territory, told without it while the fog is down. */
function foggedLog(log: RecapEvent[]): RecapEvent[] {
  return log.map((e) =>
    e.data && typeof e.data === 'object' && 'to' in e.data
      ? { round: e.round, actor: e.actor, text: '{actor} takes a territory' }
      : e,
  );
}

function getTableView(s: RiskState): RiskTableView {
  const fog = fogged(s);
  const held: Record<string, number> = {};
  for (const p of [...s.seats, ...(s.neutral ? [NEUTRAL] : [])])
    held[p] = territoriesOf(s.owner, p).length;
  return {
    map: s.map,
    goal: s.goal,
    cardSets: s.cardSets,
    seats: s.seats,
    neutral: s.neutral,
    fog,
    held,
    owner: fog ? {} : s.owner,
    armies: fog ? {} : s.armies,
    phase: s.phase,
    turn: s.turn,
    round: s.round,
    toPlace: fog ? 0 : s.toPlace,
    occupy: fog ? null : s.occupy,
    handCounts: Object.fromEntries(s.seats.map((p) => [p, s.hands[p]?.length ?? 0])),
    nextSetValue: s.cardSets === 'rising' ? setValue('rising', s.setsTraded, []) : null,
    setsTraded: s.setsTraded,
    draftDone: s.drafts ? s.seats.filter((p) => s.drafts![p]?.placed) : [],
    eliminated: s.eliminated,
    battle: fog ? null : s.battle,
    actBy: s.actBy,
    log: fog ? foggedLog(s.log.slice(-LOG_SHOWN)) : s.log.slice(-LOG_SHOWN),
    missions: s.phase === 'over' ? s.missions : null,
    winner: s.winner,
  };
}

function sightOf(s: RiskState, pid: string): FogSight {
  const seen = visibleTo(mapOf(s), s.owner, pid);
  const owner: Owner = {};
  const armies: Armies = {};
  for (const t of seen) {
    owner[t] = s.owner[t]!;
    armies[t] = s.armies[t]!;
  }
  const b = s.battle;
  const mine = s.turn === pid && s.phase !== 'draft';
  return {
    owner,
    armies,
    toPlace: mine ? s.toPlace : 0,
    occupy: mine ? s.occupy : null,
    battle:
      b && (b.attacker === pid || b.defender === pid || (seen.has(b.from) && seen.has(b.to)))
        ? b
        : null,
  };
}

function getPlayerView(s: RiskState, pid: string): RiskView {
  const d = s.drafts?.[pid];
  return {
    hand: s.hands[pid] ?? [],
    mission: s.missions?.[pid] ?? null,
    draft: d?.placed ?? null,
    draftLeft: d && !d.placed ? d.left : 0,
    sight: fogged(s) && s.seats.includes(pid) ? sightOf(s, pid) : null,
  };
}

const refuse = (code: string, message: string): never => {
  throw new GameError(code, message);
};

/** Adds an event to the log (keeping the last few dozen). */
function logged(s: RiskState, text: string, actor = s.turn, data?: unknown): RiskState {
  const e: RecapEvent = { round: s.round, actor, text, ...(data === undefined ? {} : { data }) };
  return { ...s, log: [...s.log, e].slice(-LOG_KEEP) };
}

/** Checks a set of placements: your own territories, adding up to exactly `total`. */
function checkPlacements(
  s: RiskState,
  pid: string,
  placements: Record<string, number>,
  total: number,
) {
  let sum = 0;
  for (const [t, n] of Object.entries(placements)) {
    if (s.owner[t] !== pid)
      refuse('not-yours', 'You can only place armies on your own territories.');
    sum += n;
  }
  if (sum !== total)
    refuse('wrong-count', `Place exactly ${total} ${total === 1 ? 'army' : 'armies'}.`);
}

function addArmies(armies: Armies, placements: Record<string, number>): Armies {
  const next = { ...armies };
  for (const [t, n] of Object.entries(placements)) next[t] = (next[t] ?? 0) + n;
  return next;
}

function draft(s: RiskState, pid: string, placements: Record<string, number>): RiskState {
  const d = s.drafts?.[pid];
  if (!d) return refuse('not-playing', 'You’re not in this game.');
  if (d.placed) return refuse('already-placed', 'You’ve already placed your armies.');
  checkPlacements(s, pid, placements, d.left);
  const drafts = { ...s.drafts!, [pid]: { ...d, placed: placements } };
  if (s.seats.some((p) => !drafts[p]!.placed)) return { ...s, drafts };
  // Everyone's done: every draft appears at once and the first turn begins.
  const armies = s.seats.reduce((acc, p) => addArmies(acc, drafts[p]!.placed!), s.armies);
  const map = mapOf(s);
  return logged(
    {
      ...s,
      armies,
      drafts: null,
      phase: 'reinforce',
      toPlace: reinforcementCount(map, s.owner, s.turn),
    },
    'The armies are placed',
  );
}

function trade(s: RiskState, pid: string, ids: string[]): RiskState {
  if (s.phase !== 'reinforce') return refuse('wrong-phase', 'Trade cards before you place armies.');
  const hand = s.hands[pid] ?? [];
  if (new Set(ids).size !== 3) return refuse('bad-set', 'Pick three different cards.');
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return refuse('bad-set', 'You don’t hold those cards.');
  const set = cards as Card[];
  if (!isSet(set)) return refuse('bad-set', 'Those three don’t make a set.');
  const value = setValue(s.cardSets, s.setsTraded, set);
  // Two extra armies go straight onto one traded territory you hold, once a turn.
  const bonusOn = s.tradeBonus
    ? undefined
    : set.find((c) => c.territory && s.owner[c.territory] === pid)?.territory;
  const armies = bonusOn ? { ...s.armies, [bonusOn]: s.armies[bonusOn]! + 2 } : s.armies;
  return logged(
    {
      ...s,
      armies,
      tradeBonus: s.tradeBonus || !!bonusOn,
      hands: { ...s.hands, [pid]: hand.filter((c) => !ids.includes(c.id)) },
      discard: [...s.discard, ...set],
      setsTraded: s.setsTraded + 1,
      toPlace: s.toPlace + value,
    },
    `{actor} trades a set for ${value} armies`,
    pid,
    { value },
  );
}

function reinforce(s: RiskState, pid: string, placements: Record<string, number>): RiskState {
  if (s.phase !== 'reinforce') return refuse('wrong-phase', 'You’ve already placed your armies.');
  if ((s.hands[pid]?.length ?? 0) >= 5)
    return refuse('must-trade', 'With five or more cards you must trade a set first.');
  checkPlacements(s, pid, placements, s.toPlace);
  return {
    ...s,
    armies: addArmies(s.armies, placements),
    toPlace: 0,
    phase: 'attack',
    returnTo: null,
  };
}

const nameOf = (map: MapDef, t: string) => map.territories.find((x) => x.id === t)?.name ?? t;

const roll = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => rng.int(6) + 1).sort((x, y) => y - x);

/** One exchange of dice: returns the dice and how many each side lost. */
function exchange(rng: Rng, attacking: number, defending: number) {
  const attackDice = roll(rng, Math.min(3, attacking - 1));
  const defendDice = roll(rng, Math.min(2, defending));
  let attackerLost = 0;
  let defenderLost = 0;
  for (let i = 0; i < Math.min(attackDice.length, defendDice.length); i++) {
    if (attackDice[i]! > defendDice[i]!) defenderLost++;
    else attackerLost++;
  }
  return { attackDice, defendDice, attackerLost, defenderLost };
}

function attack(
  s: RiskState,
  pid: string,
  a: { from: string; to: string; mode: 'roll' | 'blitz' },
  rng: Rng,
): RiskState {
  if (s.phase !== 'attack') return refuse('wrong-phase', 'You can’t attack now.');
  const map = mapOf(s);
  if (s.owner[a.from] !== pid) return refuse('not-yours', 'Attack from one of your territories.');
  if (!attackTargets(map, s.owner, s.armies, pid, a.from).includes(a.to))
    return refuse(
      'bad-target',
      s.armies[a.from]! < 2
        ? 'You need at least 2 armies to attack.'
        : 'You can only attack an enemy next door.',
    );
  const defender = s.owner[a.to]!;
  let atk = s.armies[a.from]!;
  let def = s.armies[a.to]!;
  let attackerLost = 0;
  let defenderLost = 0;
  let last = exchange(rng, atk, def);
  let throws = 1;
  for (;;) {
    atk -= last.attackerLost;
    def -= last.defenderLost;
    attackerLost += last.attackerLost;
    defenderLost += last.defenderLost;
    if (a.mode === 'roll' || def === 0 || atk < 2) break;
    last = exchange(rng, atk, def);
    throws++;
  }
  // A run of attacks on the same border: both sides' losses together (the bloodiest battle)
  // and each side's (the verdict).
  const same = s.run && s.run.from === a.from && s.run.to === a.to;
  const run = {
    from: a.from,
    to: a.to,
    lost: (same ? s.run!.lost : 0) + attackerLost + defenderLost,
    attackerLost: (same ? (s.run!.attackerLost ?? 0) : 0) + attackerLost,
    defenderLost: (same ? (s.run!.defenderLost ?? 0) : 0) + defenderLost,
  };
  const conquered = def === 0;
  const seq = s.battleSeq + 1;
  const battle: Battle = {
    seq,
    attacker: pid,
    defender,
    from: a.from,
    to: a.to,
    mode: a.mode,
    attackDice: last.attackDice,
    defendDice: last.defendDice,
    throws,
    attackerLost,
    defenderLost,
    runLost: { attacker: run.attackerLost, defender: run.defenderLost },
    conquered,
    ended: conquered || atk < 2,
  };
  const best =
    run.lost > (s.best.battle?.value ?? 0)
      ? {
          ...s.best,
          battle: { pid, value: run.lost, text: `${nameOf(map, a.from)} to ${nameOf(map, a.to)}` },
        }
      : s.best;
  let next: RiskState = {
    ...s,
    armies: { ...s.armies, [a.from]: atk, [a.to]: def },
    battle,
    battleSeq: seq,
    run,
    best,
  };
  if (!conquered) return next;
  // The dice rolled last move in at once; occupy can send more.
  const min = last.attackDice.length;
  next = {
    ...next,
    owner: { ...next.owner, [a.to]: pid },
    armies: { ...next.armies, [a.from]: atk - min, [a.to]: min },
    phase: 'occupy',
    occupy: { from: a.from, to: a.to, min, max: atk - 1 },
    takenThisTurn: s.takenThisTurn + 1,
  };
  if (next.takenThisTurn > (next.best.conquest?.value ?? 0))
    next = { ...next, best: { ...next.best, conquest: { pid, value: next.takenThisTurn } } };
  next = logged(next, `{actor} takes ${nameOf(map, a.to)}`, pid, { to: a.to, from: defender });
  return defender !== NEUTRAL && territoriesOf(next.owner, defender).length === 0
    ? knockOut(next, pid, defender)
    : next;
}

/** `loser` has no territories left: out of the game, their cards to whoever took them out. */
function knockOut(s: RiskState, by: string, loser: string): RiskState {
  const eliminatedBy = { ...s.eliminatedBy, [loser]: by };
  const missions =
    s.missions &&
    Object.fromEntries(
      Object.entries(s.missions).map(([p, m]) => [p, fallback(m, p, eliminatedBy)]),
    );
  return logged(
    {
      ...s,
      eliminated: [...s.eliminated, loser],
      eliminatedBy,
      missions,
      hands: {
        ...s.hands,
        [by]: [...(s.hands[by] ?? []), ...(s.hands[loser] ?? [])],
        [loser]: [],
      },
    },
    `{actor} is knocked out`,
    loser,
  );
}

function occupy(s: RiskState, n: number): RiskState {
  if (s.phase !== 'occupy' || !s.occupy) return refuse('wrong-phase', 'Nothing to move in.');
  const { from, to, min, max } = s.occupy;
  if (n < min || n > max)
    return refuse('wrong-count', min === max ? `Move in ${min}.` : `Move in ${min} to ${max}.`);
  const next: RiskState = {
    ...s,
    armies: { ...s.armies, [from]: s.armies[from]! - (n - min), [to]: s.armies[to]! + (n - min) },
    occupy: null,
    phase: 'attack',
  };
  // Six or more cards after a knock-out: trade down to four or fewer before attacking again.
  return (next.hands[next.turn]?.length ?? 0) >= 6
    ? { ...next, phase: 'reinforce', returnTo: 'attack' }
    : next;
}

function fortify(s: RiskState, pid: string, a: { from: string; to: string; n: number }, rng: Rng) {
  if (s.phase !== 'attack' && s.phase !== 'fortify')
    return refuse('wrong-phase', 'You can’t move armies now.');
  if (!reachable(mapOf(s), s.owner, pid, a.from).includes(a.to))
    return refuse('bad-move', 'Move between your own territories that join up.');
  if (a.n > s.armies[a.from]! - 1) return refuse('wrong-count', 'Leave at least 1 army behind.');
  const moved = {
    ...s,
    armies: { ...s.armies, [a.from]: s.armies[a.from]! - a.n, [a.to]: s.armies[a.to]! + a.n },
  };
  return endTurn(moved, rng);
}

/** Draws the top card, reshuffling the discard pile into a fresh deck if it's run out. */
function draw(s: RiskState, pid: string, rng: Rng): RiskState {
  let { deck, discard } = s;
  if (!deck.length) [deck, discard] = [rng.shuffle(discard), []];
  if (!deck.length) return s;
  const [top, ...rest] = deck;
  return {
    ...s,
    deck: rest,
    discard,
    hands: { ...s.hands, [pid]: [...(s.hands[pid] ?? []), top!] },
  };
}

function endTurn(s: RiskState, rng: Rng): RiskState {
  if (s.phase !== 'attack' && s.phase !== 'fortify')
    return refuse('wrong-phase', 'Finish placing or moving in first.');
  const done = s.takenThisTurn > 0 ? draw(s, s.turn, rng) : s;
  // Seats measured from whoever went first, so a new round starts when that count wraps.
  const n = s.seats.length;
  const rel = (p: string) => (s.seats.indexOf(p) - s.seats.indexOf(s.first) + n) % n;
  const alive = s.seats.filter((p) => !s.eliminated.includes(p));
  const after = alive.filter((p) => rel(p) > rel(s.turn));
  const next = after.length
    ? after.sort((x, y) => rel(x) - rel(y))[0]!
    : alive.sort((x, y) => rel(x) - rel(y))[0]!;
  const round = rel(next) <= rel(s.turn) ? s.round + 1 : s.round;
  return {
    ...done,
    turn: next,
    round,
    phase: 'reinforce',
    toPlace: reinforcementCount(mapOf(s), s.owner, next),
    takenThisTurn: 0,
    run: null,
    tradeBonus: false,
    occupy: null,
    returnTo: null,
  };
}

/**
 * After every move: one player left, or the mover's mission complete, ends the game. The mover is
 * passed in, since a fortify or the end of a turn has already handed the turn on. After a
 * knock-out (since `before`), a destroy mission may have fallen back to one someone already meets,
 * so then everyone still in is checked, the mover first.
 */
function settle(s: RiskState, mover: string, before: RiskState): RiskState {
  if (s.phase === 'over' || s.phase === 'draft') return s;
  const alive = s.seats.filter((p) => !s.eliminated.includes(p));
  const knocked = s.eliminated.length > before.eliminated.length;
  const done = (p: string) => {
    const mission = s.missions?.[p];
    return !!mission && missionDone(mission, mapOf(s), s.owner, s.armies, p, s.eliminatedBy);
  };
  const won =
    alive.length === 1
      ? alive[0]!
      : (knocked ? [mover, ...alive.filter((p) => p !== mover)] : [mover]).find(done);
  if (!won) return s;
  return logged(
    { ...s, phase: 'over', winner: won, occupy: null, actBy: null },
    '{actor} wins',
    won,
  );
}

function applyAction(s: RiskState, pid: string, a: RiskAction, rng: Rng): RiskState {
  if (s.phase === 'over') return refuse('over', 'The game is over.');
  if (!s.seats.includes(pid) || s.eliminated.includes(pid))
    return refuse('not-playing', 'You’re not in this game.');
  if (s.phase === 'draft') {
    if (a.type !== 'draft') return refuse('wrong-phase', 'Place your starting armies first.');
    return draft(s, pid, a.placements);
  }
  if (pid !== s.turn) return refuse('not-your-turn', 'It’s not your turn.');
  switch (a.type) {
    case 'trade':
      return trade(s, pid, a.cards);
    case 'reinforce':
      return reinforce(s, pid, a.placements);
    case 'attack':
      return attack(s, pid, a, rng);
    case 'occupy':
      return occupy(s, a.n);
    case 'endAttack':
      if (s.phase !== 'attack') return refuse('wrong-phase', 'You’re not attacking.');
      return { ...s, phase: 'fortify' };
    case 'fortify':
      return fortify(s, pid, a, rng);
    case 'endTurn':
      return endTurn(s, rng);
    case 'draft':
      return refuse('wrong-phase', 'The armies are already placed.');
  }
}

/** `n` armies spread at random over `pid`'s territories. */
function spread(s: RiskState, pid: string, n: number, rng: Rng): Record<string, number> {
  const mine = territoriesOf(s.owner, pid);
  const out: Record<string, number> = {};
  for (let k = 0; k < n; k++) {
    const t = rng.pick(mine);
    out[t] = (out[t] ?? 0) + 1;
  }
  return out;
}

/**
 * Out of time. A draft spreads whatever's unplaced; a turn makes any forced trade, spreads the
 * armies left to place, moves the fewest in after a conquest, and ends (with a card if earned).
 */
function timeUp(s: RiskState, rng: Rng): RiskState {
  if (s.phase === 'draft') {
    return s.seats.reduce((next, p) => {
      const d = next.drafts?.[p];
      return d && !d.placed ? draft(next, p, spread(next, p, d.left, rng)) : next;
    }, s);
  }
  const who = s.turn;
  let next = s;
  for (let guard = 0; guard < 20 && next.turn === who && next.phase !== 'over'; guard++) {
    if (next.phase === 'occupy') next = settle(occupy(next, next.occupy!.min), who, next);
    else if (next.phase === 'reinforce') {
      while ((next.hands[who]?.length ?? 0) >= 5) {
        const set = bestSet(next.hands[who]!, next.cardSets, next.setsTraded)!;
        next = trade(
          next,
          who,
          set.map((c) => c.id),
        );
      }
      next = settle(reinforce(next, who, spread(next, who, next.toPlace, rng)), who, next);
    } else next = endTurn(next, rng);
  }
  return next;
}

function waitingOn(s: RiskState): string[] {
  if (s.phase === 'over') return [];
  if (s.phase === 'draft') return s.seats.filter((p) => s.drafts?.[p] && !s.drafts[p].placed);
  return [s.turn];
}

/**
 * A handful of moves `pid` could make now (not every one: a few placements and fortifies, but
 * every attack). Used to play random games in tests and to drive end-to-end runs.
 */
export function legalMoves(s: RiskState, pid: string): RiskAction[] {
  if (s.phase === 'over' || !waitingOn(s).includes(pid)) return [];
  const map = mapOf(s);
  const mine = territoriesOf(s.owner, pid);
  const fronts = mine.filter(
    (t) => attackTargets(map, s.owner, { ...s.armies, [t]: 2 }, pid, t).length,
  );
  switch (s.phase) {
    case 'draft': {
      const left = s.drafts![pid]!.left;
      const spots = (fronts.length ? fronts : mine).slice(0, 3);
      return spots.map((t) => ({ type: 'draft', placements: left ? { [t]: left } : {} }));
    }
    case 'reinforce': {
      const hand = s.hands[pid] ?? [];
      const trades: RiskAction[] = allSets(hand)
        .slice(0, 2)
        .map((set) => ({ type: 'trade', cards: set.map((c) => c.id) as [string, string, string] }));
      if (hand.length >= 5) return trades;
      const spots = (fronts.length ? fronts : mine).slice(0, 4);
      return [
        ...trades,
        ...spots.map((t): RiskAction => ({
          type: 'reinforce',
          placements: s.toPlace ? { [t]: s.toPlace } : {},
        })),
      ];
    }
    case 'attack':
      return [
        ...mine.flatMap((from) =>
          attackTargets(map, s.owner, s.armies, pid, from).flatMap((to) =>
            (['roll', 'blitz'] as const).map((mode): RiskAction => ({
              type: 'attack',
              from,
              to,
              mode,
            })),
          ),
        ),
        { type: 'endAttack' },
        { type: 'endTurn' },
      ];
    case 'occupy': {
      const { min, max } = s.occupy!;
      return min === max
        ? [{ type: 'occupy', n: min }]
        : [
            { type: 'occupy', n: min },
            { type: 'occupy', n: max },
          ];
    }
    case 'fortify': {
      const from = [...mine].sort((x, y) => s.armies[y]! - s.armies[x]!)[0]!;
      const to = reachable(map, s.owner, pid, from).find((t) => fronts.includes(t));
      return [
        { type: 'endTurn' },
        ...(to && s.armies[from]! > 1
          ? [{ type: 'fortify', from, to, n: s.armies[from]! - 1 } as RiskAction]
          : []),
      ];
    }
  }
}

/** Everything safe to show once the game is over. */
export interface RiskReveal {
  map: MapId;
  /** Seat order, which sets each army's colour. */
  seats: string[];
  owner: Owner;
  armies: Armies;
  missions: Record<string, Mission> | null;
  eliminated: string[];
  winner: string | null;
  rounds: number;
}

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

const revealOf = (s: RiskState, winner: string | null): RiskReveal => ({
  map: s.map,
  seats: s.seats,
  owner: s.owner,
  armies: s.armies,
  missions: s.missions,
  eliminated: s.eliminated,
  winner,
  rounds: s.round,
});

function highlightsOf(s: RiskState): NonNullable<GameResult['highlights']> {
  const highlights: NonNullable<GameResult['highlights']> = [];
  if (s.best.battle)
    highlights.push({
      award: 'Bloodiest battle',
      playerIds: [s.best.battle.pid],
      text: `${s.best.battle.value} armies lost, ${s.best.battle.text}`,
      value: s.best.battle.value,
    });
  if (s.best.conquest)
    highlights.push({
      award: 'Greatest conquest',
      playerIds: [s.best.conquest.pid],
      text: `${s.best.conquest.value} territories in one turn`,
      value: s.best.conquest.value,
    });
  return highlights;
}

function standingsOf(s: RiskState, winners: string[]): GameResult['standings'] {
  const map = mapOf(s);
  return s.seats.map((p) => ({
    playerId: p,
    outcome: winners.includes(p) ? 'win' : 'loss',
    ...(s.missions?.[p] ? { role: missionLabel(s.missions[p], map) } : {}),
  }));
}

function getResult(s: RiskState): GameResult | null {
  if (s.phase !== 'over' || !s.winner) return null;
  const mission = s.missions?.[s.winner];
  return {
    winners: [s.winner],
    summary: mission
      ? `Mission complete: ${lower(missionLabel(mission, mapOf(s)))}`
      : `The last army standing after ${s.round} rounds`,
    reveal: revealOf(s, s.winner),
    recap: s.log,
    standings: standingsOf(s, [s.winner]),
    highlights: highlightsOf(s),
  };
}

/**
 * The host ended the game early: whoever holds the most territories leads (then most armies; a
 * tie after that is shared). Nothing to save before the first battle.
 */
function partialResult(s: RiskState): GameResult | null {
  if (s.phase === 'over') return getResult(s);
  if (s.phase === 'draft' || s.battleSeq === 0) return null;
  const alive = s.seats.filter((p) => !s.eliminated.includes(p));
  const score = (p: string) => {
    const lands = territoriesOf(s.owner, p);
    return { lands: lands.length, armies: lands.reduce((n, t) => n + (s.armies[t] ?? 0), 0) };
  };
  const top = alive.reduce((best, p) => {
    const a = score(p);
    const b = score(best);
    return a.lands > b.lands || (a.lands === b.lands && a.armies > b.armies) ? p : best;
  });
  const lead = score(top);
  const winners = alive.filter((p) => {
    const x = score(p);
    return x.lands === lead.lands && x.armies === lead.armies;
  });
  return {
    winners,
    // The results screen names the winners before this.
    summary:
      winners.length > 1
        ? `Level on ${lead.lands} territories and ${lead.armies} armies each after ${s.round} rounds`
        : `Held the most territories (${lead.lands}) after ${s.round} rounds`,
    reveal: revealOf(s, winners.length === 1 ? winners[0]! : null),
    recap: s.log,
    standings: standingsOf(s, winners),
    highlights: highlightsOf(s),
  };
}

/** Chat lines: knock-outs, a continent changing hands to the mover, and the win. */
function announce(prev: RiskState | null, next: RiskState): string[] {
  if (!prev) return [];
  const map = mapOf(next);
  const lines: string[] = [];
  for (const p of next.eliminated.slice(prev.eliminated.length))
    lines.push(`{${p}} is knocked out by {${next.eliminatedBy[p]}}`);
  // In the fog, who holds which continent stays hidden.
  const before = continentsHeld(map, prev.owner, prev.turn);
  if (!fogged(next))
    for (const c of continentsHeld(map, next.owner, prev.turn))
      if (!before.includes(c))
        lines.push(`{${prev.turn}} holds ${map.continents.find((x) => x.id === c)!.name}`);
  if (next.winner && !prev.winner) {
    const m = next.missions?.[next.winner];
    lines.push(
      m
        ? `{${next.winner}} wins: ${lower(missionText(m, map, (p) => `{${p}}`))}`
        : `{${next.winner}} conquers the world`,
    );
  }
  return lines;
}

export const risk: GameModule<RiskState, RiskAction, RiskView, RiskTableView, RiskOptions> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({
    map: 'World',
    goal: 'Secret missions',
    setup: 'Quick',
    cardSets: 'Rising',
    turnTimer: 'Off',
    fog: false,
  }),
  setup,
  getPlayerView,
  getTableView,
  applyAction: (s, pid, a, rng, now) => stamp(s, settle(applyAction(s, pid, a, rng), pid, s), now),
  getResult,
  partialResult,
  bot: riskBot,
  botDelayMs: 1300,
  announce,
  waitingOn,
  nextTimer: (s) =>
    s.turnSecs && s.actBy !== null && s.phase !== 'over' ? { id: 'turn', at: s.actBy } : null,
  onTimer: (s, id, rng, now) =>
    id !== 'turn' || s.phase === 'over' ? s : stamp(s, settle(timeUp(s, rng), s.turn, s), now),
};
