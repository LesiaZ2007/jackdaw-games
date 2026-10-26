import {
  GameError,
  type Announcement,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  BAIL,
  BOARD,
  DEEDS,
  GO_SALARY,
  UTILITIES,
  HOTELS,
  HOUSES,
  RAILROADS,
  JAIL,
  SPACES,
  START_CASH,
  deedAt,
  kindWord,
  spaceName,
  type Names,
  mortgageValue,
  nearest,
  setOf,
  streetAt,
  unmortgageCost,
} from './board';
import { CHANCE, CHEST, cardById, cardText, type Deck } from './cards';
import { meta } from './meta';
import { monopolyBot } from './bot';

/**
 * Monopoly for 2 to 6, by the classic rules: roll and move, buy what you land on or see it go to
 * auction, collect rent, build evenly on full colour groups, mortgage, trade, and go bankrupt
 * when you can't pay. The last player standing wins, or the richest once a round limit is up.
 *
 * Everything at a Monopoly table is public except the order of the two card decks, which stays
 * in the state and never reaches a view.
 *
 * A payment a player can't make at once goes on a queue of debts. While the queue isn't empty
 * the first debtor must raise the money (sell buildings, mortgage, trade) or go bankrupt, and
 * nobody else moves. A player who couldn't raise it even by selling everything goes bankrupt
 * straight away.
 */

const ENDS = ['Last one standing', 'After 30 rounds', 'After 20 rounds'] as const;
const LAND = ['Goes to auction', 'Stays with the bank'] as const;
const PARKING = ['Nothing', 'Collects the taxes'] as const;
const BOARDS = ['Classic', 'Market town'] as const;
const CLOCKS = ['Off', '60 seconds', '90 seconds'] as const;

/** How long an auction waits after the last bid before it closes. */
export const AUCTION_MS = 15_000;
/** How long the deciding moment stays on the table before the results screen. */
export const SHOW_MS = 3_600;
const LOG = 40;

export const optionsSchema = z.object({
  ends: z.enum(ENDS).describe('Game ends'),
  unbought: z.enum(LAND).describe('Land nobody buys'),
  parking: z.enum(PARKING).describe('Free Parking'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
  board: z.enum(BOARDS).describe('Board'),
});
export type MonopolyOptions = z.infer<typeof optionsSchema>;

const space = z
  .number()
  .int()
  .min(0)
  .max(SPACES - 1);
const side = z.object({
  cash: z.number().int().min(0).max(100_000),
  deeds: z.array(space).max(28),
  cards: z.number().int().min(0).max(2),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('bail') }),
  z.object({ type: z.literal('useCard') }),
  z.object({ type: z.literal('buy') }),
  z.object({ type: z.literal('decline') }),
  z.object({ type: z.literal('bid'), amount: z.number().int().min(1).max(100_000) }),
  z.object({ type: z.literal('pass') }),
  z.object({ type: z.literal('build'), space }),
  z.object({ type: z.literal('sell'), space }),
  z.object({ type: z.literal('mortgage'), space }),
  z.object({ type: z.literal('unmortgage'), space }),
  z.object({ type: z.literal('end') }),
  z.object({ type: z.literal('bankrupt') }),
  z.object({ type: z.literal('offer'), to: z.string(), give: side, get: side }),
  z.object({ type: z.literal('accept'), id: z.number().int() }),
  z.object({ type: z.literal('reject'), id: z.number().int() }),
  z.object({ type: z.literal('cancel'), id: z.number().int() }),
]);
export type MonopolyAction = z.infer<typeof actionSchema>;
export type TradeSide = z.infer<typeof side>;

export type Phase = 'roll' | 'buy' | 'auction' | 'debt' | 'done' | 'show' | 'over';

export interface Seat {
  id: string;
  cash: number;
  pos: number;
  jailed: boolean;
  /** Failed rolls for doubles this stay in jail. */
  tries: number;
  /** Get out of Jail free cards held, by card id. */
  cards: string[];
  out: boolean;
}

export interface Holding {
  owner: string;
  mortgaged: boolean;
  /** 0–4 houses, 5 is a hotel. */
  houses: number;
}

export interface Debt {
  from: string;
  /** Null: the bank. */
  to: string | null;
  amount: number;
  why: string;
  /** A tax, which goes to Free Parking when that rule is on. */
  tax?: boolean;
}

export interface Auction {
  space: number;
  high: number;
  by: string | null;
  out: string[];
  until: number;
}

export interface Offer {
  id: number;
  from: string;
  to: string;
  give: TradeSide;
  get: TradeSide;
}

/** What happens once the current landing is fully dealt with. */
export type After = 'roll' | 'done' | { move: number };

export interface MoveEvent {
  by: string;
  from: number;
  to: number;
  /** Moved straight there (to jail, or by a card) rather than walking round. */
  jump: boolean;
}

export interface LogEntry {
  seq: number;
  text: string;
  kind:
    | 'roll'
    | 'move'
    | 'buy'
    | 'rent'
    | 'card'
    | 'tax'
    | 'jail'
    | 'build'
    | 'trade'
    | 'bank'
    | 'auction'
    | 'out'
    | 'cash';
  by?: string;
  space?: number;
  /** Who was paid, for a payment between players. */
  to?: string;
  /** Money that changed hands. */
  amount?: number;
  /** The card drawn. */
  card?: string;
}

export interface MonopolyState {
  players: string[];
  /** Turn order, drawn at the start. */
  order: string[];
  seats: Record<string, Seat>;
  /** Owned deeds by space. */
  deeds: Record<string, Holding>;
  /** Secret: the order of each deck, top first. */
  decks: Record<Deck, string[]>;
  phase: Phase;
  turn: string;
  /** Doubles rolled this turn. */
  doubles: number;
  dice: [number, number] | null;
  /** Bumped each time the dice are thrown, so screens can roll them. */
  rolls: number;
  pendingBuy: number | null;
  auction: Auction | null;
  debts: Debt[];
  after: After;
  offers: Offer[];
  nextOffer: number;
  pot: number;
  bankHouses: number;
  bankHotels: number;
  auctions: boolean;
  parkingPot: boolean;
  names: Names;
  maxRounds: number;
  turnSecs: number;
  round: number;
  actBy: number | null;
  showBy: number | null;
  /** The last card drawn, for the screens to show. */
  card: { id: string; by: string; seq: number } | null;
  /** Each move in the last action, for the screens to walk the tokens. */
  moves: MoveEvent[];
  seq: number;
  log: LogEntry[];
  /** Order players went bankrupt, first out first. */
  fallen: string[];
  rent: Record<string, number>;
  winners: string[];
  ending: string | null;
  recap: RecapEvent[];
}

export interface SeatView {
  id: string;
  cash: number;
  pos: number;
  jailed: boolean;
  tries: number;
  cards: number;
  out: boolean;
  worth: number;
}

export interface MonopolyTableView {
  players: string[];
  order: string[];
  seats: Record<string, SeatView>;
  deeds: Record<string, Holding>;
  phase: Phase;
  turn: string;
  doubles: number;
  dice: [number, number] | null;
  rolls: number;
  pendingBuy: number | null;
  auction: Auction | null;
  debts: Debt[];
  offers: Offer[];
  pot: number;
  bankHouses: number;
  bankHotels: number;
  auctions: boolean;
  parkingPot: boolean;
  names: Names;
  maxRounds: number;
  round: number;
  actBy: number | null;
  showBy: number | null;
  card: { id: string; by: string; seq: number; deck: Deck; text: string } | null;
  moves: MoveEvent[];
  seq: number;
  log: LogEntry[];
  winners: string[];
}

export interface MonopolyPlayerView extends MonopolyTableView {
  me: string;
}

export interface MonopolyReveal {
  players: string[];
  winners: string[];
  worth: Record<string, number>;
  cash: Record<string, number>;
  deeds: Record<string, Holding>;
  fallen: string[];
  rent: Record<string, number>;
  rounds: number;
}

/* ------------------------------------------------------------------ helpers */

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const nameOf = (s: Pick<MonopolyState, 'names'>, space: number) => spaceName(space, s.names);

function seat(s: MonopolyState, id: string): Seat {
  const found = s.seats[id];
  if (!found) throw new GameError('NOT_A_PLAYER', "You're not in this game.");
  return found;
}

function active(s: MonopolyState): string[] {
  return s.order.filter((id) => !s.seats[id]!.out);
}

function holding(s: MonopolyState, space: number): Holding | null {
  return s.deeds[String(space)] ?? null;
}

function ownedBy(s: MonopolyState, id: string): number[] {
  return DEEDS.filter((d) => holding(s, d)?.owner === id);
}

function note(
  s: MonopolyState,
  kind: LogEntry['kind'],
  text: string,
  extra: Partial<LogEntry> = {},
) {
  s.seq += 1;
  s.log.push({ seq: s.seq, kind, text, ...extra });
  if (s.log.length > LOG) s.log.splice(0, s.log.length - LOG);
}

function recap(s: MonopolyState, actor: string, text: string) {
  s.recap.push({ round: s.round, actor, text });
}

/** True when one player owns every deed in a colour group. */
function fullSet(s: MonopolyState, space: number): boolean {
  const owner = holding(s, space)?.owner;
  return Boolean(owner) && setOf(space).every((d) => holding(s, d)?.owner === owner);
}

function setHasBuildings(s: MonopolyState, space: number): boolean {
  return setOf(space).some((d) => (holding(s, d)?.houses ?? 0) > 0);
}

/** Cash plus what selling every building and mortgaging every deed would raise. */
export function liquidValue(s: Pick<MonopolyState, 'seats' | 'deeds'>, id: string): number {
  let total = s.seats[id]?.cash ?? 0;
  for (const d of DEEDS) {
    const h = s.deeds[String(d)];
    if (!h || h.owner !== id) continue;
    total += (h.houses * (streetAt(d)?.house ?? 0)) / 2;
    if (!h.mortgaged) total += mortgageValue(d);
  }
  return total;
}

/** Cash, plus every deed at its price (half if mortgaged), plus buildings at cost. */
export function netWorth(s: Pick<MonopolyState, 'seats' | 'deeds'>, id: string): number {
  const p = s.seats[id];
  if (!p || p.out) return 0;
  let total = p.cash;
  for (const d of DEEDS) {
    const h = s.deeds[String(d)];
    if (!h || h.owner !== id) continue;
    total += h.mortgaged ? mortgageValue(d) : deedAt(d)!.price;
    total += h.houses * (streetAt(d)?.house ?? 0);
  }
  return total;
}

/** The rent owed for landing on an owned deed. `roll` is the dice total for a utility. */
export function rentFor(
  s: Pick<MonopolyState, 'deeds'>,
  space: number,
  roll: number,
  card: 'double' | 'ten' | null = null,
): number {
  const h = s.deeds[String(space)];
  const deed = deedAt(space);
  if (!h || !deed || h.mortgaged) return 0;
  const owns = (spaces: readonly number[]) =>
    spaces.filter((d) => s.deeds[String(d)]?.owner === h.owner).length;
  if (deed.kind === 'street') {
    if (h.houses > 0) return deed.rent[h.houses]!;
    const full = setOf(space).every((d) => s.deeds[String(d)]?.owner === h.owner);
    return full ? deed.rent[0] * 2 : deed.rent[0];
  }
  if (deed.kind === 'railroad') {
    const rent = 25 * 2 ** (owns(RAILROADS) - 1);
    return card === 'double' ? rent * 2 : rent;
  }
  const times = card === 'ten' || owns(UTILITIES) === 2 ? 10 : 4;
  return roll * times;
}

/* ------------------------------------------------------------------ money */

function credit(s: MonopolyState, to: string | null, amount: number, tax = false) {
  if (to) s.seats[to]!.cash += amount;
  else if (tax && s.parkingPot) s.pot += amount;
}

/** Pay at once if the cash is there and nothing is queued ahead; otherwise queue the debt. */
function charge(s: MonopolyState, debt: Debt) {
  if (debt.amount <= 0) return;
  const p = s.seats[debt.from]!;
  if (p.out) return;
  const queued = s.debts.some((d) => d.from === debt.from);
  if (!queued && p.cash >= debt.amount) {
    p.cash -= debt.amount;
    credit(s, debt.to, debt.amount, debt.tax);
    if (debt.to) s.rent[debt.to] = (s.rent[debt.to] ?? 0) + (debt.why === 'rent' ? debt.amount : 0);
    return;
  }
  s.debts.push(debt);
}

/** Hand a bankrupt player's estate to whoever they owe, or back to the bank. */
function bankrupt(s: MonopolyState, id: string, to: string | null) {
  const p = s.seats[id]!;
  // Sell every building back to the bank first.
  for (const d of ownedBy(s, id)) {
    const h = holding(s, d)!;
    if (h.houses === 5) s.bankHotels += 1;
    else s.bankHouses += h.houses;
    p.cash += (h.houses * (streetAt(d)?.house ?? 0)) / 2;
    h.houses = 0;
  }
  if (to && !s.seats[to]!.out) {
    s.seats[to]!.cash += p.cash;
    for (const d of ownedBy(s, id)) holding(s, d)!.owner = to;
    s.seats[to]!.cards.push(...p.cards);
  } else {
    for (const d of ownedBy(s, id)) delete s.deeds[String(d)];
    for (const c of p.cards) s.decks[cardById(c).deck].push(c);
  }
  p.cash = 0;
  p.cards = [];
  p.out = true;
  p.jailed = false;
  s.fallen.push(id);
  s.debts = s.debts.filter((d) => d.from !== id).map((d) => (d.to === id ? { ...d, to: null } : d));
  s.offers = s.offers.filter((o) => o.from !== id && o.to !== id);
  if (s.auction) {
    if (s.auction.by === id) s.auction = { ...s.auction, by: null, high: 0 };
    if (!s.auction.out.includes(id)) s.auction.out.push(id);
  }
  const text = to ? `{${id}} is bankrupt and everything goes to {${to}}.` : `{${id}} is bankrupt.`;
  note(s, 'out', text, { by: id });
  recap(s, id, text);
}

/* ------------------------------------------------------------------ moving */

function walk(s: MonopolyState, id: string, to: number, jump: boolean, passGo: boolean) {
  const p = s.seats[id]!;
  const from = p.pos;
  if (passGo && to < from) {
    p.cash += GO_SALARY;
    note(s, 'cash', `{${id}} passed GO and collected ${money(GO_SALARY)}.`, {
      by: id,
      amount: GO_SALARY,
    });
  }
  p.pos = to;
  s.moves.push({ by: id, from, to, jump });
}

function toJail(s: MonopolyState, id: string) {
  const p = s.seats[id]!;
  s.moves.push({ by: id, from: p.pos, to: JAIL, jump: true });
  p.pos = JAIL;
  p.jailed = true;
  p.tries = 0;
  if (id === s.turn) s.after = 'done';
  note(s, 'jail', `{${id}} went to Jail.`, { by: id });
}

function draw(s: MonopolyState, deck: Deck): string {
  const id = s.decks[deck].shift()!;
  // Get out of Jail free stays with the player; every other card goes to the bottom.
  if (cardById(id).effect.t !== 'free') s.decks[deck].push(id);
  return id;
}

/** Deal with landing on a space. `card` is a Chance card's rent rule for this landing. */
function land(s: MonopolyState, id: string, rng: Rng, card: 'double' | 'ten' | null = null) {
  const p = s.seats[id]!;
  const sp = BOARD[p.pos]!;
  switch (sp.kind) {
    case 'gotojail':
      toJail(s, id);
      return;
    case 'tax':
      note(s, 'tax', `{${id}} paid ${money(sp.amount)} ${sp.name}.`, {
        by: id,
        space: p.pos,
        amount: sp.amount,
      });
      charge(s, { from: id, to: null, amount: sp.amount, why: sp.name, tax: true });
      return;
    case 'parking':
      if (s.parkingPot && s.pot > 0) {
        note(s, 'cash', `{${id}} took ${money(s.pot)} from Free Parking.`, {
          by: id,
          amount: s.pot,
        });
        p.cash += s.pot;
        s.pot = 0;
      }
      return;
    case 'chance':
    case 'chest':
      playCard(s, id, draw(s, sp.kind), rng);
      return;
    case 'street':
    case 'railroad':
    case 'utility': {
      const h = holding(s, p.pos);
      if (!h) {
        s.pendingBuy = p.pos;
        return;
      }
      if (h.owner === id || h.mortgaged) return;
      let roll = (s.dice?.[0] ?? 0) + (s.dice?.[1] ?? 0);
      if (card === 'ten') {
        const d: [number, number] = [rng.int(6) + 1, rng.int(6) + 1];
        s.dice = d;
        s.rolls += 1;
        roll = d[0] + d[1];
        note(
          s,
          'roll',
          `{${id}} rolled ${d[0]} and ${d[1]} for the ${kindWord('utility', s.names)}.`,
          { by: id },
        );
      }
      const rent = rentFor(s, p.pos, roll, card);
      note(s, 'rent', `{${id}} paid {${h.owner}} ${money(rent)} rent for ${nameOf(s, p.pos)}.`, {
        by: id,
        to: h.owner,
        amount: rent,
        space: p.pos,
      });
      charge(s, { from: id, to: h.owner, amount: rent, why: 'rent' });
      return;
    }
    default:
      return;
  }
}

function playCard(s: MonopolyState, id: string, cardId: string, rng: Rng) {
  const c = cardById(cardId);
  const p = s.seats[id]!;
  note(
    s,
    'card',
    `{${id}} drew ${c.deck === 'chance' ? 'Chance' : 'Community Chest'}: ${cardText(cardId, s.names)}`,
    {
      by: id,
      card: cardId,
    },
  );
  s.card = { id: cardId, by: id, seq: s.seq };
  const e = c.effect;
  switch (e.t) {
    case 'advance':
      walk(s, id, e.to, true, true);
      land(s, id, rng);
      return;
    case 'nearestRailroad':
      walk(s, id, nearest(p.pos, RAILROADS), true, true);
      land(s, id, rng, 'double');
      return;
    case 'nearestUtility':
      walk(s, id, nearest(p.pos, UTILITIES), true, true);
      land(s, id, rng, 'ten');
      return;
    case 'back':
      walk(s, id, (p.pos - e.n + SPACES) % SPACES, false, false);
      land(s, id, rng);
      return;
    case 'jail':
      toJail(s, id);
      return;
    case 'free':
      p.cards.push(cardId);
      return;
    case 'collect':
      p.cash += e.n;
      return;
    case 'pay':
      charge(s, { from: id, to: null, amount: e.n, why: 'card', tax: true });
      return;
    case 'repairs': {
      let bill = 0;
      for (const d of ownedBy(s, id)) {
        const n = holding(s, d)!.houses;
        bill += n === 5 ? e.hotel : n * e.house;
      }
      charge(s, { from: id, to: null, amount: bill, why: 'repairs', tax: true });
      return;
    }
    case 'payEach':
      for (const other of active(s)) {
        if (other !== id) charge(s, { from: id, to: other, amount: e.n, why: 'card' });
      }
      return;
    case 'collectEach':
      for (const other of active(s)) {
        if (other !== id) charge(s, { from: other, to: id, amount: e.n, why: 'card' });
      }
      return;
  }
}

/** Move by a dice total from the current space, collecting at GO, and land. */
function advance(s: MonopolyState, id: string, steps: number, rng: Rng) {
  const p = s.seats[id]!;
  walk(s, id, (p.pos + steps) % SPACES, false, true);
  land(s, id, rng);
}

/* ------------------------------------------------------------------ turn flow */

function clock(s: MonopolyState, now: number) {
  const timed = s.phase === 'roll' || s.phase === 'buy' || s.phase === 'done' || s.phase === 'debt';
  s.actBy = s.turnSecs && timed ? now + s.turnSecs * 1000 : null;
}

function finish(s: MonopolyState, now: number, winners: string[], ending: string) {
  s.winners = winners;
  s.ending = ending;
  s.phase = 'show';
  s.showBy = now + SHOW_MS;
  s.pendingBuy = null;
  s.auction = null;
  s.debts = [];
  s.offers = [];
}

function richest(s: MonopolyState): string[] {
  const alive = active(s);
  const best = Math.max(...alive.map((id) => netWorth(s, id)));
  return alive.filter((id) => netWorth(s, id) === best);
}

function nextTurn(s: MonopolyState, now: number) {
  const alive = active(s);
  const at = s.order.indexOf(s.turn);
  let next = s.turn;
  for (let k = 1; k <= s.order.length; k++) {
    const id = s.order[(at + k) % s.order.length]!;
    if (!s.seats[id]!.out) {
      next = id;
      if ((at + k) % s.order.length <= at) s.round += 1;
      break;
    }
  }
  if (alive.length <= 1) return;
  if (s.maxRounds && s.round > s.maxRounds) {
    s.round = s.maxRounds;
    const top = richest(s);
    finish(s, now, top, `The richest after ${s.maxRounds} rounds.`);
    return;
  }
  s.turn = next;
  s.doubles = 0;
  s.after = 'roll';
  s.phase = 'roll';
}

/**
 * Work out what happens next: clear any debts that can now be paid, bankrupt anyone who can
 * never pay, then on to an auction, a purchase, a pending move, another roll or the end of the
 * turn.
 */
function settle(s: MonopolyState, rng: Rng, now: number) {
  for (let guard = 0; guard < 200; guard++) {
    if (s.phase === 'show' || s.phase === 'over') return;
    const alive = active(s);
    if (alive.length <= 1) {
      finish(s, now, alive, 'The last one standing.');
      return;
    }
    const head = s.debts[0];
    if (head) {
      const p = s.seats[head.from]!;
      if (p.cash >= head.amount) {
        s.debts.shift();
        p.cash -= head.amount;
        credit(s, head.to, head.amount, head.tax);
        if (head.to && head.why === 'rent') s.rent[head.to] = (s.rent[head.to] ?? 0) + head.amount;
        continue;
      }
      if (liquidValue(s, head.from) < head.amount) {
        bankrupt(s, head.from, head.to);
        continue;
      }
      s.phase = 'debt';
      return;
    }
    if (s.seats[s.turn]!.out) {
      s.pendingBuy = null;
      s.after = 'done';
      nextTurn(s, now);
      continue;
    }
    if (s.auction) {
      s.phase = 'auction';
      return;
    }
    if (s.pendingBuy !== null) {
      s.phase = 'buy';
      return;
    }
    const after = s.after;
    if (typeof after === 'object') {
      s.after = 'done';
      advance(s, s.turn, after.move, rng);
      continue;
    }
    s.phase = after;
    return;
  }
}

function roll(s: MonopolyState, id: string, rng: Rng) {
  const p = s.seats[id]!;
  const d: [number, number] = [rng.int(6) + 1, rng.int(6) + 1];
  const doubles = d[0] === d[1];
  s.dice = d;
  s.rolls += 1;
  note(s, 'roll', `{${id}} rolled ${d[0]} and ${d[1]}.`, { by: id });
  if (p.jailed) {
    if (doubles) {
      p.jailed = false;
      p.tries = 0;
      note(s, 'jail', `{${id}} rolled doubles and walked out of Jail.`, { by: id });
      s.after = 'done';
      advance(s, id, d[0] + d[1], rng);
      return;
    }
    p.tries += 1;
    if (p.tries < 3) {
      s.after = 'done';
      return;
    }
    // Third miss: pay the fine and move.
    p.jailed = false;
    p.tries = 0;
    note(s, 'jail', `{${id}} paid ${money(BAIL)} to leave Jail.`, { by: id });
    s.after = { move: d[0] + d[1] };
    charge(s, { from: id, to: null, amount: BAIL, why: 'bail', tax: true });
    return;
  }
  if (doubles) {
    s.doubles += 1;
    if (s.doubles === 3) {
      note(s, 'jail', `{${id}} rolled three doubles in a row.`, { by: id });
      toJail(s, id);
      return;
    }
  }
  s.after = doubles ? 'roll' : 'done';
  advance(s, id, d[0] + d[1], rng);
}

function buy(s: MonopolyState, id: string, at: number, price: number, how: string) {
  const p = s.seats[id]!;
  p.cash -= price;
  s.deeds[String(at)] = { owner: id, mortgaged: false, houses: 0 };
  const text = `{${id}} ${how} ${nameOf(s, at)} for ${money(price)}.`;
  note(s, 'buy', text, { by: id, space: at, amount: price });
  recap(s, id, text);
}

function closeAuction(s: MonopolyState) {
  const a = s.auction!;
  s.auction = null;
  if (a.by && s.seats[a.by] && !s.seats[a.by]!.out) {
    const winner = s.seats[a.by]!;
    if (winner.cash >= a.high) {
      buy(s, a.by, a.space, a.high, 'won the auction for');
      return;
    }
  }
  note(s, 'auction', `Nobody bought ${nameOf(s, a.space)}.`, { space: a.space });
}

function auctionDone(s: MonopolyState): boolean {
  const a = s.auction!;
  const left = active(s).filter((id) => !a.out.includes(id) && id !== a.by);
  return left.length === 0;
}

/* ------------------------------------------------------------------ building and loans */

function mustOwn(s: MonopolyState, id: string, at: number): Holding {
  const h = holding(s, at);
  if (!h || h.owner !== id) throw new GameError('NOT_YOURS', `You don't own ${nameOf(s, at)}.`);
  return h;
}

/** Why a house can't go on this street now, or null. */
export function buildBlock(s: MonopolyState, id: string, at: number): string | null {
  const st = streetAt(at);
  const h = holding(s, at);
  if (!st || !h || h.owner !== id) return 'You can only build on your own streets.';
  if (!fullSet(s, at)) return 'Build once you own the whole colour group.';
  const group = setOf(at).map((d) => holding(s, d)!);
  if (group.some((g) => g.mortgaged)) return 'Lift the mortgages in this group first.';
  if (h.houses >= 5) return 'That street already has a hotel.';
  if (group.some((g) => g.houses < h.houses)) return 'Build evenly across the group.';
  if (s.seats[id]!.cash < st.house) return `A house here costs ${money(st.house)}.`;
  if (h.houses === 4 ? s.bankHotels === 0 : s.bankHouses === 0) {
    return h.houses === 4 ? 'The bank has no hotels left.' : 'The bank has no houses left.';
  }
  return null;
}

export function sellBlock(s: MonopolyState, id: string, at: number): string | null {
  const h = holding(s, at);
  if (!streetAt(at) || !h || h.owner !== id) return 'You can only sell from your own streets.';
  if (h.houses === 0) return 'There is nothing built there.';
  if (setOf(at).some((d) => holding(s, d)!.houses > h.houses))
    return 'Sell evenly across the group.';
  return null;
}

export function mortgageBlock(s: MonopolyState, id: string, at: number): string | null {
  const h = holding(s, at);
  if (!h || h.owner !== id) return "That isn't yours.";
  if (h.mortgaged) return 'It is already mortgaged.';
  if (setHasBuildings(s, at)) return 'Sell the buildings in this group first.';
  return null;
}

function build(s: MonopolyState, id: string, at: number) {
  const block = buildBlock(s, id, at);
  if (block) throw new GameError('CANT_BUILD', block);
  const h = holding(s, at)!;
  const st = streetAt(at)!;
  s.seats[id]!.cash -= st.house;
  if (h.houses === 4) {
    s.bankHotels -= 1;
    s.bankHouses += 4;
  } else s.bankHouses -= 1;
  h.houses += 1;
  note(s, 'build', `{${id}} built ${h.houses === 5 ? 'a hotel' : 'a house'} on ${nameOf(s, at)}.`, {
    by: id,
    space: at,
  });
}

function sell(s: MonopolyState, id: string, at: number) {
  const block = sellBlock(s, id, at);
  if (block) throw new GameError('CANT_SELL', block);
  const h = holding(s, at)!;
  const st = streetAt(at)!;
  if (h.houses === 5) {
    // A hotel comes down to four houses, or as many as the bank still has.
    const back = Math.min(4, s.bankHouses);
    s.bankHotels += 1;
    s.bankHouses -= back;
    s.seats[id]!.cash += ((5 - back) * st.house) / 2;
    h.houses = back;
  } else {
    s.bankHouses += 1;
    s.seats[id]!.cash += st.house / 2;
    h.houses -= 1;
  }
  note(s, 'build', `{${id}} sold a building on ${nameOf(s, at)}.`, { by: id, space: at });
}

function mortgage(s: MonopolyState, id: string, at: number) {
  const block = mortgageBlock(s, id, at);
  if (block) throw new GameError('CANT_MORTGAGE', block);
  holding(s, at)!.mortgaged = true;
  s.seats[id]!.cash += mortgageValue(at);
  note(s, 'bank', `{${id}} mortgaged ${nameOf(s, at)} for ${money(mortgageValue(at))}.`, {
    by: id,
    space: at,
  });
}

function unmortgage(s: MonopolyState, id: string, at: number) {
  const h = mustOwn(s, id, at);
  if (!h.mortgaged) throw new GameError('NOT_MORTGAGED', `${nameOf(s, at)} isn't mortgaged.`);
  const cost = unmortgageCost(at);
  if (s.seats[id]!.cash < cost) throw new GameError('NO_CASH', `Lifting it costs ${money(cost)}.`);
  s.seats[id]!.cash -= cost;
  h.mortgaged = false;
  note(s, 'bank', `{${id}} lifted the mortgage on ${nameOf(s, at)}.`, { by: id, space: at });
}

/**
 * Raise money for the first debt the way a careful player would: sell buildings from the
 * cheapest groups first, then mortgage the cheapest deeds. Used when the clock runs out, and by
 * the bot. Returns the moves it made, in order.
 */
export function raisePlan(s: MonopolyState, id: string, need: number): MonopolyAction[] {
  const draft = structuredClone(s);
  const plan: MonopolyAction[] = [];
  for (let guard = 0; guard < 80 && draft.seats[id]!.cash < need; guard++) {
    const owned = ownedBy(draft, id);
    const sellable = owned
      .filter((d) => sellBlock(draft, id, d) === null)
      .sort((a, b) => streetAt(a)!.house - streetAt(b)!.house || a - b);
    if (sellable.length) {
      sell(draft, id, sellable[0]!);
      plan.push({ type: 'sell', space: sellable[0]! });
      continue;
    }
    const loans = owned
      .filter((d) => mortgageBlock(draft, id, d) === null)
      .sort((a, b) => mortgageValue(a) - mortgageValue(b) || a - b);
    if (!loans.length) break;
    mortgage(draft, id, loans[0]!);
    plan.push({ type: 'mortgage', space: loans[0]! });
  }
  return plan;
}

/* ------------------------------------------------------------------ trading */

function checkSide(s: MonopolyState, id: string, t: TradeSide, cash: boolean) {
  const p = s.seats[id]!;
  if (new Set(t.deeds).size !== t.deeds.length)
    throw new GameError('BAD_TRADE', 'A deed is listed twice.');
  for (const d of t.deeds) {
    const h = holding(s, d);
    if (!h || h.owner !== id) {
      throw new GameError('BAD_TRADE', `${nameOf(s, d)} doesn't belong to {${id}}.`);
    }
    if (setHasBuildings(s, d)) {
      throw new GameError(
        'BAD_TRADE',
        `Sell the buildings in ${nameOf(s, d)}'s group before trading it.`,
      );
    }
  }
  if (t.cards > p.cards.length) throw new GameError('BAD_TRADE', 'Not that many Jail cards.');
  if (cash && t.cash > p.cash)
    throw new GameError('BAD_TRADE', `{${id}} doesn't have ${money(t.cash)}.`);
}

function emptySide(t: TradeSide) {
  return t.cash === 0 && t.deeds.length === 0 && t.cards === 0;
}

function hand(s: MonopolyState, from: string, to: string, t: TradeSide) {
  s.seats[from]!.cash -= t.cash;
  s.seats[to]!.cash += t.cash;
  for (const d of t.deeds) holding(s, d)!.owner = to;
  const cards = s.seats[from]!.cards.splice(0, t.cards);
  s.seats[to]!.cards.push(...cards);
}

/** "Mudlark Row, $50 and a Jail card" */
export function describeSide(t: TradeSide, names: Names = 'classic'): string {
  const bits = t.deeds.map((d) => spaceName(d, names));
  if (t.cash) bits.push(money(t.cash));
  if (t.cards) bits.push(t.cards === 1 ? 'a Jail card' : `${t.cards} Jail cards`);
  if (!bits.length) return 'nothing';
  return bits.length === 1 ? bits[0]! : `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}`;
}

/* ------------------------------------------------------------------ views */

function table(s: MonopolyState): MonopolyTableView {
  const card = s.card
    ? { ...s.card, deck: cardById(s.card.id).deck, text: cardText(s.card.id, s.names) }
    : null;
  return {
    players: s.players.slice(),
    order: s.order.slice(),
    seats: Object.fromEntries(
      s.players.map((id) => {
        const p = s.seats[id]!;
        return [
          id,
          {
            id,
            cash: p.cash,
            pos: p.pos,
            jailed: p.jailed,
            tries: p.tries,
            cards: p.cards.length,
            out: p.out,
            worth: netWorth(s, id),
          },
        ];
      }),
    ),
    deeds: structuredClone(s.deeds),
    phase: s.phase,
    turn: s.turn,
    doubles: s.doubles,
    dice: s.dice,
    rolls: s.rolls,
    pendingBuy: s.pendingBuy,
    auction: s.auction ? structuredClone(s.auction) : null,
    debts: s.debts.map((d) => ({ ...d })),
    offers: structuredClone(s.offers),
    pot: s.pot,
    bankHouses: s.bankHouses,
    bankHotels: s.bankHotels,
    auctions: s.auctions,
    parkingPot: s.parkingPot,
    names: s.names,
    maxRounds: s.maxRounds,
    round: s.round,
    actBy: s.actBy,
    showBy: s.showBy,
    card,
    moves: s.moves.map((m) => ({ ...m })),
    seq: s.seq,
    log: s.log.slice(),
    winners: s.winners.slice(),
  };
}

function resultOf(s: MonopolyState, winners: string[], summary: string): GameResult {
  const worth = Object.fromEntries(s.players.map((id) => [id, netWorth(s, id)]));
  const topRent = Math.max(0, ...Object.values(s.rent));
  const landlords = s.players.filter((id) => (s.rent[id] ?? 0) === topRent && topRent > 0);
  return {
    winners,
    summary,
    reveal: {
      players: s.players.slice(),
      winners,
      worth,
      cash: Object.fromEntries(s.players.map((id) => [id, s.seats[id]!.cash])),
      deeds: structuredClone(s.deeds),
      fallen: s.fallen.slice(),
      rent: { ...s.rent },
      rounds: s.round,
    } satisfies MonopolyReveal,
    recap: s.recap,
    standings: s.players.map((id) => ({
      playerId: id,
      outcome:
        winners.length > 1 && winners.includes(id) ? 'draw' : winners.includes(id) ? 'win' : 'loss',
    })),
    ...(landlords.length
      ? {
          highlights: [
            {
              award: 'Landlord',
              playerIds: landlords,
              text: `Collected ${money(topRent)} in rent`,
              value: topRent,
            },
          ],
        }
      : {}),
  };
}

/* ------------------------------------------------------------------ actions */

function onTurn(s: MonopolyState, id: string, phase: Phase | Phase[]) {
  const phases = Array.isArray(phase) ? phase : [phase];
  if (s.turn !== id || !phases.includes(s.phase)) {
    throw new GameError(
      'NOT_YOUR_TURN',
      s.turn === id ? "That isn't a move right now." : "It isn't your turn.",
    );
  }
}

function act(s: MonopolyState, id: string, a: MonopolyAction, rng: Rng, now: number) {
  const p = seat(s, id);
  if (p.out) throw new GameError('OUT', "You're out of the game.");
  switch (a.type) {
    case 'roll':
      onTurn(s, id, 'roll');
      roll(s, id, rng);
      break;
    case 'bail':
      onTurn(s, id, 'roll');
      if (!p.jailed) throw new GameError('NOT_JAILED', "You aren't in Jail.");
      if (p.cash < BAIL) throw new GameError('NO_CASH', `Bail is ${money(BAIL)}.`);
      p.cash -= BAIL;
      credit(s, null, BAIL, true);
      p.jailed = false;
      p.tries = 0;
      note(s, 'jail', `{${id}} paid ${money(BAIL)} bail.`, { by: id, amount: BAIL });
      return;
    case 'useCard': {
      onTurn(s, id, 'roll');
      if (!p.jailed) throw new GameError('NOT_JAILED', "You aren't in Jail.");
      const c = p.cards.shift();
      if (!c) throw new GameError('NO_CARD', "You don't have a Get out of Jail free card.");
      s.decks[cardById(c).deck].push(c);
      p.jailed = false;
      p.tries = 0;
      note(s, 'jail', `{${id}} used a Get out of Jail free card.`, { by: id });
      return;
    }
    case 'buy': {
      onTurn(s, id, 'buy');
      const at = s.pendingBuy!;
      const price = deedAt(at)!.price;
      if (p.cash < price) throw new GameError('NO_CASH', `${nameOf(s, at)} costs ${money(price)}.`);
      s.pendingBuy = null;
      buy(s, id, at, price, 'bought');
      break;
    }
    case 'decline': {
      onTurn(s, id, 'buy');
      const at = s.pendingBuy!;
      s.pendingBuy = null;
      if (s.auctions) {
        s.auction = { space: at, high: 0, by: null, out: [], until: now + AUCTION_MS };
        note(s, 'auction', `${nameOf(s, at)} goes to auction.`, { space: at });
      }
      break;
    }
    case 'bid': {
      const au = s.auction;
      if (s.phase !== 'auction' || !au)
        throw new GameError('NO_AUCTION', 'Nothing is up for auction.');
      if (au.out.includes(id))
        throw new GameError('OUT_OF_AUCTION', "You've dropped out of this auction.");
      if (a.amount <= au.high) throw new GameError('LOW_BID', `Bid more than ${money(au.high)}.`);
      if (a.amount > p.cash) throw new GameError('NO_CASH', `You have ${money(p.cash)}.`);
      au.high = a.amount;
      au.by = id;
      au.until = now + AUCTION_MS;
      note(s, 'auction', `{${id}} bid ${money(a.amount)}.`, { by: id, space: au.space });
      if (auctionDone(s)) closeAuction(s);
      break;
    }
    case 'pass': {
      const au = s.auction;
      if (s.phase !== 'auction' || !au)
        throw new GameError('NO_AUCTION', 'Nothing is up for auction.');
      if (au.by === id) throw new GameError('LEADING', "You're the top bidder.");
      if (au.out.includes(id)) throw new GameError('OUT_OF_AUCTION', "You've already dropped out.");
      au.out.push(id);
      if (auctionDone(s)) closeAuction(s);
      break;
    }
    case 'build':
    case 'sell':
    case 'mortgage':
    case 'unmortgage':
      if (s.phase === 'auction') throw new GameError('NOT_NOW', 'Wait for the auction to finish.');
      if (
        s.phase === 'debt' &&
        s.debts[0]?.from !== id &&
        a.type !== 'sell' &&
        a.type !== 'mortgage'
      ) {
        throw new GameError('NOT_NOW', 'Wait while the debt is settled.');
      }
      if (a.type === 'build') build(s, id, a.space);
      else if (a.type === 'sell') sell(s, id, a.space);
      else if (a.type === 'mortgage') mortgage(s, id, a.space);
      else unmortgage(s, id, a.space);
      break;
    case 'end':
      onTurn(s, id, 'done');
      s.card = null;
      nextTurn(s, now);
      break;
    case 'bankrupt': {
      const head = s.debts[0];
      if (s.phase !== 'debt' || head?.from !== id) {
        throw new GameError('NOT_NOW', 'You can only give up when you owe more than you have.');
      }
      bankrupt(s, id, head.to);
      break;
    }
    case 'offer': {
      if (s.phase === 'show' || s.phase === 'over')
        throw new GameError('GAME_OVER', 'The game is over.');
      if (a.to === id) throw new GameError('BAD_TRADE', 'Trade with someone else.');
      const them = seat(s, a.to);
      if (them.out) throw new GameError('BAD_TRADE', 'They are out of the game.');
      if (emptySide(a.give) && emptySide(a.get))
        throw new GameError('BAD_TRADE', 'Put something in the offer.');
      checkSide(s, id, a.give, true);
      checkSide(s, a.to, a.get, false);
      s.offers = s.offers.filter((o) => o.from !== id);
      s.nextOffer += 1;
      s.offers.push({ id: s.nextOffer, from: id, to: a.to, give: a.give, get: a.get });
      note(
        s,
        'trade',
        `{${id}} offered {${a.to}} ${describeSide(a.give, s.names)} for ${describeSide(a.get, s.names)}.`,
        {
          by: id,
        },
      );
      return;
    }
    case 'accept':
    case 'reject':
    case 'cancel': {
      const o = s.offers.find((x) => x.id === a.id);
      if (!o) throw new GameError('NO_OFFER', 'That offer is gone.');
      if (a.type === 'cancel' ? o.from !== id : o.to !== id) {
        throw new GameError('NOT_YOURS', "That offer isn't yours to answer.");
      }
      s.offers = s.offers.filter((x) => x.id !== a.id);
      if (a.type === 'accept') {
        if (s.phase === 'auction')
          throw new GameError('NOT_NOW', 'Wait for the auction to finish.');
        checkSide(s, o.from, o.give, true);
        checkSide(s, o.to, o.get, true);
        hand(s, o.from, o.to, o.give);
        hand(s, o.to, o.from, o.get);
        // An accepted deed can't be promised twice.
        const moved = new Set([...o.give.deeds, ...o.get.deeds]);
        s.offers = s.offers.filter(
          (x) => ![...x.give.deeds, ...x.get.deeds].some((d) => moved.has(d)),
        );
        const text = `{${o.to}} took {${o.from}}'s trade: ${describeSide(o.give, s.names)} for ${describeSide(o.get, s.names)}.`;
        note(s, 'trade', text, { by: o.to });
        recap(s, o.to, text);
        break;
      }
      note(
        s,
        'trade',
        a.type === 'reject'
          ? `{${id}} turned down {${o.from}}'s offer.`
          : `{${id}} withdrew an offer.`,
        {
          by: id,
        },
      );
      return;
    }
  }
}

/** The move the table makes for a player whose clock ran out. */
function lateMove(s: MonopolyState): { id: string; action: MonopolyAction } | null {
  if (s.phase === 'debt' && s.debts[0]) {
    const id = s.debts[0].from;
    const plan = raisePlan(s, id, s.debts[0].amount);
    return { id, action: plan[0] ?? { type: 'bankrupt' } };
  }
  if (s.phase === 'roll') return { id: s.turn, action: { type: 'roll' } };
  if (s.phase === 'buy') return { id: s.turn, action: { type: 'decline' } };
  if (s.phase === 'done') return { id: s.turn, action: { type: 'end' } };
  return null;
}

function apply(
  s0: MonopolyState,
  id: string,
  a: MonopolyAction,
  rng: Rng,
  now: number,
): MonopolyState {
  if (s0.phase === 'show' || s0.phase === 'over')
    throw new GameError('GAME_OVER', 'The game is over.');
  const s = structuredClone(s0);
  const quiet = a.type === 'offer' || a.type === 'reject' || a.type === 'cancel';
  if (!quiet) s.moves = [];
  act(s, id, a, rng, now);
  if (!quiet) settle(s, rng, now);
  const waited = monopoly.waitingOn!(s0).includes(id);
  if (s0.phase !== s.phase || s0.turn !== s.turn || (waited && !quiet)) clock(s, now);
  return s;
}

export const monopoly: GameModule<
  MonopolyState,
  MonopolyAction,
  MonopolyPlayerView,
  MonopolyTableView,
  MonopolyOptions
> = {
  meta,
  optionsSchema,
  actionSchema,

  defaultOptions() {
    return {
      board: 'Classic',
      ends: 'Last one standing',
      unbought: 'Goes to auction',
      parking: 'Collects the taxes',
      turnTimer: 'Off',
    };
  },

  validateOptions(_options, playerCount) {
    return playerCount >= 2 && playerCount <= 6 ? null : 'Monopoly is for 2 to 6 players.';
  },

  setup({ playerIds, options, rng, now }) {
    const order = rng.shuffle(playerIds);
    const turnSecs = options.turnTimer === 'Off' ? 0 : Number(options.turnTimer.split(' ')[0]);
    const maxRounds = options.ends === 'Last one standing' ? 0 : Number(options.ends.split(' ')[1]);
    const s: MonopolyState = {
      players: playerIds.slice(),
      order,
      seats: Object.fromEntries(
        playerIds.map((id) => [
          id,
          { id, cash: START_CASH, pos: 0, jailed: false, tries: 0, cards: [], out: false },
        ]),
      ),
      deeds: {},
      decks: {
        chance: rng.shuffle(CHANCE.map((c) => c.id)),
        chest: rng.shuffle(CHEST.map((c) => c.id)),
      },
      phase: 'roll',
      turn: order[0]!,
      doubles: 0,
      dice: null,
      rolls: 0,
      pendingBuy: null,
      auction: null,
      debts: [],
      after: 'roll',
      offers: [],
      nextOffer: 0,
      pot: 0,
      bankHouses: HOUSES,
      bankHotels: HOTELS,
      auctions: options.unbought === 'Goes to auction',
      parkingPot: options.parking === 'Collects the taxes',
      maxRounds,
      turnSecs,
      names: options.board === 'Market town' ? 'town' : 'classic',
      round: 1,
      actBy: null,
      showBy: null,
      card: null,
      moves: [],
      seq: 0,
      log: [],
      fallen: [],
      rent: {},
      winners: [],
      ending: null,
      recap: [],
    };
    clock(s, now);
    return s;
  },

  getPlayerView(s, playerId) {
    return { ...table(s), me: playerId };
  },

  getTableView: table,

  applyAction(s, playerId, action, rng, now) {
    return apply(s, playerId, action, rng, now);
  },

  getResult(s) {
    if (s.phase !== 'over') return null;
    return resultOf(s, s.winners, s.ending ?? 'The last one standing.');
  },

  waitingOn(s) {
    if (s.phase === 'show' || s.phase === 'over') return [];
    const ids = new Set<string>();
    if (s.phase === 'debt' && s.debts[0]) ids.add(s.debts[0].from);
    else if (s.phase === 'auction' && s.auction) {
      for (const id of active(s))
        if (!s.auction.out.includes(id) && id !== s.auction.by) ids.add(id);
    } else ids.add(s.turn);
    for (const o of s.offers) ids.add(o.to);
    return [...ids];
  },

  announce(prev, next) {
    if (!prev) return [`{${next.turn}} goes first.`];
    const lines: Announcement[] = [];
    for (const entry of next.log) {
      if (entry.seq <= prev.seq) continue;
      if (
        entry.kind === 'buy' ||
        entry.kind === 'out' ||
        (entry.kind === 'trade' && entry.text.includes('took'))
      ) {
        lines.push(entry.text);
      }
    }
    return lines;
  },

  partialResult(s) {
    if (s.phase === 'over') return monopoly.getResult(s);
    if (s.phase === 'show') return resultOf(s, s.winners, s.ending ?? 'The last one standing.');
    if (!s.log.length) return null;
    const top = richest(s);
    return resultOf(
      s,
      top,
      top.length > 1 ? 'Level on worth.' : 'The richest when the game ended.',
    );
  },

  nextTimer(s) {
    if (s.phase === 'show' && s.showBy) return { id: 'show', at: s.showBy };
    if (s.phase === 'auction' && s.auction) return { id: 'auction', at: s.auction.until };
    if (s.actBy) return { id: 'turn', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'show' && s.phase === 'show') return { ...s, phase: 'over', showBy: null };
    if (id === 'auction' && s.phase === 'auction' && s.auction && now >= s.auction.until) {
      const next = structuredClone(s);
      next.moves = [];
      closeAuction(next);
      settle(next, rng, now);
      clock(next, now);
      return next;
    }
    if (id === 'turn' && s.actBy && now >= s.actBy) {
      if (s.phase === 'debt' && s.debts[0]) {
        // Raise what the plan can in one go, then give up if it still isn't enough.
        const debtor = s.debts[0].from;
        let next = s;
        for (const step of raisePlan(s, debtor, s.debts[0].amount)) {
          next = apply(next, debtor, step, rng, now);
          if (next.phase !== 'debt' || next.debts[0]?.from !== debtor) return next;
        }
        return apply(next, debtor, { type: 'bankrupt' }, rng, now);
      }
      const late = lateMove(s);
      if (!late) return { ...s, actBy: null };
      return apply(s, late.id, late.action, rng, now);
    }
    return s;
  },

  bot: monopolyBot,
  botDelayMs: 1_300,
};
