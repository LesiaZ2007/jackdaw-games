import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type RecapStats,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { DEV_DECK, RESOURCE_COUNT, makeBoard, type BoardStyle } from './board';
import {
  COSTS,
  bankRatio,
  citySpots,
  harboursOf,
  missing,
  piecesLeft,
  roadSpots,
  settlementSpots,
  type Buildings,
  type Piece,
  type Roads,
} from './build';
import { awardRoad, longestRoad } from './roads';
import { trim, validTrade } from './trade';
import { timeUp } from './bot';
import { catanBot } from './robot';
import { layout, type Layout } from './geometry';
import { meta } from './meta';
import {
  RESOURCES,
  YIELD,
  countCards,
  emptyCards,
  type Board,
  type Cards,
  type DevCard,
  type Resource,
  type Size,
} from './types';

/**
 * Catan for 3–6 players (5th edition, the 5–6 extension and catan.com's paired turns). Setup in
 * snake order; each turn you roll (everyone with buildings on that number takes cards; a 7 means
 * discards and the robber), then trade and build in any order and play one development card.
 * First to the target on their own turn wins.
 */

const CLOCKS = ['Off', '1 minute', '2 minutes', '3 minutes'] as const;

export const optionsSchema = z.object({
  board: z.enum(['Balanced', 'Random', 'Beginner']).describe('Board'),
  points: z.enum(['10', '8', '12']).describe('Points to win'),
  robber: z.enum(['Standard', 'Friendly']).describe('Robber'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
});
export type CatanOptions = z.infer<typeof optionsSchema>;

const resource = z.enum(['lumber', 'brick', 'wool', 'grain', 'ore']);
const cards = z.partialRecord(resource, z.number().int().min(0).max(120));
const id = z.string().min(1).max(12);
const pid = z.string().min(1).max(64);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('build'), kind: z.enum(['road', 'settlement', 'city']), at: id }),
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('discard'), cards }),
  z.object({
    type: z.literal('robber'),
    tile: z.number().int().min(0).max(40),
    victim: pid.nullable(),
  }),
  z.object({ type: z.literal('buy') }),
  z.object({
    type: z.literal('play'),
    card: z.enum(['knight', 'roadBuilding', 'yearOfPlenty', 'monopoly']),
    take: z.tuple([resource, resource]).optional(),
    resource: resource.optional(),
  }),
  z.object({ type: z.literal('endRoads') }),
  z.object({ type: z.literal('offer'), give: cards, want: cards, to: pid.nullable() }),
  z.object({
    type: z.literal('answer'),
    offer: z.number().int(),
    reply: z.enum(['accept', 'decline']),
  }),
  z.object({ type: z.literal('counter'), offer: z.number().int(), give: cards, want: cards }),
  z.object({ type: z.literal('propose'), give: cards, want: cards }),
  z.object({ type: z.literal('accept'), offer: z.number().int(), with: pid }),
  z.object({ type: z.literal('withdraw'), offer: z.number().int() }),
  z.object({
    type: z.literal('bank'),
    give: resource,
    get: resource,
    n: z.number().int().min(1).max(20),
  }),
  z.object({ type: z.literal('endTurn') }),
]);
export type CatanAction = z.infer<typeof actionSchema>;

export type Phase = 'setup' | 'roll' | 'discard' | 'robber' | 'main' | 'roadBuilding' | 'over';

/** A trade on the table. `give` is what its maker gives, `want` what they want back. */
export interface Offer {
  id: number;
  from: string;
  /** One player, or null for everyone (only the player on their turn offers to everyone). */
  to: string | null;
  give: Partial<Cards>;
  want: Partial<Cards>;
  replies: Record<string, 'accept' | 'decline'>;
  /** The offer this one answers, for a counter-offer. */
  counter: number | null;
  /** When it was made (server time), so a bot knows how long it has waited for answers. */
  at?: number;
}

/** The last robbery. `resource` is secret: only the thief and the victim see it. */
export interface Robbery {
  seq: number;
  thief: string;
  victim: string | null;
  resource: Resource | null;
}

/** Longest Road or Largest Army changing hands (either side may be nobody). */
export interface AwardChange {
  seq: number;
  kind: 'road' | 'army';
  from: string | null;
  to: string | null;
}

export interface CatanState {
  size: Size;
  board: Board;
  /** Players in seat order; seat order sets each player's colour. */
  seats: string[];
  target: number;
  friendly: boolean;
  turnSecs: number;
  phase: Phase;
  /** Whose turn it is (player 1 at five and six). */
  turn: string;
  /** Who took the first turn; a new round starts with them. */
  first: string;
  /** The paired player, during their phase (five and six players). */
  paired: string | null;
  /** Counts turns and paired phases; a development card bought in one can't be played in it. */
  turnSeq: number;
  round: number;
  setup: { order: string[]; step: number; corner: string | null } | null;
  dice: [number, number] | null;
  rollSeq: number;
  /** What each player took from the last roll. */
  produced: Record<string, Partial<Cards>>;
  hands: Record<string, Cards>;
  bank: Cards;
  dev: Record<string, { card: DevCard; bought: number }[]>;
  deck: DevCard[];
  devPlayed: boolean;
  knights: Record<string, number>;
  buildings: Buildings;
  roads: Roads;
  robber: number;
  /** Cards each player still has to discard after a 7. */
  discards: Record<string, number>;
  /** Who moves the robber in the `robber` phase. */
  robberBy: string | null;
  /** Where play goes once the robber has moved (a knight before the roll goes back to rolling). */
  afterRobber: 'roll' | 'main';
  roadsToBuild: number;
  longest: { holder: string | null; lengths: Record<string, number> };
  army: string | null;
  offers: Offer[];
  offerSeq: number;
  /** Offers the player on their turn has made to the table this turn (absent in older saves). */
  tradeTries?: number;
  /** The last move was a roll: bots wait for its moment on screen before moving (see botPace). */
  justRolled?: boolean;
  /** Numbers robberies, award changes and monopolies, for the screens' moments. */
  eventSeq: number;
  robbery: Robbery | null;
  award: AwardChange | null;
  monopoly: { seq: number; pid: string; resource: Resource; took: number } | null;
  best: { haul: { pid: string; n: number } | null };
  log: RecapEvent[];
  actBy: number | null;
  winner: string | null;
}

export interface CatanTableView {
  size: Size;
  board: Board;
  seats: string[];
  target: number;
  friendly: boolean;
  phase: Phase;
  turn: string;
  paired: string | null;
  /** Who acts now in `main`, `roll` and `roadBuilding`. */
  actor: string;
  turnSeq: number;
  round: number;
  setup: CatanState['setup'];
  dice: [number, number] | null;
  rollSeq: number;
  produced: Record<string, Partial<Cards>>;
  handCounts: Record<string, number>;
  devCounts: Record<string, number>;
  knights: Record<string, number>;
  buildings: Buildings;
  roads: Roads;
  robber: number;
  bank: Cards;
  deckLeft: number;
  discards: Record<string, number>;
  robberBy: string | null;
  roadsToBuild: number;
  longest: CatanState['longest'];
  army: string | null;
  /** Points everyone can see (without hidden victory point cards). */
  points: Record<string, number>;
  offers: Offer[];
  /** Offers the player on their turn has made to the table this turn. */
  tradeTries: number;
  /** Who robbed whom, and whether a card changed hands (never which). */
  robbery: (Omit<Robbery, 'resource'> & { took: boolean }) | null;
  award: AwardChange | null;
  monopoly: CatanState['monopoly'];
  log: RecapEvent[];
  actBy: number | null;
  winner: string | null;
  /** Everyone's victory point cards, once the game is over. */
  vpCards: Record<string, number> | null;
}

export interface CatanView {
  hand: Cards;
  /** Your development cards, and whether each can be played right now. */
  dev: { card: DevCard; playable: boolean }[];
  /** Points including your hidden victory point cards. */
  points: number;
  /** The card you took or lost in the last robbery, if you were in it. */
  stolen: { seq: number; resource: Resource; role: 'thief' | 'victim' } | null;
}

const LOG_KEEP = 1500;
const LOG_SHOWN = 14;

export const refuse = (code: string, message: string): never => {
  throw new GameError(code, message);
};

export const layoutOf = (s: { size: Size }): Layout => layout(s.size);

/** Who acts now: the paired player in their phase, else the player whose turn it is. */
export const actor = (s: CatanState): string =>
  s.phase === 'setup' ? s.setup!.order[s.setup!.step]! : (s.paired ?? s.turn);

/** Victory points; `withHidden` adds victory point cards (only the owner and the end see those). */
export function points(s: CatanState, pid: string, withHidden: boolean): number {
  let n = 0;
  for (const b of Object.values(s.buildings)) if (b.owner === pid) n += b.city ? 2 : 1;
  if (s.longest.holder === pid) n += 2;
  if (s.army === pid) n += 2;
  if (withHidden) n += (s.dev[pid] ?? []).filter((d) => d.card === 'victoryPoint').length;
  return n;
}

type Chip = Pick<RecapEvent, 'tag' | 'tone' | 'key' | 'secret'>;

/** Adds an event to the log. `chip` carries the recap's chip, tone, turning point and secret. */
function logged(s: CatanState, text: string, who?: string, chip: Chip = {}): CatanState {
  const ev: RecapEvent = { round: s.round, text, ...(who ? { actor: who } : {}), ...chip };
  return { ...s, log: [...s.log, ev].slice(-LOG_KEEP) };
}

const add = (a: Cards, b: Partial<Cards>, sign = 1): Cards => {
  const out = { ...a };
  for (const r of RESOURCES) out[r] += sign * (b[r] ?? 0);
  return out;
};

const covers = (hand: Cards, c: Partial<Cards>) => RESOURCES.every((r) => hand[r] >= (c[r] ?? 0));

/** "2 wool and 1 ore". */
export function cardsText(c: Partial<Cards>): string {
  const parts = RESOURCES.filter((r) => c[r]).map((r) => `${c[r]} ${r}`);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    : (parts[0] ?? 'nothing');
}

function setup({ playerIds, options, rng }: Parameters<CatanModule['setup']>[0]): CatanState {
  const size: Size = playerIds.length >= 5 ? 'big' : 'classic';
  const board = makeBoard(size, options.board as BoardStyle, rng);
  const first = rng.int(playerIds.length);
  const ordered = [...playerIds.slice(first), ...playerIds.slice(0, first)];
  const deck = rng.shuffle(
    Object.entries(DEV_DECK[size]).flatMap(([c, n]) => Array<DevCard>(n).fill(c as DevCard)),
  );
  const n = RESOURCE_COUNT[size];
  const s: CatanState = {
    size,
    board,
    seats: playerIds,
    target: Number(options.points),
    friendly: options.robber === 'Friendly',
    turnSecs: options.turnTimer === 'Off' ? 0 : Number.parseInt(options.turnTimer, 10) * 60,
    phase: 'setup',
    turn: ordered[0]!,
    first: ordered[0]!,
    paired: null,
    turnSeq: 0,
    round: 0,
    setup: { order: [...ordered, ...[...ordered].reverse()], step: 0, corner: null },
    dice: null,
    rollSeq: 0,
    produced: {},
    hands: Object.fromEntries(playerIds.map((p) => [p, emptyCards()])),
    bank: { lumber: n, brick: n, wool: n, grain: n, ore: n },
    dev: Object.fromEntries(playerIds.map((p) => [p, []])),
    deck,
    devPlayed: false,
    knights: Object.fromEntries(playerIds.map((p) => [p, 0])),
    buildings: {},
    roads: {},
    robber: board.tiles.findIndex((t) => t.terrain === 'desert'),
    discards: {},
    robberBy: null,
    afterRobber: 'main',
    roadsToBuild: 0,
    longest: { holder: null, lengths: Object.fromEntries(playerIds.map((p) => [p, 0])) },
    army: null,
    offers: [],
    offerSeq: 0,
    eventSeq: 0,
    robbery: null,
    award: null,
    monopoly: null,
    best: { haul: null },
    log: [],
    actBy: null,
    winner: null,
  };
  return logged(s, '{actor} places first', ordered[0]);
}

/** Opening placements: a settlement, then a road beside it; the second settlement pays out. */
function setupBuild(s: CatanState, who: string, kind: string, at: string): CatanState {
  const L = layoutOf(s);
  const st = s.setup!;
  if (!st.corner) {
    if (kind !== 'settlement') return refuse('wrong-piece', 'Place a settlement first.');
    if (!settlementSpots(L, s.buildings, s.roads, who, true).includes(at))
      return refuse('bad-spot', 'You can’t build a settlement there.');
    let next: CatanState = {
      ...s,
      buildings: { ...s.buildings, [at]: { owner: who, city: false } },
      setup: { ...st, corner: at },
    };
    if (st.step >= st.order.length / 2) {
      const take = emptyCards();
      for (const t of L.corners[at]!.tiles) {
        const r = YIELD[s.board.tiles[t]!.terrain];
        if (r && next.bank[r] > take[r]) take[r]++;
      }
      next = {
        ...next,
        hands: { ...next.hands, [who]: add(next.hands[who]!, take) },
        bank: add(next.bank, take, -1),
      };
    }
    return next;
  }
  if (kind !== 'road') return refuse('wrong-piece', 'Now place a road beside your settlement.');
  if (!roadSpots(L, s.buildings, s.roads, who, st.corner).includes(at))
    return refuse('bad-spot', 'The road must touch the settlement you just placed.');
  const roads = { ...s.roads, [at]: who };
  const step = st.step + 1;
  if (step < st.order.length) return { ...s, roads, setup: { ...st, step, corner: null } };
  return logged(
    { ...s, roads, setup: null, phase: 'roll', turn: st.order[0]!, turnSeq: 1, round: 1 },
    'Round 1',
  );
}

function roll(s: CatanState, who: string, rng: Rng): CatanState {
  const dice: [number, number] = [rng.int(6) + 1, rng.int(6) + 1];
  const total = dice[0] + dice[1];
  let next: CatanState = { ...s, dice, rollSeq: s.rollSeq + 1, produced: {} };
  next = logged(next, `{actor} rolled ${total}`, who);
  if (total === 7) {
    const discards: Record<string, number> = {};
    for (const p of s.seats) {
      const n = countCards(s.hands[p]!);
      if (n > 7) discards[p] = Math.floor(n / 2);
    }
    return {
      ...next,
      discards,
      phase: Object.keys(discards).length ? 'discard' : 'robber',
      robberBy: who,
      afterRobber: 'main',
    };
  }
  return { ...produce(next, total), phase: 'main' };
}

/** Pays out a roll. A resource the bank can't cover goes to nobody, unless only one is owed it. */
function produce(s: CatanState, total: number): CatanState {
  const L = layoutOf(s);
  const owed: Partial<Record<Resource, Record<string, number>>> = {};
  s.board.tiles.forEach((t, i) => {
    const r = YIELD[t.terrain];
    if (t.number !== total || i === s.robber || !r) return;
    for (const c of L.tiles[i]!.corners) {
      const b = s.buildings[c];
      if (!b) continue;
      const m = (owed[r] ??= {});
      m[b.owner] = (m[b.owner] ?? 0) + (b.city ? 2 : 1);
    }
  });
  const hands = { ...s.hands };
  const bank = { ...s.bank };
  const produced: Record<string, Partial<Cards>> = {};
  for (const r of RESOURCES) {
    const m = owed[r];
    if (!m) continue;
    const owners = Object.keys(m);
    const sum = owners.reduce((n, p) => n + m[p]!, 0);
    if (sum > bank[r] && owners.length > 1) continue;
    for (const p of owners) {
      const n = Math.min(m[p]!, bank[r]);
      if (!n) continue;
      bank[r] -= n;
      hands[p] = { ...hands[p]!, [r]: hands[p]![r] + n };
      produced[p] = { ...produced[p], [r]: n };
    }
  }
  let best = s.best;
  for (const [p, c] of Object.entries(produced)) {
    const n = countCards(c);
    if (!best.haul || n > best.haul.n) best = { ...best, haul: { pid: p, n } };
  }
  return { ...s, hands, bank, produced, best };
}

function discard(s: CatanState, who: string, c: Partial<Cards>): CatanState {
  const owe = s.discards[who];
  if (!owe) return refuse('no-discard', 'You don’t need to discard.');
  if (countCards(c) !== owe) return refuse('wrong-count', `Discard exactly ${owe} cards.`);
  if (!covers(s.hands[who]!, c)) return refuse('not-yours', 'You don’t have those cards.');
  const discards = { ...s.discards };
  delete discards[who];
  const next = logged(
    {
      ...s,
      hands: { ...s.hands, [who]: add(s.hands[who]!, c, -1) },
      bank: add(s.bank, c),
      discards,
    },
    `{actor} discarded ${owe}`,
    who,
    { tag: `-${owe}`, tone: 'bad' },
  );
  return Object.keys(discards).length ? next : { ...next, phase: 'robber' };
}

/** Tiles the robber may move to (a friendly robber spares players on 2 points or fewer). */
export function robberTiles(s: CatanState, who: string): number[] {
  return robberSpots(s, who, (p) => points(s, p, false));
}

/** The same from public facts only (the screens): `pointsOf` gives visible points. */
export function robberSpots(
  s: Pick<CatanState, 'size' | 'board' | 'robber' | 'friendly' | 'buildings'>,
  who: string,
  pointsOf: (pid: string) => number,
): number[] {
  const L = layoutOf(s);
  const all = s.board.tiles.map((_, i) => i).filter((i) => i !== s.robber);
  if (!s.friendly) return all;
  const spared = (i: number) =>
    L.tiles[i]!.corners.some((c) => {
      const b = s.buildings[c];
      return b && b.owner !== who && pointsOf(b.owner) <= 2;
    });
  const ok = all.filter((i) => !spared(i));
  return ok.length ? ok : s.board.tiles.flatMap((t, i) => (t.terrain === 'desert' ? [i] : []));
}

/** Players with a building on a tile, other than `who`. */
export function victimsAt(
  s: Pick<CatanState, 'size' | 'buildings'>,
  tile: number,
  who: string,
): string[] {
  const L = layoutOf(s);
  const out = new Set<string>();
  for (const c of L.tiles[tile]!.corners) {
    const b = s.buildings[c];
    if (b && b.owner !== who) out.add(b.owner);
  }
  return [...out];
}

function moveRobber(
  s: CatanState,
  who: string,
  tile: number,
  victim: string | null,
  rng: Rng,
): CatanState {
  if (tile >= s.board.tiles.length || !robberTiles(s, who).includes(tile))
    return refuse(
      'bad-tile',
      tile === s.robber ? 'Move the robber to a different tile.' : 'The robber can’t go there.',
    );
  const victims = victimsAt(s, tile, who);
  if (victim !== null && !victims.includes(victim))
    return refuse('bad-victim', 'You can only rob a player with a building on that tile.');
  if (victim === null && victims.some((p) => countCards(s.hands[p]!) > 0))
    return refuse('pick-victim', 'Choose who to rob.');
  let hands = s.hands;
  let resource: Resource | null = null;
  if (victim && countCards(s.hands[victim]!) > 0) {
    const pool = RESOURCES.flatMap((r) => Array<Resource>(s.hands[victim]![r]).fill(r));
    resource = rng.pick(pool);
    hands = {
      ...hands,
      [victim]: { ...hands[victim]!, [resource]: hands[victim]![resource] - 1 },
      [who]: { ...hands[who]!, [resource]: hands[who]![resource] + 1 },
    };
  }
  const seq = s.eventSeq + 1;
  const next: CatanState = {
    ...s,
    hands,
    robber: tile,
    phase: s.afterRobber,
    robberBy: null,
    eventSeq: seq,
    robbery: { seq, thief: who, victim, resource },
  };
  return logged(
    next,
    victim ? `{actor} moved the robber and robbed {${victim}}` : '{actor} moved the robber',
    who,
    victim
      ? {
          tag: 'Robbed',
          tone: 'good',
          ...(resource ? { secret: `Took ${resource} from {${victim}}` } : {}),
        }
      : {},
  );
}

function applyAction(s: CatanState, who: string, a: CatanAction, rng: Rng): CatanState {
  if (s.phase === 'over') return refuse('over', 'The game is over.');
  if (!s.seats.includes(who)) return refuse('not-playing', 'You’re not in this game.');
  if (s.phase === 'setup') {
    if (who !== actor(s)) return refuse('not-your-turn', 'It’s not your turn to place.');
    if (a.type !== 'build') return refuse('wrong-phase', 'Place your opening pieces first.');
    return setupBuild(s, who, a.kind, a.at);
  }
  if (a.type === 'discard') {
    if (s.phase !== 'discard') return refuse('wrong-phase', 'Nobody is discarding now.');
    return discard(s, who, a.cards);
  }
  if (s.phase === 'discard') return refuse('wrong-phase', 'Waiting for discards.');
  if (s.phase === 'robber') {
    if (a.type !== 'robber') return refuse('wrong-phase', 'Move the robber first.');
    if (who !== s.robberBy) return refuse('not-your-turn', 'It’s not your robber to move.');
    return moveRobber(s, who, a.tile, a.victim, rng);
  }
  if (a.type === 'robber') return refuse('wrong-phase', 'The robber isn’t moving now.');
  if (a.type === 'answer' || a.type === 'counter' || a.type === 'propose' || a.type === 'withdraw')
    return respond(s, who, a);
  if (who !== actor(s)) return refuse('not-your-turn', 'It’s not your turn.');
  if (s.phase === 'roll') {
    if (a.type === 'roll') return roll(s, who, rng);
    if (a.type === 'play' && a.card === 'knight') return play(s, who, a);
    return refuse('wrong-phase', 'Roll the dice first.');
  }
  if (s.phase === 'roadBuilding') {
    if (a.type === 'build' && a.kind === 'road') return build(s, who, 'road', a.at);
    if (a.type === 'endRoads') return { ...s, phase: 'main', roadsToBuild: 0 };
    return refuse('wrong-phase', 'Place your free roads first.');
  }
  switch (a.type) {
    case 'roll':
      return s.paired
        ? refuse('wrong-phase', 'You don’t roll in a paired turn.')
        : refuse('wrong-phase', 'You’ve already rolled.');
    case 'build':
      return build(s, who, a.kind, a.at);
    case 'buy':
      return buy(s, who);
    case 'play':
      return play(s, who, a);
    case 'endTurn':
      return endTurn(s);
    case 'offer':
      return makeOffer(s, who, a.give, a.want, a.to, null);
    case 'accept':
      return accept(s, who, a.offer, a.with);
    case 'bank':
      return bank(s, who, a.give, a.get, a.n);
    case 'endRoads':
      return refuse('wrong-phase', 'You’re not building free roads.');
    default:
      return refuse('wrong-phase', 'You can’t do that now.');
  }
}

const MAX_OFFERS = 6;

/** Player trades happen in the main phase of a normal turn, never in a paired phase. */
function tradingOpen(s: CatanState) {
  if (s.phase !== 'main') return refuse('wrong-phase', 'You can’t trade right now.');
  if (s.paired) return refuse('paired', 'There’s no trading with players in a paired turn.');
}

function makeOffer(
  s: CatanState,
  who: string,
  give: Partial<Cards>,
  want: Partial<Cards>,
  to: string | null,
  counter: number | null,
): CatanState {
  tradingOpen(s);
  const bad = validTrade(give, want);
  if (bad) return refuse('bad-trade', bad);
  if (who === s.turn) {
    if (to !== null && (to === who || !s.seats.includes(to)))
      return refuse('bad-partner', 'Offer to everyone or to another player.');
  } else if (to !== s.turn) {
    return refuse('not-your-turn', 'You can only trade with the player whose turn it is.');
  }
  if (!covers(s.hands[who]!, give)) return refuse('not-yours', 'You don’t have those cards.');
  if (s.offers.filter((o) => o.from === who).length >= MAX_OFFERS)
    return refuse('too-many', 'Take back an offer before making another.');
  const id = s.offerSeq + 1;
  const offer: Offer = {
    id,
    from: who,
    to,
    give: trim(give),
    want: trim(want),
    replies: {},
    counter,
  };
  const tries = who === s.turn && counter === null ? (s.tradeTries ?? 0) + 1 : s.tradeTries;
  return {
    ...s,
    offerSeq: id,
    offers: [...s.offers, offer],
    ...(tries !== undefined ? { tradeTries: tries } : {}),
  };
}

type Response = Extract<CatanAction, { type: 'answer' | 'counter' | 'propose' | 'withdraw' }>;

/** What the other players do with trades: answer, counter, propose, or take an offer back. */
function respond(s: CatanState, who: string, a: Response): CatanState {
  if (a.type === 'propose') {
    if (who === s.turn) return refuse('own-turn', 'Make an offer instead.');
    return makeOffer(s, who, a.give, a.want, s.turn, null);
  }
  const offer = s.offers.find((o) => o.id === a.offer);
  if (!offer) return refuse('no-offer', 'That offer isn’t open any more.');
  if (a.type === 'withdraw') {
    if (offer.from !== who) return refuse('not-yours', 'Only its maker can take an offer back.');
    return { ...s, offers: s.offers.filter((o) => o.id !== offer.id) };
  }
  if (offer.from !== s.turn || who === offer.from || (offer.to !== null && offer.to !== who))
    return refuse('not-for-you', 'That offer isn’t to you.');
  if (a.type === 'counter') return makeOffer(s, who, a.give, a.want, s.turn, offer.id);
  tradingOpen(s);
  if (a.reply === 'accept' && !covers(s.hands[who]!, offer.want))
    return refuse('not-yours', 'You don’t have the cards they want.');
  return {
    ...s,
    offers: s.offers.map((o) =>
      o.id === offer.id ? { ...o, replies: { ...o.replies, [who]: a.reply } } : o,
    ),
  };
}

/** The player on their turn completes a trade: their own offer with someone who said yes, or a
 * counter or proposal made to them. Both hands are checked again now. */
function accept(s: CatanState, who: string, id: number, partner: string): CatanState {
  tradingOpen(s);
  const offer = s.offers.find((o) => o.id === id);
  if (!offer) return refuse('no-offer', 'That offer isn’t open any more.');
  if (offer.from === who) {
    if (offer.replies[partner] !== 'accept') return refuse('no-yes', 'Pick someone who said yes.');
  } else if (offer.to !== who || partner !== offer.from) {
    return refuse('not-for-you', 'That offer isn’t to you.');
  }
  const maker = offer.from;
  const taker = maker === who ? partner : who;
  if (!covers(s.hands[maker]!, offer.give))
    return refuse(
      'short',
      maker === who
        ? 'You don’t have those cards any more.'
        : 'They don’t have those cards any more.',
    );
  if (!covers(s.hands[taker]!, offer.want))
    return refuse(
      'short',
      taker === who
        ? 'You don’t have those cards any more.'
        : 'They don’t have those cards any more.',
    );
  const hands = {
    ...s.hands,
    [maker]: add(add(s.hands[maker]!, offer.give, -1), offer.want),
    [taker]: add(add(s.hands[taker]!, offer.want, -1), offer.give),
  };
  return logged(
    { ...s, hands, offers: s.offers.filter((o) => o.id !== offer.id) },
    `{actor} traded ${cardsText(offer.give)} for ${cardsText(offer.want)} with {${taker}}`,
    maker,
    { tag: 'Trade' },
  );
}

function bank(s: CatanState, who: string, give: Resource, get: Resource, n: number): CatanState {
  if (s.phase !== 'main') return refuse('wrong-phase', 'You can’t trade right now.');
  if (give === get) return refuse('bad-trade', 'Pick a different resource to get.');
  const ratio = bankRatio(harboursOf(layoutOf(s), s.board, s.buildings, who), give);
  if (s.hands[who]![give] < ratio * n)
    return refuse('cant-afford', `That takes ${ratio * n} ${give}.`);
  if (s.bank[get] < n) return refuse('bank-short', `The bank has only ${s.bank[get]} ${get}.`);
  const out = { [give]: ratio * n } as Partial<Cards>;
  const back = { [get]: n } as Partial<Cards>;
  return logged(
    {
      ...s,
      hands: { ...s.hands, [who]: add(add(s.hands[who]!, out, -1), back) },
      bank: add(add(s.bank, out), back, -1),
    },
    `{actor} traded ${ratio * n} ${give} to the bank for ${n} ${get}`,
    who,
  );
}

/** Recounts every road and moves Longest Road if it should change hands. */
function recountRoads(s: CatanState): CatanState {
  const L = layoutOf(s);
  const lengths = Object.fromEntries(
    s.seats.map((p) => [p, longestRoad(L, s.buildings, s.roads, p)]),
  );
  const holder = awardRoad(s.longest.holder, lengths);
  const next = { ...s, longest: { holder, lengths } };
  if (holder === s.longest.holder) return next;
  const seq = s.eventSeq + 1;
  const moved: CatanState = {
    ...next,
    eventSeq: seq,
    award: { seq, kind: 'road', from: s.longest.holder, to: holder },
  };
  return holder
    ? logged(
        moved,
        s.longest.holder
          ? `{actor} has Longest Road (${lengths[holder]}), taking it from {${s.longest.holder}}`
          : `{actor} has Longest Road (${lengths[holder]})`,
        holder,
        { tag: 'Longest road', tone: 'good', key: true },
      )
    : logged(moved, 'Nobody holds Longest Road now');
}

function build(s: CatanState, who: string, kind: Piece, at: string): CatanState {
  const L = layoutOf(s);
  const free = s.phase === 'roadBuilding';
  const cost = COSTS[kind];
  if (!free && !covers(s.hands[who]!, cost))
    return refuse('cant-afford', `You need ${cardsText(missing(s.hands[who]!, cost))} more.`);
  if (piecesLeft(s.buildings, s.roads, who)[kind] <= 0)
    return refuse('no-pieces', `You have no ${kind === 'city' ? 'cities' : `${kind}s`} left.`);
  const spots =
    kind === 'road'
      ? roadSpots(L, s.buildings, s.roads, who)
      : kind === 'settlement'
        ? settlementSpots(L, s.buildings, s.roads, who, false)
        : citySpots(s.buildings, who);
  if (!spots.includes(at)) return refuse('bad-spot', `You can’t build a ${kind} there.`);
  let next: CatanState = free
    ? s
    : { ...s, hands: { ...s.hands, [who]: add(s.hands[who]!, cost, -1) }, bank: add(s.bank, cost) };
  if (kind === 'road') next = { ...next, roads: { ...next.roads, [at]: who } };
  else
    next = {
      ...next,
      buildings: { ...next.buildings, [at]: { owner: who, city: kind === 'city' } },
    };
  next = logged(
    next,
    `{actor} built a ${kind}`,
    who,
    kind === 'road' ? {} : { tag: kind === 'city' ? 'City' : 'Settlement', tone: 'good' },
  );
  if (kind !== 'city') next = recountRoads(next);
  if (free) {
    const left = next.roadsToBuild - 1;
    const more =
      left > 0 &&
      piecesLeft(next.buildings, next.roads, who).road > 0 &&
      roadSpots(L, next.buildings, next.roads, who).length > 0;
    next = { ...next, roadsToBuild: more ? left : 0, phase: more ? 'roadBuilding' : 'main' };
  }
  return next;
}

function buy(s: CatanState, who: string): CatanState {
  if (!s.deck.length) return refuse('deck-empty', 'There are no development cards left.');
  if (!covers(s.hands[who]!, COSTS.dev))
    return refuse('cant-afford', `You need ${cardsText(missing(s.hands[who]!, COSTS.dev))} more.`);
  const [card, ...deck] = s.deck;
  return logged(
    {
      ...s,
      deck,
      hands: { ...s.hands, [who]: add(s.hands[who]!, COSTS.dev, -1) },
      bank: add(s.bank, COSTS.dev),
      dev: { ...s.dev, [who]: [...s.dev[who]!, { card: card!, bought: s.turnSeq }] },
    },
    '{actor} bought a development card',
    who,
    { tag: 'Dev card', secret: `Drew ${DEV_NAMES[card!]}` },
  );
}

type PlayAction = Extract<CatanAction, { type: 'play' }>;

function play(s: CatanState, who: string, a: PlayAction): CatanState {
  const held = s.dev[who]!;
  const i = held.findIndex((d) => d.card === a.card && canPlay(s, who, d));
  if (i < 0) {
    if (s.devPlayed) return refuse('played', 'You’ve already played a development card this turn.');
    if (held.some((d) => d.card === a.card && d.bought === s.turnSeq))
      return refuse('just-bought', 'You can’t play a card on the turn you bought it.');
    if (s.phase === 'roll' && held.some((d) => d.card === a.card))
      return refuse('roll-first', 'Only a knight can be played before rolling.');
    return refuse('no-card', 'You don’t have that card.');
  }
  if (a.card === 'yearOfPlenty' && !a.take) return refuse('pick', 'Choose two resources.');
  if (a.card === 'monopoly' && !a.resource) return refuse('pick', 'Choose a resource.');
  let next: CatanState = {
    ...s,
    devPlayed: true,
    dev: { ...s.dev, [who]: held.filter((_, k) => k !== i) },
  };
  switch (a.card) {
    case 'knight': {
      const knights = { ...next.knights, [who]: next.knights[who]! + 1 };
      next = logged({ ...next, knights }, '{actor} played a knight', who, { tag: 'Knight' });
      const best = next.army ? knights[next.army]! : 2;
      if (next.army !== who && knights[who]! > best) {
        const seq = next.eventSeq + 1;
        next = logged(
          {
            ...next,
            army: who,
            eventSeq: seq,
            award: { seq, kind: 'army', from: next.army, to: who },
          },
          next.army
            ? `{actor} has Largest Army (${knights[who]}), taking it from {${next.army}}`
            : `{actor} has Largest Army (${knights[who]})`,
          who,
          { tag: 'Largest army', tone: 'good', key: true },
        );
      }
      return {
        ...next,
        phase: 'robber',
        robberBy: who,
        afterRobber: s.phase === 'roll' ? 'roll' : 'main',
      };
    }
    case 'roadBuilding': {
      const L = layoutOf(next);
      const n = Math.min(2, piecesLeft(next.buildings, next.roads, who).road);
      const can = n > 0 && roadSpots(L, next.buildings, next.roads, who).length > 0;
      return logged(
        { ...next, phase: can ? 'roadBuilding' : 'main', roadsToBuild: can ? n : 0 },
        '{actor} played road building',
        who,
        { tag: 'Road building' },
      );
    }
    case 'yearOfPlenty': {
      const take = emptyCards();
      for (const r of a.take!) if (next.bank[r] > take[r]) take[r]++;
      return logged(
        {
          ...next,
          hands: { ...next.hands, [who]: add(next.hands[who]!, take) },
          bank: add(next.bank, take, -1),
        },
        `{actor} played year of plenty for ${cardsText(take)}`,
        who,
        { tag: 'Plenty', tone: 'good' },
      );
    }
    case 'monopoly': {
      const r = a.resource!;
      const hands = { ...next.hands };
      let took = 0;
      for (const p of next.seats) {
        if (p === who) continue;
        took += hands[p]![r];
        hands[p] = { ...hands[p]!, [r]: 0 };
      }
      hands[who] = { ...hands[who]!, [r]: hands[who]![r] + took };
      const seq = next.eventSeq + 1;
      return logged(
        { ...next, hands, eventSeq: seq, monopoly: { seq, pid: who, resource: r, took } },
        `{actor} played monopoly on ${r} and took ${took}`,
        who,
        { tag: `+${took}`, tone: 'good', ...(took >= 4 ? { key: true } : {}) },
      );
    }
  }
}

/** Ends a turn or a paired phase; at five and six the paired player builds before the next roll. */
function endTurn(s: CatanState): CatanState {
  const n = s.seats.length;
  const i = s.seats.indexOf(s.turn);
  const base = {
    ...s,
    offers: [],
    tradeTries: 0,
    devPlayed: false,
    turnSeq: s.turnSeq + 1,
    produced: {},
  };
  if (n >= 5 && !s.paired) {
    const paired = s.seats[(i + 3) % n]!;
    return startOf(
      logged({ ...base, paired, phase: 'main' }, '{actor} builds alongside', paired),
      paired,
    );
  }
  const turn = s.seats[(i + 1) % n]!;
  const round = turn === s.first ? s.round + 1 : s.round;
  return startOf({ ...base, turn, paired: null, phase: 'roll', round, dice: null }, turn);
}

/** A player who already has enough points wins as their turn (or paired phase) begins. */
function startOf(s: CatanState, who: string): CatanState {
  return points(s, who, true) >= s.target ? win(s, who) : s;
}

const DEV_NAMES: Record<DevCard, string> = {
  knight: 'a knight',
  victoryPoint: 'a victory point',
  roadBuilding: 'road building',
  yearOfPlenty: 'year of plenty',
  monopoly: 'monopoly',
};

/** The victory point cards nobody saw, told at the end. */
function hiddenPoints(s: CatanState): string {
  const held = s.seats
    .map((p) => [p, s.dev[p]!.filter((d) => d.card === 'victoryPoint').length] as const)
    .filter(([, n]) => n > 0)
    .map(([p, n]) => `{${p}} held ${n} victory point ${n === 1 ? 'card' : 'cards'}`);
  return held.length ? held.join('; ') : 'Nobody held a victory point card.';
}

function win(s: CatanState, who: string): CatanState {
  return logged(
    { ...s, phase: 'over', winner: who, actBy: null, offers: [] },
    `{actor} wins with ${points(s, who, true)} points`,
    who,
    { tag: `${points(s, who, true)} pts`, tone: 'good', key: true, secret: hiddenPoints(s) },
  );
}

/** After any move: the player acting on their turn (or paired phase) wins at the target. */
function settle(s: CatanState, mover: string): CatanState {
  if (s.phase === 'over' || s.phase === 'setup') return s;
  const active = s.paired ? s.paired : s.turn;
  if (mover !== active) return s;
  return points(s, mover, true) >= s.target ? win(s, mover) : s;
}

function getTableView(s: CatanState): CatanTableView {
  const over = s.phase === 'over';
  return {
    size: s.size,
    board: s.board,
    seats: s.seats,
    target: s.target,
    friendly: s.friendly,
    phase: s.phase,
    turn: s.turn,
    paired: s.paired,
    actor: actor(s),
    turnSeq: s.turnSeq,
    round: s.round,
    setup: s.setup,
    dice: s.dice,
    rollSeq: s.rollSeq,
    produced: s.produced,
    handCounts: Object.fromEntries(s.seats.map((p) => [p, countCards(s.hands[p]!)])),
    devCounts: Object.fromEntries(s.seats.map((p) => [p, s.dev[p]!.length])),
    knights: s.knights,
    buildings: s.buildings,
    roads: s.roads,
    robber: s.robber,
    bank: s.bank,
    deckLeft: s.deck.length,
    discards: s.discards,
    robberBy: s.robberBy,
    roadsToBuild: s.roadsToBuild,
    longest: s.longest,
    army: s.army,
    points: Object.fromEntries(s.seats.map((p) => [p, points(s, p, over)])),
    offers: s.offers,
    tradeTries: s.tradeTries ?? 0,
    robbery: s.robbery && {
      seq: s.robbery.seq,
      thief: s.robbery.thief,
      victim: s.robbery.victim,
      took: s.robbery.resource !== null,
    },
    award: s.award,
    monopoly: s.monopoly,
    log: s.log
      .slice(-LOG_SHOWN)
      .map(({ secret, ...e }) => (over && secret !== undefined ? { ...e, secret } : e)),
    actBy: s.actBy,
    winner: s.winner,
    vpCards: over
      ? Object.fromEntries(
          s.seats.map((p) => [p, s.dev[p]!.filter((d) => d.card === 'victoryPoint').length]),
        )
      : null,
  };
}

/** Whether `pid` may play this development card right now. */
export function canPlay(s: CatanState, pid: string, d: { card: DevCard; bought: number }): boolean {
  if (d.card === 'victoryPoint' || s.devPlayed || d.bought === s.turnSeq) return false;
  if (actor(s) !== pid) return false;
  if (s.phase === 'roll') return d.card === 'knight' && !s.paired;
  return s.phase === 'main';
}

function getPlayerView(s: CatanState, who: string): CatanView {
  const r = s.robbery;
  const role = r?.resource
    ? r.thief === who
      ? 'thief'
      : r.victim === who
        ? 'victim'
        : null
    : null;
  return {
    hand: s.hands[who] ?? emptyCards(),
    dev: (s.dev[who] ?? []).map((d) => ({ card: d.card, playable: canPlay(s, who, d) })),
    points: s.seats.includes(who) ? points(s, who, true) : 0,
    stolen: r && role ? { seq: r.seq, resource: r.resource!, role } : null,
  };
}

export function waitingOn(s: CatanState): string[] {
  switch (s.phase) {
    case 'over':
      return [];
    case 'discard':
      return Object.keys(s.discards);
    case 'robber':
      return [s.robberBy!];
    default:
      return [actor(s)];
  }
}

/** How one player made their points. */
export interface PointsBreakdown {
  settlements: number;
  cities: number;
  road: number;
  army: number;
  vp: number;
  total: number;
}

/** Everything safe to show once the game is over. */
export interface CatanReveal {
  size: Size;
  board: Board;
  seats: string[];
  buildings: Buildings;
  roads: Roads;
  robber: number;
  points: Record<string, PointsBreakdown>;
  longest: CatanState['longest'];
  army: string | null;
  knights: Record<string, number>;
  winner: string | null;
  /** Everyone who shares the win, when the host ended the game on a tie. */
  winners?: string[];
  rounds: number;
}

export function breakdown(s: CatanState, pid: string): PointsBreakdown {
  const mine = Object.values(s.buildings).filter((b) => b.owner === pid);
  const settlements = mine.filter((b) => !b.city).length;
  const cities = mine.filter((b) => b.city).length;
  const road = s.longest.holder === pid ? 2 : 0;
  const army = s.army === pid ? 2 : 0;
  const vp = s.dev[pid]!.filter((d) => d.card === 'victoryPoint').length;
  return {
    settlements,
    cities,
    road,
    army,
    vp,
    total: settlements + cities * 2 + road + army + vp,
  };
}

function getResult(s: CatanState): GameResult | null {
  if (s.phase !== 'over' || !s.winner) return null;
  return resultFor(s, [s.winner]);
}

/**
 * The result if the host ended the game now (2026-10-24): whoever has the most victory
 * points wins (hidden cards included, as the reveal shows everyone's), and a tie shares it. Null
 * in the opening, or while nobody has built past their opening pieces.
 */
export function partialResult(s: CatanState): GameResult | null {
  if (s.phase === 'over') return getResult(s);
  if (s.phase === 'setup') return null;
  const pts = Object.fromEntries(s.seats.map((p) => [p, points(s, p, true)]));
  if (s.seats.every((p) => pts[p] === 2)) return null;
  const top = Math.max(...Object.values(pts));
  return resultFor(
    s,
    s.seats.filter((p) => pts[p] === top),
    true,
  );
}

function resultFor(s: CatanState, winners: string[], early = false): GameResult {
  const pts = Object.fromEntries(s.seats.map((p) => [p, breakdown(s, p)]));
  const reveal: CatanReveal = {
    size: s.size,
    board: s.board,
    seats: s.seats,
    buildings: s.buildings,
    roads: s.roads,
    robber: s.robber,
    points: pts,
    longest: s.longest,
    army: s.army,
    knights: s.knights,
    winner: winners[0]!,
    ...(winners.length > 1 ? { winners } : {}),
    rounds: s.round,
  };
  const highlights: NonNullable<GameResult['highlights']> = [];
  const holder = s.longest.holder;
  if (holder) {
    const n = s.longest.lengths[holder]!;
    highlights.push({
      award: 'Longest road',
      playerIds: [holder],
      text: `${n} roads in a row`,
      value: n,
    });
  }
  if (s.best.haul)
    highlights.push({
      award: 'Biggest haul',
      playerIds: [s.best.haul.pid],
      text: `${s.best.haul.n} cards from one roll`,
      value: s.best.haul.n,
    });
  const top = pts[winners[0]!]!.total;
  const order = [...s.seats].sort(
    (a, b) =>
      Number(winners.includes(b)) - Number(winners.includes(a)) || pts[b]!.total - pts[a]!.total,
  );
  const stats: RecapStats = {
    columns: ['VP', 'Cities', 'Road', 'Knights'],
    rows: order.map((p) => ({
      playerId: p,
      values: [pts[p]!.total, pts[p]!.cities, s.longest.lengths[p] ?? 0, s.knights[p] ?? 0],
    })),
  };
  const rounds = `${s.round} ${s.round === 1 ? 'round' : 'rounds'}`;
  return {
    winners,
    summary: !early
      ? `${top} points in ${rounds}`
      : winners.length > 1
        ? `${winners.length} players tied on ${top} points after ${rounds}`
        : `Led with ${top} points after ${rounds}`,
    reveal,
    recap: s.log,
    roundName: 'Round',
    stats,
    standings: s.seats.map((p) => ({
      playerId: p,
      outcome: winners.includes(p) ? (winners.length > 1 ? 'draw' : 'win') : 'loss',
    })),
    highlights,
  };
}

/** Chat lines: who goes first, awards changing hands, monopolies, and the win. */
function announce(prev: CatanState | null, next: CatanState): string[] {
  if (!prev) return [`{${next.first}} goes first`];
  const lines: string[] = [];
  const a = next.award;
  if (a && a.seq !== prev.award?.seq) {
    if (a.kind === 'army') lines.push(`{${a.to}} takes Largest Army`);
    else lines.push(a.to ? `{${a.to}} takes Longest Road` : 'Longest Road is set aside');
  }
  const m = next.monopoly;
  if (m && m.seq !== prev.monopoly?.seq)
    lines.push(`{${m.pid}} played monopoly and took ${m.took} ${m.resource}`);
  if (next.winner && !prev.winner)
    lines.push(`{${next.winner}} wins with ${points(next, next.winner, true)} points`);
  return lines;
}

/** Which step the clock is timing: a new one gets a fresh deadline. */
const clockKey = (s: CatanState) =>
  `${s.turnSeq}|${s.phase}|${s.setup?.step ?? ''}|${s.setup?.corner ? 1 : 0}`;

function stamp(prev: CatanState | null, s: CatanState, now: number): CatanState {
  if (!s.turnSecs || s.phase === 'over') return s.actBy === null ? s : { ...s, actBy: null };
  if (prev && s.actBy !== null && clockKey(prev) === clockKey(s)) return s;
  return { ...s, actBy: now + s.turnSecs * 1000 };
}

/** Notes whether this move was a roll (by a player or the timer), for the bots' pace. */
function rolled(prev: CatanState, s: CatanState): CatanState {
  if (s.rollSeq !== prev.rollSeq) return { ...s, justRolled: true };
  if (!s.justRolled) return s;
  const { justRolled: _, ...rest } = s;
  return rest;
}

/**
 * How long a bot waits before its move (2026-10-25: Catan should be slower like Risk): 2.6 s
 * as a base (2.1–4.7 s a move), and at least 3 s after a roll, which takes the screen for 2.4 s.
 */
function botPace(s: CatanState): number {
  return s.justRolled ? 3_750 : 2_600;
}

/** New offers get the time they were made. */
function dated(prev: CatanState, s: CatanState, now: number): CatanState {
  if (s.offerSeq === prev.offerSeq) return s;
  return { ...s, offers: s.offers.map((o) => (o.id > prev.offerSeq ? { ...o, at: now } : o)) };
}

/** One move with the win check after it, as the platform applies it (the timer uses it too). */
export const applyMove = (s: CatanState, who: string, a: CatanAction, rng: Rng): CatanState =>
  settle(applyAction(s, who, a, rng), who);

type CatanModule = GameModule<CatanState, CatanAction, CatanView, CatanTableView, CatanOptions>;

export const catan: CatanModule = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({ board: 'Balanced', points: '10', robber: 'Standard', turnTimer: 'Off' }),
  setup: (ctx) => stamp(null, setup(ctx), ctx.now),
  getPlayerView,
  getTableView,
  applyAction: (s, who, a, rng, now) =>
    stamp(s, rolled(s, dated(s, applyMove(s, who, a, rng), now)), now),
  getResult,
  partialResult,
  bot: catanBot,
  botDelayMs: botPace,
  announce,
  waitingOn,
  nextTimer: (s) =>
    s.turnSecs && s.actBy !== null && s.phase !== 'over' ? { id: 'turn', at: s.actBy } : null,
  onTimer: (s, timer, rng, now) =>
    timer !== 'turn' || s.phase === 'over' ? s : stamp(s, rolled(s, timeUp(s, rng)), now),
};
