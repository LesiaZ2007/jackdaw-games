import { z } from 'zod';
import {
  botChoose,
  botSlips,
  GameError,
  type Announcement,
  type BotLevel,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type RecapStats,
  type Standing,
} from '@jackdaw/engine';
import { DECK, cardShort, rankOf, stacks, suitOf, type Card, type Suit } from './cards';
import { meta } from './meta';

/**
 * Multiplayer solitaire (2026-10-30): everyone deals their own deck as Klondike and plays at
 * once. The foundations in the middle are shared, so anyone can build on any of them. When
 * nobody has a card that goes, everyone pulls one covered card at the same time, again until
 * someone can play. The first to get rid of every card wins.
 *
 * Moves race each other over polling, so every move names the card it moves: a tap on a card
 * that has already gone (or a foundation someone else just built on) is refused, not misapplied.
 */

export const DRAWS = ['Draw one', 'Draw three'] as const;

export const optionsSchema = z.object({
  draw: z.enum(DRAWS).describe('Turning the stock'),
});
export type SolitaireOptions = z.infer<typeof optionsSchema>;

const cardSchema = z.string().regex(/^[A2-9TJQK][shdc]$/);
/** Where a card comes from: the top of your waste, or one of your seven columns. */
const sourceSchema = z.union([z.literal('waste'), z.number().int().min(0).max(6)]);
export type Source = z.infer<typeof sourceSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  /** Turn the stock (one or three cards), or turn the waste back over when the stock is empty. */
  z.object({ type: z.literal('draw') }),
  /** Put a card up on a foundation in the middle (an ace starts a new one). */
  z.object({ type: z.literal('up'), from: sourceSchema, card: cardSchema }),
  /** Move a card, with everything on it, onto one of your columns. */
  z.object({
    type: z.literal('move'),
    from: sourceSchema,
    card: cardSchema,
    to: z.number().int().min(0).max(6),
  }),
]);
export type SolitaireAction = z.infer<typeof actionSchema>;
export type Move = Exclude<SolitaireAction, { type: 'draw' }>;

export interface Column {
  /** Face down, bottom first. */
  down: Card[];
  /** Face up, bottom first: always a run down in alternating colours. */
  up: Card[];
}

export interface Seat {
  /** Face down, top last. */
  stock: Card[];
  /** Face up, top last. */
  waste: Card[];
  cols: Column[];
  /** Cards this player has put up in the middle. */
  played: number;
  /** Server time of this player's last move (bots pace themselves by it). */
  movedAt: number;
}

export interface Foundation {
  suit: Suit;
  /** Ace first. */
  cards: Card[];
  /** Whose deck each card came from. */
  by: string[];
}

/** The last time everyone was stuck: what each player pulled (null: nothing left to pull). */
export interface Pull {
  n: number;
  cards: Record<string, Card | null>;
}

/** The last card put up in the middle, for the screens to land it. */
export interface LastUp {
  n: number;
  by: string;
  card: Card;
  pile: number;
}

export interface SolitaireState {
  players: string[];
  draw: 1 | 3;
  seats: Record<string, Seat>;
  foundations: Foundation[];
  pulls: number;
  pull: Pull | null;
  ups: number;
  last: LastUp | null;
  over: boolean;
  winners: string[];
  /** Over because nobody could move and nobody had a covered card left to pull. */
  blocked: boolean;
  startedAt: number;
  endedAt: number | null;
  recap: RecapEvent[];
  /** Who last led by two or more cards, so the recap notes each change of lead once. Older games don't have it. */
  lead?: string | null;
}

/** One foundation as the screens see it. */
export interface FoundationView {
  suit: Suit;
  top: Card;
  count: number;
  /** Whose deck the top card came from. */
  by: string;
}

/** One player's layout as everyone sees it: only face-up cards are named. */
export interface SeatView {
  stock: number;
  /** The waste's visible top cards (up to three when drawing three), top last. */
  waste: Card[];
  wasteCount: number;
  cols: { down: number; up: Card[] }[];
  /** Cards still to get rid of. */
  left: number;
  played: number;
  /** Nothing they can play, even turning through the whole stock. */
  stuck: boolean;
}

export interface SolitaireTableView {
  players: string[];
  draw: 1 | 3;
  seats: Record<string, SeatView>;
  foundations: FoundationView[];
  pulls: number;
  pull: Pull | null;
  last: LastUp | null;
  over: boolean;
  winners: string[];
  blocked: boolean;
  startedAt: number;
}

export interface SolitairePlayerView extends SolitaireTableView {
  me: string;
  movedAt: number;
}

export interface SolitaireReveal {
  left: Record<string, number>;
  played: Record<string, number>;
  blocked: boolean;
  pulls: number;
  ms: number;
}

// ── Pure helpers, shared with the screens and the bot ─────────────────────────

/** A foundation as the helpers need it: its suit and how many cards are on it. */
export interface Spot {
  suit: Suit;
  count: number;
}

/** A layout as the helpers need it: the waste's top card and the columns. */
export interface Layout {
  waste?: Card;
  cols: { down: number | Card[]; up: Card[] }[];
}

const downs = (col: Layout['cols'][number]) =>
  typeof col.down === 'number' ? col.down : col.down.length;

/** The foundation this card goes on: its index, -1 for a new one (an ace), or null. */
export function foundationFor(fs: readonly Spot[], c: Card): number | null {
  const rank = rankOf(c);
  if (rank === 1) return -1;
  const i = fs.findIndex((f) => f.suit === suitOf(c) && f.count === rank - 1);
  return i < 0 ? null : i;
}

export const canGoUp = (fs: readonly Spot[], c: Card) => foundationFor(fs, c) !== null;

/** True if `c` can go on this column: a king on an empty one, else down a rank and across colour. */
export function fits(col: Layout['cols'][number], c: Card): boolean {
  const top = col.up.at(-1);
  if (!top) return downs(col) === 0 && rankOf(c) === 13;
  return stacks(c, top);
}

/**
 * The moves that get somewhere, playable right now: a card up to the middle, the waste's card
 * onto a column, or a run onto another column when that turns a covered card over or frees a
 * card that can go up. Shuffling runs back and forth is left out, so this list runs dry.
 */
export function movesFor(layout: Layout, fs: readonly Spot[]): Move[] {
  const out: Move[] = [];
  const w = layout.waste;
  if (w) {
    if (canGoUp(fs, w)) out.push({ type: 'up', from: 'waste', card: w });
    layout.cols.forEach((col, to) => {
      if (fits(col, w)) out.push({ type: 'move', from: 'waste', card: w, to });
    });
  }
  layout.cols.forEach((col, from) => {
    const top = col.up.at(-1);
    if (!top) return;
    if (canGoUp(fs, top)) out.push({ type: 'up', from, card: top });
    col.up.forEach((card, i) => {
      const turnsOver = i === 0 && downs(col) > 0;
      const frees = i > 0 && canGoUp(fs, col.up[i - 1]!);
      if (!turnsOver && !frees) return;
      layout.cols.forEach((dst, to) => {
        if (to !== from && fits(dst, card)) out.push({ type: 'move', from, card, to });
      });
    });
  });
  return out;
}

/**
 * Every card that comes to the top of the waste as the stock is turned through (and the waste
 * turned back) without playing anything, the current top included. Drawing one, that's all of
 * them; drawing three, some cards never come up.
 */
export function reachable(stock: readonly Card[], waste: readonly Card[], draw: 1 | 3): Card[] {
  let s = [...stock];
  let w = [...waste];
  const total = s.length + w.length;
  const seen = new Set<Card>();
  if (w.length) seen.add(w.at(-1)!);
  // Two full passes show every card that will ever come up.
  const steps = 2 * (Math.ceil(total / draw) + 1);
  for (let i = 0; i < steps && total > 0; i++) {
    if (!s.length) {
      s = w.reverse();
      w = [];
      continue;
    }
    for (let k = 0; k < draw && s.length; k++) w.push(s.pop()!);
    seen.add(w.at(-1)!);
  }
  return [...seen];
}

const layoutOf = (seat: Seat): Layout => ({ waste: seat.waste.at(-1), cols: seat.cols });

/** True if this player has something to play, turning through the stock if need be. */
export function canMove(seat: Seat, fs: readonly Spot[], draw: 1 | 3): boolean {
  if (movesFor(layoutOf(seat), fs).length > 0) return true;
  return reachable(seat.stock, seat.waste, draw).some(
    (c) => canGoUp(fs, c) || seat.cols.some((col) => fits(col, c)),
  );
}

export const cardsLeft = (seat: Seat) =>
  seat.stock.length +
  seat.waste.length +
  seat.cols.reduce((n, c) => n + c.down.length + c.up.length, 0);

const spots = (fs: readonly Foundation[]): Spot[] =>
  fs.map((f) => ({ suit: f.suit, count: f.cards.length }));

// ── Rules ─────────────────────────────────────────────────────────────────────

/** Turn a column's top card over once its face-up run has gone. */
function turnOver(col: Column): Column {
  if (col.up.length > 0 || col.down.length === 0) return col;
  return { down: col.down.slice(0, -1), up: [col.down.at(-1)!] };
}

/** Takes `card` (and anything on it) off `from`, or refuses if it isn't there any more. */
function take(seat: Seat, from: Source, card: Card, single: boolean): { seat: Seat; run: Card[] } {
  const gone = new GameError('moved', 'That card has already moved.');
  if (from === 'waste') {
    if (seat.waste.at(-1) !== card) throw gone;
    return { seat: { ...seat, waste: seat.waste.slice(0, -1) }, run: [card] };
  }
  const col = seat.cols[from]!;
  const i = col.up.indexOf(card);
  if (i < 0) throw gone;
  if (single && i !== col.up.length - 1)
    throw new GameError('covered', 'Only the bottom card of a column can go up.');
  const cols = seat.cols.slice();
  cols[from] = turnOver({ down: col.down, up: col.up.slice(0, i) });
  return { seat: { ...seat, cols }, run: col.up.slice(i) };
}

/** Puts face-up aces from the columns in the middle, as when dealing. */
function acesUp(seat: Seat, id: string, fs: Foundation[]): Seat {
  const cols = seat.cols.slice();
  let played = seat.played;
  cols.forEach((_, i) => {
    let col = cols[i]!;
    while (col.up.length === 1 && rankOf(col.up[0]!) === 1) {
      fs.push({ suit: suitOf(col.up[0]!), cards: [col.up[0]!], by: [id] });
      played++;
      col = turnOver({ down: col.down, up: [] });
    }
    cols[i] = col;
  });
  return { ...seat, cols, played };
}

/** Everyone's cards left, for an event's secret: "{Wren} 12, {Rook} 9". */
const leftLine = (s: SolitaireState) =>
  `Cards left: ${s.players.map((id) => `{${id}} ${cardsLeft(s.seats[id]!)}`).join(', ')}`;

/** Fewest cards left first. */
function leaders(s: SolitaireState): string[] {
  const left = s.players.map((id) => cardsLeft(s.seats[id]!));
  const best = Math.min(...left);
  return s.players.filter((_, i) => left[i] === best);
}

/**
 * After every move: someone with no cards left wins. Otherwise, while nobody can play, everyone
 * pulls a covered card (the top one of their column with most cards face down) onto their waste.
 * When nobody has one left to pull, the game is over and the fewest cards left wins.
 */
function settle(s: SolitaireState, now: number): SolitaireState {
  const out = s.players.find((id) => cardsLeft(s.seats[id]!) === 0);
  if (out) {
    return {
      ...s,
      over: true,
      winners: [out],
      endedAt: now,
      recap: [
        ...s.recap,
        {
          round: s.pulls + 1,
          actor: out,
          text: `{${out}} got rid of every card`,
          secret: leftLine(s),
          tag: 'Out!',
          tone: 'good',
          key: true,
        },
      ],
    };
  }
  let st = s;
  // Each pull turns a covered card over, and there are 21 per player.
  for (let guard = 0; guard < 30; guard++) {
    const fs = spots(st.foundations);
    if (st.players.some((id) => canMove(st.seats[id]!, fs, st.draw))) return st;
    const seats = { ...st.seats };
    const cards: Record<string, Card | null> = {};
    for (const id of st.players) {
      const seat = seats[id]!;
      let best = -1;
      seat.cols.forEach((c, i) => {
        if (c.down.length > 0 && (best < 0 || c.down.length > seat.cols[best]!.down.length))
          best = i;
      });
      if (best < 0) {
        cards[id] = null;
        continue;
      }
      const col = seat.cols[best]!;
      const card = col.down.at(-1)!;
      const cols = seat.cols.slice();
      cols[best] = turnOver({ down: col.down.slice(0, -1), up: col.up });
      seats[id] = { ...seat, cols, waste: [...seat.waste, card] };
      cards[id] = card;
    }
    if (Object.values(cards).every((c) => c === null)) {
      const winners = leaders(st);
      return {
        ...st,
        over: true,
        blocked: true,
        winners,
        endedAt: now,
        recap: [
          ...st.recap,
          {
            round: st.pulls + 1,
            text: 'Nobody could play and nobody had a covered card left',
            secret: `${leftLine(st)}. Fewest left: ${winners.map((id) => `{${id}}`).join(', ')}`,
            tag: 'Blocked',
            key: true,
          },
        ],
      };
    }
    const n = st.pulls + 1;
    st = {
      ...st,
      seats,
      pulls: n,
      pull: { n, cards },
      recap: [
        ...st.recap,
        {
          round: n,
          text: 'Everyone was stuck, so everyone pulled a covered card',
          secret: st.players
            .map(
              (id) => `{${id}} pulled ${cards[id] ? cardShort(cards[id]!) : 'nothing (none left)'}`,
            )
            .join(', '),
          tag: 'Stuck',
          key: n === 1,
          data: { cards },
        },
      ],
    };
  }
  return st;
}

export function setup(
  playerIds: string[],
  draw: 1 | 3,
  shuffle: (d: Card[]) => Card[],
  now: number,
) {
  const foundations: Foundation[] = [];
  const seats: Record<string, Seat> = {};
  for (const id of playerIds) {
    const deck = shuffle(DECK);
    const cols: Column[] = [];
    let k = 0;
    for (let i = 0; i < 7; i++) {
      cols.push({ down: deck.slice(k, k + i), up: [deck[k + i]!] });
      k += i + 1;
    }
    const seat: Seat = { stock: deck.slice(k), waste: [], cols, played: 0, movedAt: now };
    seats[id] = acesUp(seat, id, foundations);
  }
  const s: SolitaireState = {
    players: playerIds,
    draw,
    seats,
    foundations,
    pulls: 0,
    pull: null,
    ups: 0,
    last: null,
    over: false,
    winners: [],
    blocked: false,
    startedAt: now,
    endedAt: null,
    recap: [{ text: 'Every deck dealt, and the uncovered aces put in the middle' }],
  };
  return settle(s, now);
}

function apply(s: SolitaireState, id: string, a: SolitaireAction, now: number): SolitaireState {
  if (s.over) throw new GameError('over', 'The game is over.');
  const seat0 = s.seats[id];
  if (!seat0) throw new GameError('not_playing', 'You aren’t playing this one.');
  let seat: Seat = { ...seat0, movedAt: now };
  let foundations = s.foundations;
  let last = s.last;
  let ups = s.ups;
  const notes: RecapEvent[] = [];

  if (a.type === 'draw') {
    if (seat.stock.length === 0) {
      if (seat.waste.length === 0) throw new GameError('empty', 'There’s nothing left to turn.');
      seat = { ...seat, stock: seat.waste.slice().reverse(), waste: [] };
    } else {
      const n = Math.min(s.draw, seat.stock.length);
      const turned = seat.stock.slice(-n).reverse();
      seat = { ...seat, stock: seat.stock.slice(0, -n), waste: [...seat.waste, ...turned] };
    }
  } else if (a.type === 'up') {
    const pile = foundationFor(spots(foundations), a.card);
    if (pile === null) {
      // Usually a race: someone else's card of the same rank landed first.
      const beaten = foundations.some(
        (f) => f.suit === suitOf(a.card) && f.cards.length >= rankOf(a.card),
      );
      throw new GameError(
        'no_room',
        beaten ? 'Someone got there first.' : 'That card can’t go up yet.',
      );
    }
    const taken = take(seat, a.from, a.card, true);
    seat = { ...taken.seat, played: seat.played + 1 };
    foundations = foundations.slice();
    let at = pile;
    if (pile < 0) {
      at = foundations.length;
      foundations.push({ suit: suitOf(a.card), cards: [a.card], by: [id] });
    } else {
      const f = foundations[pile]!;
      foundations[pile] = { ...f, cards: [...f.cards, a.card], by: [...f.by, id] };
    }
    ups++;
    last = { n: ups, by: id, card: a.card, pile: at };
    const rank = rankOf(a.card);
    if (rank === 1 || rank === 13) {
      const after = { ...s, seats: { ...s.seats, [id]: seat } };
      notes.push({
        round: s.pulls + 1,
        actor: id,
        text:
          rank === 1
            ? `{${id}} put the ${cardShort(a.card)} up and started a pile.`
            : `{${id}} put the ${cardShort(a.card)} up and finished a pile.`,
        secret: leftLine(after),
        tag: rank === 1 ? 'Ace' : 'Pile done',
        tone: 'good',
        key: rank === 13,
      });
    }
  } else {
    if (a.from === a.to) throw new GameError('same', 'It’s already there.');
    if (!fits(seat.cols[a.to]!, a.card)) throw new GameError('no_fit', 'It doesn’t go there.');
    const taken = take(seat, a.from, a.card, false);
    seat = taken.seat;
    const cols = seat.cols.slice();
    const dst = cols[a.to]!;
    cols[a.to] = { ...dst, up: [...dst.up, ...taken.run] };
    seat = { ...seat, cols };
  }

  const next: SolitaireState = { ...s, seats: { ...s.seats, [id]: seat }, foundations, ups, last };
  // A change of lead, once someone is two cards clear of everyone else.
  const left = s.players.map((p) => cardsLeft(next.seats[p]!)).sort((x, y) => x - y);
  const front = leaders(next);
  let lead = s.lead;
  if (front.length === 1 && front[0] !== lead && left[0]! > 0 && left[1]! - left[0]! >= 2) {
    lead = front[0]!;
    notes.push({
      round: s.pulls + 1,
      actor: lead,
      text: `{${lead}} took the lead with ${left[0]} cards left.`,
      secret: leftLine(next),
      tag: 'Lead',
      tone: 'good',
    });
  }
  return settle({ ...next, lead, recap: [...s.recap, ...notes] }, now);
}

// ── Views ─────────────────────────────────────────────────────────────────────

export function tableView(s: SolitaireState): SolitaireTableView {
  const fs = spots(s.foundations);
  const seats: Record<string, SeatView> = {};
  for (const id of s.players) {
    const seat = s.seats[id]!;
    seats[id] = {
      stock: seat.stock.length,
      waste: seat.waste.slice(-s.draw),
      wasteCount: seat.waste.length,
      cols: seat.cols.map((c) => ({ down: c.down.length, up: c.up })),
      left: cardsLeft(seat),
      played: seat.played,
      stuck: !s.over && !canMove(seat, fs, s.draw),
    };
  }
  return {
    players: s.players,
    draw: s.draw,
    seats,
    foundations: s.foundations.map((f) => ({
      suit: f.suit,
      top: f.cards.at(-1)!,
      count: f.cards.length,
      by: f.by.at(-1)!,
    })),
    pulls: s.pulls,
    pull: s.pull,
    last: s.last,
    over: s.over,
    winners: s.winners,
    blocked: s.blocked,
    startedAt: s.startedAt,
  };
}

/** A seat's view as a layout for `movesFor`. */
export const viewLayout = (seat: SeatView): Layout => ({
  waste: seat.waste.at(-1),
  cols: seat.cols,
});

function resultOf(s: SolitaireState, early: boolean): GameResult | null {
  const winners = s.over ? s.winners : leaders(s);
  if (early && winners.length === s.players.length && s.players.length > 1) return null;
  const left = Object.fromEntries(s.players.map((id) => [id, cardsLeft(s.seats[id]!)]));
  const played = Object.fromEntries(s.players.map((id) => [id, s.seats[id]!.played]));
  const tie = winners.length > 1;
  const standings: Standing[] = s.players.map((id) => ({
    playerId: id,
    outcome: winners.includes(id) ? (tie ? 'draw' : 'win') : 'loss',
  }));
  const n = left[winners[0]!]!;
  const cards = `${n} ${n === 1 ? 'card' : 'cards'}`;
  const summary =
    s.over && !s.blocked
      ? `{${winners[0]}} got rid of every card.`
      : tie
        ? `A tie on ${cards} left.`
        : `{${winners[0]}} had the fewest left: ${cards}.`;
  const reveal: SolitaireReveal = {
    left,
    played,
    blocked: s.blocked,
    pulls: s.pulls,
    ms: (s.endedAt ?? s.startedAt) - s.startedAt,
  };
  // Winners first, then fewest cards left.
  const order = [...s.players].sort(
    (x, y) => Number(winners.includes(y)) - Number(winners.includes(x)) || left[x]! - left[y]!,
  );
  const stats: RecapStats = {
    columns: ['Cards left', 'Cards played'],
    rows: order.map((id) => ({ playerId: id, values: [left[id]!, played[id]!] })),
  };
  return { winners, summary, reveal, recap: s.recap, standings, roundName: 'Stretch', stats };
}

// ── Bot ───────────────────────────────────────────────────────────────────────

/** How long a bot takes over each move, in ms, by level; turning the stock goes quicker. */
export const BOT_PACE: Record<BotLevel, number> = { easy: 3200, normal: 2200, hard: 1400 };

function botScore(m: Move, v: SolitairePlayerView): number {
  if (m.type === 'up') return 100 - rankOf(m.card);
  if (m.from === 'waste') return 30;
  const col = v.seats[v.me]!.cols[m.from]!;
  // Turning a covered card over matters most where most are covered.
  return col.up[0] === m.card ? 50 + col.down : 40;
}

// ── Module ────────────────────────────────────────────────────────────────────

export const solitaire: GameModule<
  SolitaireState,
  SolitaireAction,
  SolitairePlayerView,
  SolitaireTableView,
  SolitaireOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({ draw: 'Draw one' }),

  setup: ({ playerIds, options, rng, now }) =>
    setup(playerIds, options.draw === 'Draw three' ? 3 : 1, (d) => rng.shuffle(d), now),

  getPlayerView: (s, id) => ({
    ...tableView(s),
    me: id,
    movedAt: s.seats[id]?.movedAt ?? s.startedAt,
  }),
  getTableView: tableView,

  applyAction: (s, id, a, _rng, now) => apply(s, id, a, now),

  getResult: (s) => (s.over ? resultOf(s, false) : null),
  partialResult: (s) => resultOf(s, !s.over),

  // While someone is stuck, the game is waiting on the players who aren't.
  waitingOn(s) {
    if (s.over) return [];
    const t = tableView(s);
    const stuck = s.players.filter((id) => t.seats[id]!.stuck);
    return stuck.length === 0 ? [] : s.players.filter((id) => !t.seats[id]!.stuck);
  },

  announce(prev, next) {
    if (!prev) {
      const aces = next.foundations.length;
      return [
        `Every deck is dealt${aces ? ` and ${aces} ${aces === 1 ? 'ace is' : 'aces are'} in the middle` : ''}. Go!`,
      ];
    }
    const lines: Announcement[] = [];
    if (next.pulls > prev.pulls) {
      const times = next.pulls - prev.pulls;
      lines.push(
        times === 1
          ? 'Everyone was stuck, so everyone pulled a covered card.'
          : `Everyone was stuck, so everyone pulled ${times} covered cards.`,
      );
    }
    if (next.over && !prev.over) {
      lines.push(
        next.blocked
          ? 'Nobody can play and there’s nothing left to pull.'
          : `{${next.winners[0]}} got rid of every card!`,
      );
    } else if (next.last && next.last.n !== prev.last?.n && rankOf(next.last.card) === 13) {
      lines.push(`{${next.last.by}} put the ${cardShort(next.last.card)} up.`);
    }
    return lines;
  },

  // Short, so the runtime asks often; each bot keeps its own pace by `movedAt`.
  botDelayMs: 300,
  bot({ view, now, level, rng }) {
    if (view.over) return null;
    const seat = view.seats[view.me];
    if (!seat || seat.stuck) return null;
    const pace = BOT_PACE[level];
    const moves = movesFor(viewLayout(seat), view.foundations);
    if (moves.length === 0) {
      return now >= view.movedAt + pace * 0.5 ? { type: 'draw' } : null;
    }
    if (now < view.movedAt + pace) return null;
    // A slip: turn the stock instead of seeing the move.
    if (seat.stock + seat.wasteCount > 1 && botSlips(level, rng, 0.5)) return { type: 'draw' };
    return botChoose(moves, (m) => botScore(m, view), level, rng);
  },
};
