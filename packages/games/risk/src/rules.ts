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
  reinforcementCount,
  territoriesOf,
  type Armies,
  type Owner,
} from './board';
import { isSet, makeDeck, setValue, type Card, type CardSets } from './cards';
import { getMap, type MapDef, type MapId } from './maps';
import { meta } from './meta';
import { dealMissions, fallback, type Mission } from './missions';

/**
 * Risk for 2–6 players on the classic world or Jackdaw's own realm. Territories are dealt at
 * random; each turn you reinforce (territories / 3, at least 3, plus continents and card sets),
 * attack as often as you like (Roll one exchange or Blitz until it's settled), then fortify once.
 * Taking a territory earns a card at the end of your turn. With secret missions the first to
 * complete theirs wins; in world domination, the last player standing. Two players share the
 * board with a passive neutral army.
 */

const MAPS_BY_NAME = { World: 'world', Realm: 'realm' } as const satisfies Record<string, MapId>;
const GOALS = ['Secret missions', 'World domination'] as const;
const SETUPS = ['Quick', 'Draft'] as const;
const CARD_SETS = ['Rising', 'Fixed'] as const;
const CLOCKS = ['Off', '1 minute', '2 minutes', '3 minutes'] as const;

export const optionsSchema = z.object({
  map: z.enum(['World', 'Realm']).describe('Map'),
  goal: z.enum(GOALS).describe('Goal'),
  setup: z.enum(SETUPS).describe('Setup'),
  cardSets: z.enum(CARD_SETS).describe('Card sets'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
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
  attackDice: number[];
  defendDice: number[];
  attackerLost: number;
  defenderLost: number;
  conquered: boolean;
  /** Settled: taken, or the attacker can't go on from there. */
  ended: boolean;
}

export interface RiskState {
  map: MapId;
  goal: 'missions' | 'domination';
  cardSets: CardSets;
  turnSecs: number;
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
  /** The attack run under way (same from → to), for the bloodiest battle. */
  run: { from: string; to: string; lost: number } | null;
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
}

const LOG_KEEP = 60;
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
    best: { battle: null, conquest: null },
    log: [{ round: 1, actor: first, text: '{actor} goes first' }],
    actBy: null,
    winner: null,
  };
  return stamp(null, s, now);
}

function getTableView(s: RiskState): RiskTableView {
  return {
    map: s.map,
    goal: s.goal,
    cardSets: s.cardSets,
    seats: s.seats,
    neutral: s.neutral,
    owner: s.owner,
    armies: s.armies,
    phase: s.phase,
    turn: s.turn,
    round: s.round,
    toPlace: s.toPlace,
    occupy: s.occupy,
    handCounts: Object.fromEntries(s.seats.map((p) => [p, s.hands[p]?.length ?? 0])),
    nextSetValue: s.cardSets === 'rising' ? setValue('rising', s.setsTraded, []) : null,
    setsTraded: s.setsTraded,
    draftDone: s.drafts ? s.seats.filter((p) => s.drafts![p]?.placed) : [],
    eliminated: s.eliminated,
    battle: s.battle,
    actBy: s.actBy,
    log: s.log.slice(-LOG_SHOWN),
    missions: s.phase === 'over' ? s.missions : null,
    winner: s.winner,
  };
}

function getPlayerView(s: RiskState, pid: string): RiskView {
  const d = s.drafts?.[pid];
  return {
    hand: s.hands[pid] ?? [],
    mission: s.missions?.[pid] ?? null,
    draft: d?.placed ?? null,
    draftLeft: d && !d.placed ? d.left : 0,
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
  // Two extra armies go straight onto one traded territory you hold.
  const bonusOn = set.find((c) => c.territory && s.owner[c.territory] === pid)?.territory;
  const armies = bonusOn ? { ...s.armies, [bonusOn]: s.armies[bonusOn]! + 2 } : s.armies;
  return logged(
    {
      ...s,
      armies,
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
  for (;;) {
    atk -= last.attackerLost;
    def -= last.defenderLost;
    attackerLost += last.attackerLost;
    defenderLost += last.defenderLost;
    if (a.mode === 'roll' || def === 0 || atk < 2) break;
    last = exchange(rng, atk, def);
  }
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
    attackerLost,
    defenderLost,
    conquered,
    ended: conquered || atk < 2,
  };
  // The bloodiest battle: a run of attacks on the same border, both sides' losses together.
  const same = s.run && s.run.from === a.from && s.run.to === a.to;
  const run = {
    from: a.from,
    to: a.to,
    lost: (same ? s.run!.lost : 0) + attackerLost + defenderLost,
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
    default:
      return refuse('wrong-phase', 'You can’t do that now.');
  }
}

function getResult(s: RiskState): GameResult | null {
  void s;
  return null;
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
  }),
  setup,
  getPlayerView,
  getTableView,
  applyAction: (s, pid, a, rng, now) => stamp(s, applyAction(s, pid, a, rng), now),
  getResult,
};
