import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { FULL_DECK, bestHand, cardText, compareScore, type Card } from './cards';
import { meta } from './meta';

/**
 * No-limit Texas Hold'em for 2–10 players. Everyone starts with the same stack; the button moves
 * one seat each hand and the blinds can double every few hands. Each hand: two private cards,
 * then betting before the flop, after the flop (3 cards), the turn and the river. The best five
 * of your two and the five shared cards wins the pot; side pots are split by who could win them.
 * A player with no chips left is out. The game ends when one player has every chip, or after the
 * agreed number of hands (most chips wins).
 *
 * Betting follows the usual no-limit rules: a raise must be at least the size of the last full
 * raise (the big blind at first), an all-in for less doesn't reopen the betting for players who
 * have already acted, and a bet nobody called goes back to whoever made it.
 */

const STACKS = ['500', '1000', '2000'] as const;
const BLINDS = ['5/10', '10/20', '25/50'] as const;
const LENGTHS = ['15 hands', '30 hands', 'Last one standing'] as const;
const RISES = ['Never', 'Every 5 hands', 'Every 10 hands'] as const;
const CLOCKS = ['Off', '30 seconds', '60 seconds'] as const;
const BUY_BACKS = ['No', 'Once each', 'Any time'] as const;

/** Seconds between a hand ending and the next deal, time enough to see the cards. */
export const DEAL_AFTER_MS = 7_000;

export const optionsSchema = z.object({
  stack: z.enum(STACKS).describe('Starting chips'),
  blinds: z.enum(BLINDS).describe('Blinds'),
  blindsDouble: z.enum(RISES).describe('Blinds double'),
  length: z.enum(LENGTHS).describe('Game length'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
  buyBack: z.enum(BUY_BACKS).describe('Buy back in'),
});
export type PokerOptions = z.infer<typeof optionsSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('check') }),
  z.object({ type: z.literal('call') }),
  /** Raise (or bet) so your total bet this round is `to`. */
  z.object({ type: z.literal('raise'), to: z.number().int().positive() }),
  z.object({ type: z.literal('allIn') }),
  /**
   * After a hand: deal the next one now ("Deal now"; the server deals by itself after
   * DEAL_AFTER_MS). Older phones sent it themselves a few seconds after a hand
   * ends, naming the hand just played, so only the first of them deals and the rest do nothing.
   */
  z.object({ type: z.literal('deal'), after: z.number().int().nonnegative().optional() }),
  /** Out of chips, between hands: buy back in for a fresh starting stack (if the table allows). */
  z.object({ type: z.literal('buyBack') }),
]);
export type PokerAction = z.infer<typeof actionSchema>;

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type Phase = Street | 'done' | 'over';

/** One public line of the hand: "Bran raises to 60". */
export interface ActionLine {
  player: string;
  /** fold, check, call, bet, raise, allIn, blind */
  kind: string;
  /** The player's total bet this round after the action, or the blind posted. */
  amount?: number;
  street: Street;
}

export interface PotResult {
  amount: number;
  winners: string[];
  /** What won it: "Flush, ace high", or "Everyone else folded". */
  hand: string;
}

/** How the last hand ended, public once it's over. */
export interface HandResult {
  hand: number;
  pots: PotResult[];
  /** Chips each player won back this hand (pots, plus any uncalled bet). */
  won: Record<string, number>;
  /** Each player's stack change over the hand. */
  net: Record<string, number>;
  /** Hole cards shown at the showdown (none when everyone else folded). */
  shown: Record<string, Card[]>;
  /** Each shown player's best hand in words. */
  hands: Record<string, string>;
  /** The five cards behind each shown hand, to highlight. */
  best: Record<string, Card[]>;
  board: Card[];
  showdown: boolean;
}

export interface PokerState {
  players: string[];
  stacks: Record<string, number>;
  /** Small and big blind now. */
  sb: number;
  bb: number;
  /** Hands between doublings, 0 for never. */
  doubleEvery: number;
  /** Hands to play, 0 for until one player is left. */
  handLimit: number;
  /** Hands dealt so far (the current one included). */
  hand: number;
  phase: Phase;
  dealer: string;
  sbSeat: string | null;
  bbSeat: string;
  /** Secret: the rest of the shuffled deck. */
  deck: Card[];
  /** Secret: each player's two cards. */
  hole: Record<string, Card[]>;
  board: Card[];
  /** Dealt into this hand. */
  inHand: string[];
  folded: string[];
  allIn: string[];
  /** Bets this betting round. */
  bets: Record<string, number>;
  /** Chips put in this hand, earlier rounds and this one. */
  committed: Record<string, number>;
  currentBet: number;
  /** The size of the last full raise. */
  minRaise: number;
  /** Who has acted since the last full raise (they can't raise again over a short all-in). */
  acted: string[];
  toAct: string | null;
  log: ActionLine[];
  last: HandResult | null;
  recap: RecapEvent[];
  /** When the next hand deals itself (server time), between hands. Older games don't have it. */
  dealAt?: number | null;
  /** Seconds each player gets to act, 0 for no limit. */
  turnSecs?: number;
  /** When the player to act runs out of time (server time), if there's a turn timer. */
  actBy?: number | null;
  /** The starting stack, for buying back in. */
  startStack?: number;
  /** Buy-backs allowed per player (0 for none), and until which hand. */
  buyBackLimit?: number;
  buyBackUntil?: number;
  /** Buy-backs each player has made. */
  buyIns?: Record<string, number>;
}

/** Everything public: the TV and every phone render this. */
export interface PokerTableView {
  players: string[];
  stacks: Record<string, number>;
  sb: number;
  bb: number;
  doubleEvery: number;
  handLimit: number;
  hand: number;
  phase: Phase;
  dealer: string;
  sbSeat: string | null;
  bbSeat: string;
  board: Card[];
  inHand: string[];
  folded: string[];
  allIn: string[];
  bets: Record<string, number>;
  /** Everything in the middle: earlier rounds plus this round's bets. */
  pot: number;
  currentBet: number;
  minRaise: number;
  toAct: string | null;
  /** Players who could still raise if it came to them. */
  canRaise: string[];
  log: ActionLine[];
  last: HandResult | null;
  /** When the next hand deals itself (server time), between hands. */
  dealAt: number | null;
  /** When the player to act runs out of time (server time), with a turn timer. */
  actBy: number | null;
  /** Busted players who may still buy back in. */
  canBuyBack: string[];
  buyIns: Record<string, number>;
}

export interface PokerPlayerView extends PokerTableView {
  me: string;
  /** Your two cards this hand (none if you weren't dealt in). */
  hole: Card[];
}

export interface PokerReveal {
  players: string[];
  stacks: Record<string, number>;
  hands: number;
  last: HandResult | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

function parseOptions(o: PokerOptions) {
  const [sb, bb] = o.blinds.split('/').map(Number) as [number, number];
  const handLimit = o.length === 'Last one standing' ? 0 : Number(o.length.split(' ')[0]);
  return {
    turnSecs: o.turnTimer === 'Off' ? 0 : Number(o.turnTimer.split(' ')[0]),
    buyBackLimit: o.buyBack === 'No' ? 0 : o.buyBack === 'Once each' ? 1 : 99,
    // Buying back in is for the first half of the game (the first 10 hands, to the last one).
    buyBackUntil: handLimit > 0 ? Math.floor(handLimit / 2) : 10,
    stack: Number(o.stack),
    sb,
    bb,
    doubleEvery: o.blindsDouble === 'Never' ? 0 : Number(o.blindsDouble.split(' ')[1]),
    handLimit,
  };
}

/** Busted players who may buy back in now: between hands, early enough, with buy-backs left. */
function buyBackers(s: PokerState): string[] {
  if (s.phase !== 'done' || !s.buyBackLimit || s.hand > (s.buyBackUntil ?? 0)) return [];
  return s.players.filter(
    (id) => (s.stacks[id] ?? 0) === 0 && (s.buyIns?.[id] ?? 0) < s.buyBackLimit!,
  );
}

/**
 * Sets the clocks after a change: when a hand has just ended, the next deals itself in a few
 * seconds; when someone new is to act (or acted and it's them again), their turn timer starts.
 */
function stamp(prev: PokerState | null, s: PokerState, now: number): PokerState {
  if (s === prev) return s;
  const ended = s.phase === 'done' && (prev?.phase !== 'done' || prev.hand !== s.hand);
  const dealAt = s.phase === 'done' ? (ended ? now + DEAL_AFTER_MS : (s.dealAt ?? null)) : null;
  const moved = !prev || s.toAct !== prev.toAct || s.log.length !== prev.log.length;
  const actBy =
    s.toAct && s.turnSecs ? (moved ? now + s.turnSecs * 1000 : (s.actBy ?? null)) : null;
  return { ...s, dealAt, actBy };
}

/** Seats from `after` (exclusive) going round, filtered. */
function around(s: { players: string[] }, after: string, keep: (id: string) => boolean): string[] {
  const i = s.players.indexOf(after);
  const n = s.players.length;
  const out: string[] = [];
  for (let k = 1; k <= n; k++) {
    const id = s.players[(i + k) % n]!;
    if (keep(id)) out.push(id);
  }
  return out;
}

const live = (s: PokerState) => s.inHand.filter((id) => !s.folded.includes(id));
const canAct = (s: PokerState) => live(s).filter((id) => !s.allIn.includes(id));
const needsToAct = (s: PokerState, id: string) =>
  canAct(s).includes(id) && (!s.acted.includes(id) || (s.bets[id] ?? 0) < s.currentBet);

/** Put chips in for a player, capped at their stack. */
function put(s: PokerState, id: string, amount: number): PokerState {
  const chips = Math.min(amount, s.stacks[id] ?? 0);
  const stack = (s.stacks[id] ?? 0) - chips;
  return {
    ...s,
    stacks: { ...s.stacks, [id]: stack },
    bets: { ...s.bets, [id]: (s.bets[id] ?? 0) + chips },
    committed: { ...s.committed, [id]: (s.committed[id] ?? 0) + chips },
    allIn: stack === 0 && !s.allIn.includes(id) ? [...s.allIn, id] : s.allIn,
  };
}

/** Deal a new hand, or end the game if it's over. */
function startHand(s: PokerState, rng: { shuffle<T>(xs: readonly T[]): T[] }): PokerState {
  const seated = s.players.filter((id) => (s.stacks[id] ?? 0) > 0);
  if (seated.length < 2 || (s.handLimit > 0 && s.hand >= s.handLimit)) {
    return { ...s, phase: 'over', toAct: null };
  }
  const hand = s.hand + 1;
  const doubled = s.doubleEvery > 0 && s.hand > 0 && s.hand % s.doubleEvery === 0;
  const sb = doubled ? s.sb * 2 : s.sb;
  const bb = doubled ? s.bb * 2 : s.bb;
  const inSeat = (id: string) => seated.includes(id);
  const dealer = s.hand === 0 ? s.dealer : around(s, s.dealer, inSeat)[0]!;
  // Heads-up the button posts the small blind and acts first before the flop.
  const headsUp = seated.length === 2;
  const after = around(s, dealer, inSeat);
  const sbSeat = headsUp ? dealer : after[0]!;
  const bbSeat = headsUp ? after[0]! : after[1]!;
  let deck = rng.shuffle(FULL_DECK);
  const hole: Record<string, Card[]> = {};
  for (const id of seated) {
    hole[id] = deck.slice(0, 2);
    deck = deck.slice(2);
  }
  let next: PokerState = {
    ...s,
    hand,
    sb,
    bb,
    phase: 'preflop',
    dealer,
    sbSeat,
    bbSeat,
    deck,
    hole,
    board: [],
    inHand: s.players.filter(inSeat),
    folded: [],
    allIn: [],
    bets: {},
    committed: {},
    currentBet: bb,
    minRaise: bb,
    acted: [],
    toAct: null,
    log: [],
  };
  next = put(next, sbSeat, sb);
  next = put(next, bbSeat, bb);
  next = {
    ...next,
    log: [
      { player: sbSeat, kind: 'blind', amount: next.bets[sbSeat], street: 'preflop' },
      { player: bbSeat, kind: 'blind', amount: next.bets[bbSeat], street: 'preflop' },
    ],
  };
  const first = around(next, bbSeat, (id) => needsToAct(next, id))[0] ?? null;
  return advanceIfDone({ ...next, toAct: first });
}

/** After an action: the next player to act, or the end of the round or the hand. */
function afterAction(s: PokerState, actor: string): PokerState {
  if (live(s).length === 1) return finishHand(endRound(s));
  const next = around(s, actor, (id) => needsToAct(s, id))[0];
  if (next) return { ...s, toAct: next };
  return advanceIfDone(s);
}

/** If nobody needs to act, close the round and deal on (or show down). */
function advanceIfDone(s: PokerState): PokerState {
  let cur = s;
  for (;;) {
    if (cur.toAct && needsToAct(cur, cur.toAct)) return cur;
    const anyone = cur.inHand.find((id) => needsToAct(cur, id));
    if (anyone) {
      return {
        ...cur,
        toAct: around(cur, cur.toAct ?? cur.dealer, (id) => needsToAct(cur, id))[0]!,
      };
    }
    cur = endRound(cur);
    if (cur.phase === 'river' || live(cur).length < 2) return finishHand(cur);
    cur = nextStreet(cur);
    // With one player or none able to bet, the rest of the board is dealt straight out.
    if (canAct(cur).length < 2) cur = { ...cur, acted: canAct(cur), toAct: null };
  }
}

/** Gather the round's bets into the pot, giving back any bet nobody called. */
function endRound(s: PokerState): PokerState {
  const bets = s.inHand.map((id) => s.bets[id] ?? 0).sort((a, b) => b - a);
  const [top = 0, second = 0] = bets;
  if (top > second) {
    const id = s.inHand.find((p) => (s.bets[p] ?? 0) === top)!;
    const back = top - second;
    return {
      ...s,
      stacks: { ...s.stacks, [id]: (s.stacks[id] ?? 0) + back },
      committed: { ...s.committed, [id]: (s.committed[id] ?? 0) - back },
      allIn: s.allIn.filter((p) => p !== id),
      bets: {},
      toAct: null,
    };
  }
  return { ...s, bets: {}, toAct: null };
}

function nextStreet(s: PokerState): PokerState {
  const street = STREETS[STREETS.indexOf(s.phase as Street) + 1]!;
  const count = street === 'flop' ? 3 : 1;
  const next: PokerState = {
    ...s,
    phase: street,
    board: [...s.board, ...s.deck.slice(0, count)],
    deck: s.deck.slice(count),
    bets: {},
    currentBet: 0,
    minRaise: s.bb,
    acted: [],
  };
  return { ...next, toAct: around(next, next.dealer, (id) => needsToAct(next, id))[0] ?? null };
}

/** Deal out the board if needed, split the pots and record the hand. */
function finishHand(s: PokerState): PokerState {
  const contenders = live(s);
  const showdown = contenders.length > 1;
  let board = s.board;
  let deck = s.deck;
  if (showdown && board.length < 5) {
    const need = 5 - board.length;
    board = [...board, ...deck.slice(0, need)];
    deck = deck.slice(need);
  }
  const best = showdown
    ? Object.fromEntries(contenders.map((id) => [id, bestHand([...(s.hole[id] ?? []), ...board])]))
    : {};
  // Pots by contribution level: each level is shared by everyone who put in at least that much.
  const levels = [...new Set(s.inHand.map((id) => s.committed[id] ?? 0))]
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const pots: PotResult[] = [];
  let prev = 0;
  for (const level of levels) {
    const amount = sum(
      s.inHand.map(
        (id) => Math.min(s.committed[id] ?? 0, level) - Math.min(s.committed[id] ?? 0, prev),
      ),
    );
    const eligible = contenders.filter((id) => (s.committed[id] ?? 0) >= level);
    prev = level;
    if (amount === 0 || eligible.length === 0) continue;
    let winners = eligible;
    let hand = 'Everyone else folded';
    if (showdown) {
      const top = eligible.reduce((a, b) =>
        compareScore(best[b]!.score, best[a]!.score) > 0 ? b : a,
      );
      winners = eligible.filter((id) => compareScore(best[id]!.score, best[top]!.score) === 0);
      hand = best[top]!.name;
    }
    // Merge with the pot below when the same players share it the same way.
    const below = pots[pots.length - 1];
    if (below && below.winners.join() === winners.join() && below.hand === hand)
      below.amount += amount;
    else pots.push({ amount, winners, hand });
  }
  const won: Record<string, number> = {};
  const stacks = { ...s.stacks };
  for (const pot of pots) {
    // Odd chips go to the winners nearest the button's left.
    const order = around(s, s.dealer, (id) => pot.winners.includes(id));
    const share = Math.floor(pot.amount / order.length);
    let odd = pot.amount - share * order.length;
    for (const id of order) {
      const chips = share + (odd > 0 ? 1 : 0);
      if (odd > 0) odd--;
      stacks[id] = (stacks[id] ?? 0) + chips;
      won[id] = (won[id] ?? 0) + chips;
    }
  }
  const net = Object.fromEntries(
    s.inHand.map((id) => [id, (won[id] ?? 0) - (s.committed[id] ?? 0)]),
  );
  const shown = showdown ? Object.fromEntries(contenders.map((id) => [id, s.hole[id] ?? []])) : {};
  const last: HandResult = {
    hand: s.hand,
    pots,
    won,
    net,
    shown,
    hands: showdown ? Object.fromEntries(contenders.map((id) => [id, best[id]!.name])) : {},
    best: showdown ? Object.fromEntries(contenders.map((id) => [id, best[id]!.cards])) : {},
    board,
    showdown,
  };
  const text = pots
    .map(
      (p) =>
        `${p.winners.map((id) => `{${id}}`).join(' and ')} won ${p.amount}${showdown ? ` with ${p.hand.toLowerCase()}` : ''}`,
    )
    .join('; ');
  const folded = s.folded.filter((id) => s.hole[id]);
  const recap: RecapEvent = {
    round: s.hand,
    text: `Hand ${s.hand}: ${text}.`,
    secret: folded.length
      ? folded
          .map((id) => `{${id}} folded ${(s.hole[id] ?? []).map(cardText).join(' ')}`)
          .join('; ')
      : undefined,
    data: { board, shown },
  };
  return {
    ...s,
    phase: 'done',
    board,
    deck,
    stacks,
    bets: {},
    toAct: null,
    last,
    recap: [...s.recap, recap],
  };
}

function view(s: PokerState): PokerTableView {
  return {
    players: s.players,
    stacks: s.stacks,
    sb: s.sb,
    bb: s.bb,
    doubleEvery: s.doubleEvery,
    handLimit: s.handLimit,
    hand: s.hand,
    phase: s.phase,
    dealer: s.dealer,
    sbSeat: s.sbSeat,
    bbSeat: s.bbSeat,
    board: s.board,
    inHand: s.inHand,
    folded: s.folded,
    allIn: s.allIn,
    bets: s.bets,
    pot: sum(Object.values(s.committed)),
    currentBet: s.currentBet,
    minRaise: s.minRaise,
    toAct: s.toAct,
    canRaise: canAct(s).filter((id) => !s.acted.includes(id)),
    log: s.log,
    last: s.last,
    dealAt: s.dealAt ?? null,
    actBy: s.actBy ?? null,
    canBuyBack: buyBackers(s),
    buyIns: s.buyIns ?? {},
  };
}

/** True once the hand just played was the last: one player has every chip, or the hands ran out. */
export function lastHandPlayed(
  t: Pick<PokerTableView, 'players' | 'stacks' | 'hand' | 'handLimit'>,
) {
  const left = t.players.filter((id) => (t.stacks[id] ?? 0) > 0).length;
  return left < 2 || (t.handLimit > 0 && t.hand >= t.handLimit);
}

/** What a player must add to call, and the smallest and largest totals they can raise to. */
export function choices(t: PokerTableView, id: string) {
  const bet = t.bets[id] ?? 0;
  const stack = t.stacks[id] ?? 0;
  const owe = Math.min(t.currentBet - bet, stack);
  const max = bet + stack;
  const minTo = Math.min(t.currentBet + t.minRaise, max);
  const canRaise = t.canRaise.includes(id) && max > t.currentBet;
  return { bet, stack, owe, max, minTo, canRaise, canCheck: owe === 0 };
}

/** One player's move, before the clocks are set (see `stamp`). */
function move(s: PokerState, playerId: string, action: PokerAction, rng: Rng): PokerState {
  if (!s.players.includes(playerId))
    throw new GameError('not_playing', 'You’re not at this table.');
  if (action.type === 'deal') {
    if (action.after !== undefined && (action.after !== s.hand || s.phase !== 'done')) return s;
    if (s.phase !== 'done') throw new GameError('not_yet', 'This hand isn’t over yet.');
    return startHand(s, rng);
  }
  if (action.type === 'buyBack') {
    if (!buyBackers(s).includes(playerId))
      throw new GameError('no_buy_back', 'You can’t buy back in now.');
    return {
      ...s,
      stacks: { ...s.stacks, [playerId]: s.startStack ?? 1000 },
      buyIns: { ...s.buyIns, [playerId]: (s.buyIns?.[playerId] ?? 0) + 1 },
      recap: [
        ...s.recap,
        { round: s.hand, actor: playerId, text: `{${playerId}} bought back in.` },
      ],
    };
  }
  if (s.phase === 'done' || s.phase === 'over')
    throw new GameError('no_hand', 'There’s no hand being played.');
  if (s.toAct !== playerId) throw new GameError('not_your_turn', 'It’s not your turn.');
  const street = s.phase as Street;
  const c = choices(view(s), playerId);
  const line = (kind: string, amount?: number): ActionLine => ({
    player: playerId,
    kind,
    amount,
    street,
  });
  let next: PokerState;
  switch (action.type) {
    case 'fold':
      next = { ...s, folded: [...s.folded, playerId], log: [...s.log, line('fold')] };
      break;
    case 'check':
      if (!c.canCheck) throw new GameError('must_call', `You need to call ${c.owe} or fold.`);
      next = { ...s, log: [...s.log, line('check')] };
      break;
    case 'call':
      if (c.canCheck)
        throw new GameError('nothing_to_call', 'There’s nothing to call. Check instead.');
      next = put(s, playerId, c.owe);
      next = {
        ...next,
        log: [
          ...next.log,
          line(next.allIn.includes(playerId) ? 'allIn' : 'call', next.bets[playerId]),
        ],
      };
      break;
    case 'raise':
    case 'allIn': {
      const to = action.type === 'allIn' ? c.max : action.to;
      if (action.type === 'allIn' && c.max <= s.currentBet) {
        // All-in for no more than the bet is a call.
        next = put(s, playerId, c.owe);
        next = { ...next, log: [...next.log, line('allIn', next.bets[playerId])] };
        break;
      }
      if (!c.canRaise) throw new GameError('no_raise', 'You can only call or fold now.');
      if (to > c.max) throw new GameError('too_much', `You only have ${c.max} to bet.`);
      if (to <= s.currentBet)
        throw new GameError('too_little', `Raise to more than ${s.currentBet}.`);
      if (to < c.minTo) throw new GameError('too_little', `The smallest raise is to ${c.minTo}.`);
      const full = to - s.currentBet >= s.minRaise;
      next = put(s, playerId, to - c.bet);
      next = {
        ...next,
        currentBet: to,
        minRaise: full ? to - s.currentBet : s.minRaise,
        // A full raise reopens the betting for everyone else.
        acted: full ? [] : next.acted,
        log: [
          ...next.log,
          line(next.allIn.includes(playerId) ? 'allIn' : s.currentBet === 0 ? 'bet' : 'raise', to),
        ],
      };
      break;
    }
    default:
      throw new GameError('bad_action', 'That isn’t a poker move.');
  }
  next = {
    ...next,
    acted: next.acted.includes(playerId) ? next.acted : [...next.acted, playerId],
  };
  return afterAction(next, playerId);
}

export const poker: GameModule<
  PokerState,
  PokerAction,
  PokerPlayerView,
  PokerTableView,
  PokerOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({
    stack: '1000',
    blinds: '10/20',
    blindsDouble: 'Every 10 hands',
    length: '30 hands',
    turnTimer: 'Off',
    buyBack: 'No',
  }),

  setup({ playerIds, options, rng, now }) {
    const o = parseOptions(options);
    const base: PokerState = {
      startStack: o.stack,
      turnSecs: o.turnSecs,
      buyBackLimit: o.buyBackLimit,
      buyBackUntil: o.buyBackUntil,
      buyIns: {},
      players: playerIds,
      stacks: Object.fromEntries(playerIds.map((id) => [id, o.stack])),
      sb: o.sb,
      bb: o.bb,
      doubleEvery: o.doubleEvery,
      handLimit: o.handLimit,
      hand: 0,
      phase: 'done',
      dealer: rng.pick(playerIds),
      sbSeat: null,
      bbSeat: playerIds[0]!,
      deck: [],
      hole: {},
      board: [],
      inHand: [],
      folded: [],
      allIn: [],
      bets: {},
      committed: {},
      currentBet: 0,
      minRaise: o.bb,
      acted: [],
      toAct: null,
      log: [],
      last: null,
      recap: [],
    };
    return stamp(null, startHand(base, rng), now);
  },

  getPlayerView(s, playerId) {
    return { ...view(s), me: playerId, hole: s.hole[playerId] ?? [] };
  },

  getTableView: view,

  applyAction(s, playerId, action, rng, now) {
    return stamp(s, move(s, playerId, action, rng), now);
  },

  nextTimer(s) {
    if (s.phase === 'done' && s.dealAt) return { id: 'deal', at: s.dealAt };
    if (s.toAct && s.actBy) return { id: 'act', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'deal' && s.phase === 'done') return stamp(s, startHand(s, rng), now);
    if (id === 'act' && s.toAct) {
      // Out of time: check if that's free, otherwise fold.
      const c = choices(view(s), s.toAct);
      return stamp(s, move(s, s.toAct, { type: c.canCheck ? 'check' : 'fold' }, rng), now);
    }
    return s;
  },

  getResult(s): GameResult | null {
    if (s.phase !== 'over') return null;
    const top = Math.max(...s.players.map((id) => s.stacks[id] ?? 0));
    const winners = s.players.filter((id) => (s.stacks[id] ?? 0) === top);
    const ranked = [...s.players].sort((a, b) => (s.stacks[b] ?? 0) - (s.stacks[a] ?? 0));
    const reveal: PokerReveal = { players: ranked, stacks: s.stacks, hands: s.hand, last: s.last };
    return {
      winners,
      summary:
        s.players.filter((id) => (s.stacks[id] ?? 0) > 0).length === 1
          ? `Last one standing after ${s.hand} hands`
          : winners.length > 1
            ? `A tie at ${top} chips after ${s.hand} hands`
            : `Most chips after ${s.hand} hands: ${top}`,
      reveal,
      recap: s.recap,
      standings: s.players.map((id) => ({
        playerId: id,
        outcome: winners.includes(id) ? (winners.length > 1 ? 'draw' : 'win') : 'loss',
        role: `${s.stacks[id] ?? 0} chips${(s.buyIns?.[id] ?? 0) > 0 ? `, bought back in${s.buyIns![id]! > 1 ? ` ${s.buyIns![id]} times` : ''}` : ''}`,
      })),
    };
  },
};
