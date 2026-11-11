import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type RecapStats,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  cardName,
  cardShort,
  houseValue,
  fullDeck,
  housePower,
  type House,
  type PowerCards,
  type PowerKind,
} from './cards';
import { meta } from './meta';
import { cambioBot } from './bot';

/**
 * Cambio (also played as Cactus or Pablo): the traditional memory and swap card game, for 2–8
 * players with standard cards (one deck, or two from six players).
 *
 * Everyone has four cards face down in a 2×2 grid and may look at the two nearest them once, at
 * the start of a round. In turn, a player either calls "Cambio" (everyone else gets one more turn,
 * then the round ends), draws from the stock, or takes the top discard. A drawn card replaces one
 * of your own (which goes face up on the discard pile) or is discarded; a drawn 7 to King that is
 * discarded can be used for its power. The lowest hand wins the round: cards count at face value,
 * Ace 1, Jack 11, Queen 12, black Kings 13 and red Kings 0. The caller scores 0 if their hand is
 * the lowest (or tied for it) and their total plus 10 if not; everyone else scores their total.
 * Low score wins.
 *
 * Who knows what is tracked in `known`: for each player, which grid slots they currently know.
 * `getPlayerView` shows a player exactly those faces and nothing else.
 */

const GOALS = ['First to 100', 'First to 50', '3 rounds', '5 rounds'] as const;
const CLOCKS = ['Off', '30 seconds', '60 seconds'] as const;
const MEMORY = ['Remember it yourself', 'Keep notes'] as const;
const PEEK_CARDS = ['7 and 8', '9 and 10', 'Jack and Queen', 'None'] as const;
const SPY_CARDS = ['9 and 10', '7 and 8', 'Jack and Queen', 'None'] as const;
const SWAP_CARDS = ['Jack and Queen', '7 and 8', '9 and 10', 'None'] as const;
const KING_POWER = ['Black Kings', 'All Kings', 'None'] as const;
const RED_KINGS = ['0', '-1', '13'] as const;
const PENALTIES = ['10', '5', '20', 'Double'] as const;
const BONUSES = ['0', 'Their total', '-5'] as const;
const OPENING = ['Two', 'One', 'None'] as const;
const EXACTLY = ['Off', 'Drops to 50'] as const;
const JOKERS = ['None', 'Two per deck'] as const;
export const GOAL_LABELS = GOALS;
export const MEMORY_LABELS = MEMORY;
export const CLOCK_LABELS = CLOCKS;
export const PEEK_CARD_LABELS = PEEK_CARDS;
export const SPY_CARD_LABELS = SPY_CARDS;
export const SWAP_CARD_LABELS = SWAP_CARDS;
export const KING_POWER_LABELS = KING_POWER;
export const RED_KING_LABELS = RED_KINGS;
export const CALLER_PENALTY_LABELS = PENALTIES;
export const CALLER_BONUS_LABELS = BONUSES;
export const OPENING_PEEK_LABELS = OPENING;
export const EXACTLY_100_LABELS = EXACTLY;
export const JOKER_LABELS = JOKERS;

/** Cards in each player's grid. */
export const SLOTS = 4;
/** The slots every player may look at once at the start of a round (the two nearest them). */
export const PEEK_SLOTS = [2, 3] as const;
/** How long everyone has to look at their bottom cards before the round starts by itself. */
export const PEEK_MS = 20_000;
/** How long the scores show between rounds before the next deal. */
export const NEXT_ROUND_MS = 15_000;
/** Added to the caller's total when someone beats them. */
export const CALL_PENALTY = 10;
/** Moves kept for the screens (the newest last). */
const MOVES_KEPT = 16;

export const optionsSchema = z.object({
  goal: z.enum(GOALS).describe('Game length'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
  memory: z.enum(MEMORY).describe('Memory'),
  peekCards: z.enum(PEEK_CARDS).describe('Peek (your own)'),
  spyCards: z.enum(SPY_CARDS).describe('Spy (theirs)'),
  swapCards: z.enum(SWAP_CARDS).describe('Blind swap'),
  kingPower: z.enum(KING_POWER).describe('Look and swap'),
  redKings: z.enum(RED_KINGS).describe('Red Kings'),
  callerPenalty: z.enum(PENALTIES).describe('Caller loses'),
  callerBonus: z.enum(BONUSES).describe('Caller wins'),
  openingPeek: z.enum(OPENING).describe('Opening peek'),
  exactly100: z.enum(EXACTLY).describe('Exactly 100'),
  jokers: z.enum(JOKERS).describe('Jokers'),
});
export type CambioOptions = z.infer<typeof optionsSchema>;

const slotSchema = z
  .number()
  .int()
  .min(0)
  .max(SLOTS - 1);
const playerSchema = z.string().min(1).max(64);

export const actionSchema = z.discriminatedUnion('type', [
  /** Peek phase: done looking at your bottom cards. */
  z.object({ type: z.literal('ready') }),
  /** Say "Cambio" instead of drawing: everyone else gets one more turn. */
  z.object({ type: z.literal('call') }),
  /** Draw from the stock (only you see the card). */
  z.object({ type: z.literal('draw') }),
  /** Take the top discard; it must then go into your grid with `keep`. */
  z.object({ type: z.literal('take') }),
  /** Put the card you hold into this slot; the card there goes face up on the discard pile. */
  z.object({ type: z.literal('keep'), slot: slotSchema }),
  /** Discard the card you drew from the stock (a 7 to King then offers its power). */
  z.object({ type: z.literal('discard') }),
  /** 7 or 8: look at one of your own cards. */
  z.object({ type: z.literal('peekOwn'), slot: slotSchema }),
  /** 9 or 10: look at one card of another player. */
  z.object({ type: z.literal('spy'), player: playerSchema, slot: slotSchema }),
  /** Jack or Queen: swap one of your cards with another player's, nobody looking. */
  z.object({
    type: z.literal('swap'),
    mySlot: slotSchema,
    player: playerSchema,
    slot: slotSchema,
  }),
  /** Black King: look at one of your cards and one of another player's. */
  z.object({
    type: z.literal('kingLook'),
    mySlot: slotSchema,
    player: playerSchema,
    slot: slotSchema,
  }),
  /** After a King's look: swap the two cards you looked at. */
  z.object({ type: z.literal('kingSwap') }),
  /** After a King's look: leave both cards where they are. */
  z.object({ type: z.literal('kingKeep') }),
  /** Give up the power and end your turn. */
  z.object({ type: z.literal('skipPower') }),
  /** Between rounds: ready for the next one (it starts when everyone is, or after a timer). */
  z.object({ type: z.literal('next'), after: z.number().int().nonnegative().optional() }),
]);
export type CambioAction = z.infer<typeof actionSchema>;

export type Phase = 'peek' | 'play' | 'scoring' | 'over';
/** Where the player to move is in their turn. */
export type Step = 'start' | 'held' | 'power' | 'king';

/** One public line of play, for the screens to show and animate. No hidden faces. */
export interface Move {
  /** Counts up through the game, so screens can tell new moves from old. */
  seq: number;
  player: string;
  kind:
    | 'call'
    | 'draw'
    | 'take'
    | 'keep'
    | 'discard'
    | 'peek'
    | 'spy'
    | 'swap'
    | 'look'
    | 'kingSwap'
    | 'kingKeep'
    | 'skip'
    | 'shuffle';
  /** A card everyone saw: the one taken, discarded, or put on the pile by a `keep`. */
  card?: number;
  /** The player's own slot (peek, keep, swap, look). */
  slot?: number;
  /** The other player (spy, swap, look), and their slot. */
  target?: string;
  targetSlot?: number;
  /** A keep: where the card came from. */
  from?: 'stock' | 'discard';
  /** Out of time: the server moved for them. */
  late?: boolean;
}

/** How a round ended, public once it's over. */
export interface RoundResult {
  round: number;
  caller: string;
  /** Every player's four cards added up. */
  totals: Record<string, number>;
  /** What each player scored this round (the caller's 0 or total + 10 included). */
  scored: Record<string, number>;
  /** The caller had the lowest total, or tied for it. */
  callerWon: boolean;
  /** Every grid, all cards face up. */
  hands: Record<string, number[]>;
  /** Players whose running score landed on exactly 100 and went down to 50 (that house rule). */
  dropped?: string[];
}

/** Who knows which slots: `known[viewer][owner][slot]`. */
type Known = Record<string, Record<string, boolean[]>>;

export interface CambioState {
  players: string[];
  /** Score that ends the game, or 0 when playing a set number of rounds. */
  target: number;
  /** Rounds to play, or 0 when playing to a score. */
  rounds: number;
  turnSecs: number;
  /** Screens mark the cards the viewer knows with a note chip (a display choice only). */
  notes: boolean;
  /** The house rules this game is played with, resolved at setup and never recomputed. */
  house: House;
  round: number;
  phase: Phase;
  dealer: string;
  /** Secret: everyone's grid (slots 0–3). */
  hands: Record<string, number[]>;
  /** Secret: the stock, next card first. */
  stock: number[];
  /** The discard pile, top card last. */
  discard: number[];
  /** Who currently knows which grid cards. The only source for `getPlayerView`. */
  known: Known;
  toAct: string | null;
  step: Step;
  /** The card in the mover's hand after a draw or a take. Secret when it came from the stock. */
  holding: { card: number; from: 'stock' | 'discard' } | null;
  /** The power on offer after discarding a drawn card (the card is on the pile, so public). */
  power: { kind: PowerKind; card: number } | null;
  /** After a King's look: the two cards looked at. */
  look: { mySlot: number; player: string; slot: number } | null;
  caller: string | null;
  /** Turns taken this round. */
  turns: number;
  /** Peek phase: who is done looking. */
  ready: string[];
  /** Scoring phase: who is ready for the next round. */
  nextReady: string[];
  scores: Record<string, number>;
  seq: number;
  moves: Move[];
  last: RoundResult | null;
  /** Every round played, oldest first. */
  history: RoundResult[];
  recap: RecapEvent[];
  /** When the peek ends by itself (server time). */
  peekAt: number | null;
  /** When the next round deals by itself (server time). */
  nextAt: number | null;
  /** When the player to move runs out of time (server time), with a turn timer. */
  actBy: number | null;
  /** The lowest hand of any round, for the night's awards. */
  lowest?: { player: string; total: number; round: number };
}

/** Everything public: the TV and every phone render this. */
export interface CambioTableView {
  players: string[];
  round: number;
  /** Score that ends the game, or 0. */
  target: number;
  /** Rounds to play, or 0. */
  rounds: number;
  phase: Phase;
  dealer: string;
  toAct: string | null;
  step: Step;
  /** The mover holds a card: `card` is set only when it came from the discard (everyone saw it). */
  holding: { from: 'stock' | 'discard'; card: number | null } | null;
  /** The power the mover may use, and for a King, the two cards they looked at. */
  power: { kind: PowerKind; card: number } | null;
  look: { mySlot: number; player: string; slot: number } | null;
  caller: string | null;
  /** Players who still have a turn before the round ends, in order (empty before a call). */
  turnsLeft: string[];
  /** Turns taken this round (a call is not allowed while this is 0). */
  turns: number;
  ready: string[];
  nextReady: string[];
  scores: Record<string, number>;
  /** The top of the discard pile. */
  top: number | null;
  discardCount: number;
  stockCount: number;
  decks: 1 | 2;
  moves: Move[];
  last: RoundResult | null;
  /** Every grid, only once the round is over (all cards turn face up). */
  hands: Record<string, number[]> | null;
  peekAt: number | null;
  nextAt: number | null;
  actBy: number | null;
  turnSecs: number;
  /** Keep notes: screens mark the cards you know with a small chip. */
  notes: boolean;
  /** The house rules in force (public): screens and bots read powers and values from here. */
  house: House;
}

export interface CambioPlayerView extends CambioTableView {
  me: string;
  /**
   * The faces this player knows, by owner and slot; null is a card they don't know. Everything
   * is shown once a round ends.
   */
  grid: Record<string, (number | null)[]>;
  /** The card you're holding after a draw or a take. */
  held: number | null;
}

export interface CambioReveal {
  /** Lowest score first. */
  players: string[];
  scores: Record<string, number>;
  rounds: number;
  target: number;
  /** Every round: totals, what each scored, all hands. */
  history: RoundResult[];
  /** Each player's four cards from the last round played. */
  lastHands: Record<string, number[]>;
  /** The house rules the game was played under. */
  house: House;
}

/** The house rules an options object asks for, resolved to numbers and slots. */
export function houseOf(o: CambioOptions): House {
  return {
    peek: o.peekCards,
    spy: o.spyCards,
    swap: o.swapCards,
    king: o.kingPower,
    redKing: Number(o.redKings),
    penalty: o.callerPenalty === 'Double' ? 'double' : Number(o.callerPenalty),
    bonus: o.callerBonus === 'Their total' ? 'total' : Number(o.callerBonus),
    peekSlots: o.openingPeek === 'Two' ? [...PEEK_SLOTS] : o.openingPeek === 'One' ? [2] : [],
    exactly100: o.exactly100 === 'Drops to 50',
    jokers: o.jokers === 'Two per deck',
  };
}

/** Why these options can't be played, or null. Two powers can't share the same cards. */
export function houseConflict(o: CambioOptions): string | null {
  const powers: [string, PowerCards][] = [
    ['Peek', o.peekCards],
    ['Spy', o.spyCards],
    ['Swap', o.swapCards],
  ];
  for (let i = 0; i < powers.length; i++)
    for (let j = i + 1; j < powers.length; j++) {
      const [a, b] = [powers[i]!, powers[j]!];
      if (a[1] !== 'None' && a[1] === b[1])
        return `${a[0]} and ${b[0].toLowerCase()} can’t both use ${a[1]}. Pick different cards for one of them.`;
    }
  return null;
}

function parseOptions(o: CambioOptions) {
  return {
    house: houseOf(o),
    target: o.goal === 'First to 100' ? 100 : o.goal === 'First to 50' ? 50 : 0,
    rounds: o.goal === '3 rounds' ? 3 : o.goal === '5 rounds' ? 5 : 0,
    turnSecs: o.turnTimer === 'Off' ? 0 : Number(o.turnTimer.split(' ')[0]),
    notes: o.memory === 'Keep notes',
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const total = (hand: number[], house: House) => sum(hand.map((c) => houseValue(c, house)));

/** The seat after `from`. */
function seatAfter(s: Pick<CambioState, 'players'>, from: string): string {
  return s.players[(s.players.indexOf(from) + 1) % s.players.length]!;
}

const blankRow = () => Array.from({ length: SLOTS }, () => false);

function blankKnown(players: string[]): Known {
  return Object.fromEntries(
    players.map((v) => [v, Object.fromEntries(players.map((o) => [o, blankRow()]))]),
  );
}

/** Set one flag in `known`. */
function mark(k: Known, viewer: string, owner: string, slot: number, value: boolean): Known {
  const row = (k[viewer]?.[owner] ?? blankRow()).map((x, i) => (i === slot ? value : x));
  return { ...k, [viewer]: { ...k[viewer], [owner]: row } };
}

/** Everyone but `except` loses track of this slot (an unseen card went in). */
function forgetSlot(k: Known, players: string[], owner: string, slot: number, except: string) {
  return players.reduce((acc, v) => (v === except ? acc : mark(acc, v, owner, slot, false)), k);
}

/** Everyone knows this slot (the card went in face up for all to see). */
function revealSlot(k: Known, players: string[], owner: string, slot: number) {
  return players.reduce((acc, v) => mark(acc, v, owner, slot, true), k);
}

/** Two cards trade places. Everyone sees which slots, so each player's knowledge goes with them. */
function swapCards(
  s: CambioState,
  a: { id: string; slot: number },
  b: { id: string; slot: number },
): CambioState {
  const hands = { ...s.hands, [a.id]: [...s.hands[a.id]!] };
  hands[b.id] = a.id === b.id ? hands[a.id]! : [...s.hands[b.id]!];
  const x = hands[a.id]![a.slot]!;
  hands[a.id]![a.slot] = hands[b.id]![b.slot]!;
  hands[b.id]![b.slot] = x;
  let known = s.known;
  for (const v of s.players) {
    const ka = known[v]?.[a.id]?.[a.slot] ?? false;
    const kb = known[v]?.[b.id]?.[b.slot] ?? false;
    known = mark(mark(known, v, a.id, a.slot, kb), v, b.id, b.slot, ka);
  }
  return { ...s, hands, known };
}

/** Record a public move. */
function log(s: CambioState, m: Omit<Move, 'seq'>): CambioState {
  const seq = s.seq + 1;
  return { ...s, seq, moves: [...s.moves, { ...m, seq }].slice(-MOVES_KEPT) };
}

/** Add an event to the recap, for this round. */
function note(s: CambioState, e: Omit<RecapEvent, 'round'>): CambioState {
  return { ...s, recap: [...s.recap, { round: s.round, ...e }] };
}

/** True once the round just played was the last. */
export function lastRoundPlayed(
  t: Pick<CambioTableView, 'target' | 'rounds' | 'round' | 'scores'>,
): boolean {
  if (t.rounds > 0) return t.round >= t.rounds;
  return Math.max(0, ...Object.values(t.scores)) >= t.target;
}

/** Deal a new round, or end the game once the goal is met. */
function startRound(s: CambioState, rng: Rng): CambioState {
  if (s.round > 0 && lastRoundPlayed(s)) return { ...s, phase: 'over', toAct: null };
  const round = s.round + 1;
  const dealer = round === 1 ? s.dealer : seatAfter(s, s.dealer);
  let stock = rng.shuffle(fullDeck(s.players.length, s.house.jokers));
  const hands: Record<string, number[]> = {};
  for (const id of s.players) {
    hands[id] = stock.slice(0, SLOTS);
    stock = stock.slice(SLOTS);
  }
  const up = stock[0]!;
  stock = stock.slice(1);
  let known = blankKnown(s.players);
  for (const id of s.players)
    for (const slot of s.house.peekSlots) known = mark(known, id, id, slot, true);
  const dealt: CambioState = {
    ...s,
    round,
    phase: 'peek',
    dealer,
    hands,
    stock,
    discard: [up],
    known,
    toAct: null,
    step: 'start',
    holding: null,
    power: null,
    look: null,
    caller: null,
    turns: 0,
    ready: [],
    nextReady: [],
    moves: [],
  };
  // With no opening peek there is nothing to look at: the round goes straight to play.
  return s.house.peekSlots.length ? dealt : beginPlay(dealt);
}

/** The peek is over: the player after the dealer moves first. */
function beginPlay(s: CambioState): CambioState {
  return { ...s, phase: 'play', toAct: seatAfter(s, s.dealer), step: 'start' };
}

/**
 * What the caller scores: with the lowest hand (or tied) the house bonus (0 by default, or their
 * own total), otherwise their total plus the penalty, or doubled (a total of 0 or less is left
 * as it is, since doubling can't make it worse).
 */
export function callerScore(total: number, won: boolean, house: House): number {
  if (won) return house.bonus === 'total' ? total : house.bonus;
  if (house.penalty === 'double') return total > 0 ? total * 2 : total;
  return total + house.penalty;
}

/** All cards turn face up, and everyone is scored. */
function finishRound(s: CambioState): CambioState {
  const caller = s.caller!;
  const house = s.house;
  const totals = Object.fromEntries(s.players.map((id) => [id, total(s.hands[id]!, house)]));
  const others = s.players.filter((id) => id !== caller);
  const callerWon = totals[caller]! <= Math.min(...others.map((id) => totals[id]!));
  const scored = Object.fromEntries(
    s.players.map((id) => [
      id,
      id !== caller ? totals[id]! : callerScore(totals[id]!, callerWon, house),
    ]),
  );
  const scores = Object.fromEntries(s.players.map((id) => [id, s.scores[id]! + scored[id]!]));
  // The house rule: landing on exactly 100 in a game to 100 drops you to 50.
  const dropped =
    house.exactly100 && s.target === 100 ? s.players.filter((id) => scores[id] === 100) : [];
  for (const id of dropped) scores[id] = 50;
  const hands = Object.fromEntries(s.players.map((id) => [id, [...s.hands[id]!]]));
  const low = Math.min(...Object.values(totals));
  const lowPlayer = s.players.find((id) => totals[id] === low)!;
  const lowest =
    !s.lowest || low < s.lowest.total
      ? { player: lowPlayer, total: low, round: s.round }
      : s.lowest;
  const result: RoundResult = {
    round: s.round,
    caller,
    totals,
    scored,
    callerWon,
    hands,
    ...(dropped.length ? { dropped } : {}),
  };
  const beaten = others.filter((id) => totals[id]! < totals[caller]!);
  const text = callerWon
    ? `Round ${s.round}: {${caller}} called Cambio with ${totals[caller]} and had the lowest hand.`
    : `Round ${s.round}: {${caller}} called Cambio with ${totals[caller]}, but {${
        beaten.sort((a, b) => totals[a]! - totals[b]!)[0]
      }} had ${Math.min(...beaten.map((id) => totals[id]!))}.`;
  const ended: CambioState = {
    ...s,
    phase: 'scoring',
    toAct: null,
    step: 'start',
    holding: null,
    power: null,
    look: null,
    scores,
    lowest,
    last: result,
    history: [...s.history, result],
    nextReady: [],
  };
  return note(ended, {
    actor: caller,
    text,
    secret: s.players
      .map((id) => `{${id}}: ${hands[id]!.map(cardShort).join(' ')} = ${totals[id]}`)
      .join('; '),
    tag: callerWon ? String(scored[caller]) : `+${scored[caller]! - totals[caller]!}`,
    tone: callerWon ? 'good' : 'bad',
    key: true,
    data: { totals, scored, scores, hands },
  });
}

/** A turn is over: the next player moves, or, back at the caller, the round ends. */
function endTurn(s: CambioState, me: string): CambioState {
  const next = seatAfter(s, me);
  const done: CambioState = {
    ...s,
    turns: s.turns + 1,
    holding: null,
    power: null,
    look: null,
    step: 'start',
  };
  if (s.caller && next === s.caller) return finishRound(done);
  return { ...done, toAct: next };
}

/** Take the top of the stock, shuffling the discards (but the top one) back in when it's out. */
function drawStock(s: CambioState, me: string, rng: Rng): { s: CambioState; card: number } {
  let stock = s.stock;
  let discard = s.discard;
  let next = s;
  if (stock.length === 0) {
    if (discard.length <= 1) throw new GameError('empty', 'There are no cards left to draw.');
    stock = rng.shuffle(discard.slice(0, -1));
    discard = discard.slice(-1);
    next = log(next, { player: me, kind: 'shuffle' });
  }
  return { s: { ...next, stock: stock.slice(1), discard }, card: stock[0]! };
}

const STEP_HINT: Record<Step, string> = {
  start: 'Draw, take the top discard, or call Cambio.',
  held: 'Put the card you’re holding into your grid, or discard it.',
  power: 'Use your power, or skip it.',
  king: 'Swap the two cards you looked at, or keep them.',
};

function needStep(s: CambioState, step: Step) {
  if (s.step !== step) throw new GameError('wrong_step', STEP_HINT[s.step]);
}

function checkSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS)
    throw new GameError('bad_slot', 'That isn’t one of the four cards.');
}

/** Another player whose cards may be looked at or swapped. */
function checkTarget(s: CambioState, me: string, player: string) {
  if (!s.players.includes(player)) throw new GameError('no_player', 'That player isn’t here.');
  if (player === me) throw new GameError('self', 'Choose another player’s card.');
  if (player === s.caller)
    throw new GameError('locked', 'That player called Cambio, so their cards are locked.');
}

/** One player's move, before the clocks are set (see `stamp`). */
function move(
  s: CambioState,
  me: string,
  action: CambioAction,
  rng: Rng,
  late = false,
): CambioState {
  if (!s.players.includes(me)) throw new GameError('not_playing', 'You’re not in this game.');
  if (action.type === 'ready') {
    if (s.phase !== 'peek' || s.ready.includes(me)) return s;
    const ready = [...s.ready, me];
    const n = { ...s, ready };
    return ready.length === s.players.length ? beginPlay(n) : n;
  }
  if (action.type === 'next') {
    if (action.after !== undefined && (action.after !== s.round || s.phase !== 'scoring')) return s;
    if (s.phase !== 'scoring') throw new GameError('not_yet', 'This round isn’t over yet.');
    if (s.nextReady.includes(me)) return s;
    const nextReady = [...s.nextReady, me];
    return nextReady.length === s.players.length ? startRound(s, rng) : { ...s, nextReady };
  }
  if (s.phase === 'peek')
    throw new GameError('peeking', 'Everyone is still looking at their bottom cards.');
  if (s.phase !== 'play') throw new GameError('no_round', 'There’s no round being played.');
  if (s.toAct !== me) throw new GameError('not_your_turn', 'It’s not your turn.');
  const hand = s.hands[me]!;

  switch (action.type) {
    case 'call': {
      needStep(s, 'start');
      if (s.caller) throw new GameError('already_called', 'Cambio has already been called.');
      if (s.turns === 0)
        throw new GameError('first_turn', 'You can’t call Cambio on the first turn of a round.');
      const called = log({ ...s, caller: me }, { player: me, kind: 'call', late });
      return endTurn(
        note(called, { actor: me, text: `{${me}} called Cambio.`, tag: 'Cambio!', key: true }),
        me,
      );
    }
    case 'draw': {
      needStep(s, 'start');
      const d = drawStock(s, me, rng);
      return log(
        { ...d.s, step: 'held', holding: { card: d.card, from: 'stock' } },
        { player: me, kind: 'draw', late },
      );
    }
    case 'take': {
      needStep(s, 'start');
      const card = s.discard[s.discard.length - 1];
      if (card === undefined) throw new GameError('empty', 'There’s nothing to take.');
      return log(
        {
          ...s,
          discard: s.discard.slice(0, -1),
          step: 'held',
          holding: { card, from: 'discard' },
        },
        { player: me, kind: 'take', card, late },
      );
    }
    case 'keep': {
      needStep(s, 'held');
      checkSlot(action.slot);
      const held = s.holding!;
      const old = hand[action.slot]!;
      const hands = { ...s.hands, [me]: hand.map((c, i) => (i === action.slot ? held.card : c)) };
      // From the stock, only you know what went in; from the pile, everyone does.
      const known =
        held.from === 'discard'
          ? revealSlot(s.known, s.players, me, action.slot)
          : mark(forgetSlot(s.known, s.players, me, action.slot, me), me, me, action.slot, true);
      const n = log(
        { ...s, hands, known, discard: [...s.discard, old] },
        { player: me, kind: 'keep', slot: action.slot, card: old, from: held.from, late },
      );
      return endTurn(n, me);
    }
    case 'discard': {
      needStep(s, 'held');
      const held = s.holding!;
      if (held.from === 'discard')
        throw new GameError('took_it', 'You took that card, so it has to go into your grid.');
      const kind = housePower(held.card, s.house);
      const n = log(
        { ...s, discard: [...s.discard, held.card], holding: null },
        { player: me, kind: 'discard', card: held.card, late },
      );
      return kind ? { ...n, step: 'power', power: { kind, card: held.card } } : endTurn(n, me);
    }
    case 'skipPower': {
      if (s.step !== 'power' && s.step !== 'king')
        throw new GameError('no_power', STEP_HINT[s.step]);
      return endTurn(log(s, { player: me, kind: 'skip', late }), me);
    }
    case 'peekOwn': {
      needStep(s, 'power');
      if (s.power?.kind !== 'peek')
        throw new GameError('wrong_power', 'That card doesn’t let you look at your own.');
      checkSlot(action.slot);
      return endTurn(
        log(
          { ...s, known: mark(s.known, me, me, action.slot, true) },
          { player: me, kind: 'peek', slot: action.slot, late },
        ),
        me,
      );
    }
    case 'spy': {
      needStep(s, 'power');
      if (s.power?.kind !== 'spy')
        throw new GameError('wrong_power', 'That card doesn’t let you look at another player’s.');
      checkSlot(action.slot);
      checkTarget(s, me, action.player);
      return endTurn(
        log(
          { ...s, known: mark(s.known, me, action.player, action.slot, true) },
          { player: me, kind: 'spy', target: action.player, targetSlot: action.slot, late },
        ),
        me,
      );
    }
    case 'swap': {
      needStep(s, 'power');
      if (s.power?.kind !== 'swap')
        throw new GameError('wrong_power', 'That card doesn’t let you swap.');
      checkSlot(action.mySlot);
      checkSlot(action.slot);
      checkTarget(s, me, action.player);
      const n = swapCards(
        s,
        { id: me, slot: action.mySlot },
        { id: action.player, slot: action.slot },
      );
      return endTurn(
        log(n, {
          player: me,
          kind: 'swap',
          slot: action.mySlot,
          target: action.player,
          targetSlot: action.slot,
          late,
        }),
        me,
      );
    }
    case 'kingLook': {
      needStep(s, 'power');
      if (s.power?.kind !== 'king')
        throw new GameError('wrong_power', 'That card doesn’t let you look and swap.');
      checkSlot(action.mySlot);
      checkSlot(action.slot);
      checkTarget(s, me, action.player);
      const known = mark(
        mark(s.known, me, me, action.mySlot, true),
        me,
        action.player,
        action.slot,
        true,
      );
      return log(
        {
          ...s,
          known,
          step: 'king',
          look: { mySlot: action.mySlot, player: action.player, slot: action.slot },
        },
        {
          player: me,
          kind: 'look',
          slot: action.mySlot,
          target: action.player,
          targetSlot: action.slot,
          late,
        },
      );
    }
    case 'kingSwap': {
      needStep(s, 'king');
      const l = s.look!;
      const n = swapCards(s, { id: me, slot: l.mySlot }, { id: l.player, slot: l.slot });
      return endTurn(
        log(n, {
          player: me,
          kind: 'kingSwap',
          slot: l.mySlot,
          target: l.player,
          targetSlot: l.slot,
          late,
        }),
        me,
      );
    }
    case 'kingKeep': {
      needStep(s, 'king');
      return endTurn(log(s, { player: me, kind: 'kingKeep', late }), me);
    }
    default: {
      const never: never = action;
      throw new GameError('bad_action', `Unknown action ${JSON.stringify(never)}.`);
    }
  }
}

/** Sets the clocks after a change: the peek and between-round timers, and the turn timer. */
function stamp(prev: CambioState | null, s: CambioState, now: number): CambioState {
  if (s === prev) return s;
  const fresh = (phase: Phase) =>
    s.phase === phase && (prev?.phase !== phase || prev.round !== s.round);
  const peekAt = s.phase === 'peek' ? (fresh('peek') ? now + PEEK_MS : s.peekAt) : null;
  const nextAt = s.phase === 'scoring' ? (fresh('scoring') ? now + NEXT_ROUND_MS : s.nextAt) : null;
  const moved =
    !prev ||
    s.toAct !== prev.toAct ||
    s.step !== prev.step ||
    s.phase !== prev.phase ||
    s.round !== prev.round;
  const actBy =
    s.phase === 'play' && s.toAct && s.turnSecs
      ? moved
        ? now + s.turnSecs * 1000
        : s.actBy
      : null;
  return { ...s, peekAt, nextAt, actBy };
}

const revealed = (s: CambioState) => s.phase === 'scoring' || s.phase === 'over';

function view(s: CambioState): CambioTableView {
  const turnsLeft: string[] = [];
  if (s.caller && s.toAct) {
    for (let p = s.toAct; p !== s.caller; p = seatAfter(s, p)) turnsLeft.push(p);
  }
  return {
    players: s.players,
    round: s.round,
    target: s.target,
    rounds: s.rounds,
    phase: s.phase,
    dealer: s.dealer,
    toAct: s.toAct,
    step: s.step,
    holding: s.holding
      ? { from: s.holding.from, card: s.holding.from === 'discard' ? s.holding.card : null }
      : null,
    power: s.power,
    look: s.look,
    caller: s.caller,
    turnsLeft,
    turns: s.turns,
    ready: s.ready,
    nextReady: s.nextReady,
    scores: s.scores,
    top: s.discard[s.discard.length - 1] ?? null,
    discardCount: s.discard.length,
    stockCount: s.stock.length,
    decks: s.players.length >= 6 ? 2 : 1,
    moves: s.moves,
    last: s.last,
    hands: revealed(s) ? s.hands : null,
    peekAt: s.peekAt,
    nextAt: s.nextAt,
    actBy: s.actBy,
    turnSecs: s.turnSecs,
    notes: s.notes,
    house: s.house,
  };
}

/** Per-player numbers for the end screen, in this order. */
function recapStats(s: CambioState, order: string[]): RecapStats {
  const calls = (id: string) => s.history.filter((r) => r.caller === id);
  return {
    columns: ['Points', 'Best hand', 'Cambios', 'Cambios won'],
    rows: order.map((id) => ({
      playerId: id,
      values: [
        s.scores[id] ?? 0,
        s.history.length ? Math.min(...s.history.map((r) => r.totals[id] ?? 0)) : '-',
        calls(id).length,
        calls(id).filter((r) => r.callerWon).length,
      ],
    })),
  };
}

/** The result on the rounds scored so far (a finished game, or ended early). */
function resultOf(s: CambioState): GameResult {
  const low = Math.min(...s.players.map((id) => s.scores[id] ?? 0));
  const winners = s.players.filter((id) => (s.scores[id] ?? 0) === low);
  const ranked = [...s.players].sort((a, b) => (s.scores[a] ?? 0) - (s.scores[b] ?? 0));
  const rounds = s.history.length;
  const after = `after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  const lastHands = s.last?.hands ?? {};
  const reveal: CambioReveal = {
    players: ranked,
    scores: s.scores,
    rounds,
    target: s.target,
    history: s.history,
    lastHands,
    house: s.house,
  };
  return {
    winners,
    summary:
      winners.length > 1
        ? `A tie at ${low} points ${after}`
        : `Lowest score: ${low} points ${after}`,
    reveal,
    recap: s.recap,
    roundName: 'Round',
    stats: recapStats(s, [...winners, ...ranked.filter((id) => !winners.includes(id))]),
    highlights: s.lowest
      ? [
          {
            award: 'Lowest round',
            playerIds: [s.lowest.player],
            text: `${s.lowest.total} in round ${s.lowest.round}`,
            value: 100 - s.lowest.total,
          },
        ]
      : [],
    standings: s.players.map((id) => ({
      playerId: id,
      outcome: winners.includes(id) ? (winners.length > 1 ? 'draw' : 'win') : 'loss',
      role: `${s.scores[id] ?? 0} points`,
    })),
  };
}

/**
 * The result if the host ended the game now: the lowest score over the rounds scored so far
 * wins, ties share. Null before the first round is scored.
 */
export function partialResult(s: CambioState): GameResult | null {
  if (s.phase === 'over') return resultOf(s);
  if (s.history.length === 0) return null;
  return resultOf(s);
}

export const cambio: GameModule<
  CambioState,
  CambioAction,
  CambioPlayerView,
  CambioTableView,
  CambioOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({
    goal: 'First to 100',
    turnTimer: 'Off',
    memory: 'Remember it yourself',
    peekCards: '7 and 8',
    spyCards: '9 and 10',
    swapCards: 'Jack and Queen',
    kingPower: 'Black Kings',
    redKings: '0',
    callerPenalty: '10',
    callerBonus: '0',
    openingPeek: 'Two',
    exactly100: 'Off',
    jokers: 'None',
  }),
  validateOptions: (options) => houseConflict(options),

  setup({ playerIds, options, rng, now }) {
    const o = parseOptions(options);
    const base: CambioState = {
      players: playerIds,
      target: o.target,
      rounds: o.rounds,
      turnSecs: o.turnSecs,
      notes: o.notes,
      house: o.house,
      round: 0,
      phase: 'scoring',
      dealer: rng.pick(playerIds),
      hands: {},
      stock: [],
      discard: [],
      known: blankKnown(playerIds),
      toAct: null,
      step: 'start',
      holding: null,
      power: null,
      look: null,
      caller: null,
      turns: 0,
      ready: [],
      nextReady: [],
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      seq: 0,
      moves: [],
      last: null,
      history: [],
      recap: [],
      peekAt: null,
      nextAt: null,
      actBy: null,
    };
    return stamp(null, startRound(base, rng), now);
  },

  getPlayerView(s, playerId) {
    const all = revealed(s);
    const grid = Object.fromEntries(
      s.players.map((owner) => [
        owner,
        (s.hands[owner] ?? []).map((card, slot) =>
          all || s.known[playerId]?.[owner]?.[slot] ? card : null,
        ),
      ]),
    );
    return {
      ...view(s),
      me: playerId,
      grid,
      held: s.toAct === playerId && s.holding ? s.holding.card : null,
    };
  },

  getTableView: view,

  applyAction(s, playerId, action, rng, now) {
    return stamp(s, move(s, playerId, action, rng), now);
  },

  waitingOn(s) {
    if (s.phase === 'peek') return s.players.filter((id) => !s.ready.includes(id));
    return s.phase === 'play' && s.toAct ? [s.toAct] : [];
  },

  nextTimer(s) {
    if (s.phase === 'peek' && s.peekAt) return { id: 'peek', at: s.peekAt };
    if (s.phase === 'scoring' && s.nextAt) return { id: 'next', at: s.nextAt };
    if (s.phase === 'play' && s.toAct && s.actBy) return { id: 'act', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'peek' && s.phase === 'peek') return stamp(s, beginPlay(s), now);
    if (id === 'next' && s.phase === 'scoring') return stamp(s, startRound(s, rng), now);
    if (id === 'act' && s.phase === 'play' && s.toAct && s.actBy) {
      // Out of time: draw and discard without a power, or finish what's in hand.
      const who = s.toAct;
      let n = s;
      const go = (a: CambioAction) => {
        n = move(n, who, a, rng, true);
      };
      if (n.step === 'start') go({ type: 'draw' });
      if (n.toAct === who && n.step === 'held') {
        if (n.holding!.from === 'stock') go({ type: 'discard' });
        else go({ type: 'keep', slot: rng.int(SLOTS) });
      }
      if (n.toAct === who && (n.step === 'power' || n.step === 'king')) go({ type: 'skipPower' });
      return stamp(s, n, now);
    }
    return s;
  },

  announce(prev, next) {
    const lines: string[] = [];
    if (next.caller && next.caller !== prev?.caller) lines.push(`{${next.caller}} called Cambio!`);
    if (next.last && next.last !== prev?.last) {
      const r = next.last;
      lines.push(
        r.callerWon
          ? `Round ${r.round}: {${r.caller}} had the lowest hand, ${r.totals[r.caller]}.`
          : `Round ${r.round}: {${r.caller}} called too soon and scores ${r.scored[r.caller]}.`,
      );
    }
    return lines;
  },

  partialResult,
  bot: cambioBot,

  getResult(s) {
    return s.phase === 'over' ? resultOf(s) : null;
  },
};

/** The cards a player may swap with or look at: everyone but themselves and a caller. */
export function targets(t: Pick<CambioTableView, 'players' | 'caller'>, me: string): string[] {
  return t.players.filter((id) => id !== me && id !== t.caller);
}

/** The names of the faces in a hand, for logs and tests. */
export const describeHand = (hand: number[]) => hand.map(cardName).join(', ');
