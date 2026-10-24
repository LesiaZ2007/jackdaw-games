import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  FULL_DECK,
  cardName,
  cardOf,
  isNumber,
  isWild,
  matches,
  points,
  sortHand,
  type Colour,
} from './cards';
import { meta } from './meta';
import { unoBot } from './bot';

/**
 * UNO for 2–10 players, by the official rules. Everyone gets seven cards and one is turned
 * up. In turn, play a card that matches the top of the pile by colour, number or symbol, or a
 * wild, which calls the colour; otherwise draw. Skip misses the next player, Reverse turns play
 * round (and is a Skip with two players), Draw Two makes the next player take two and miss their
 * go. A Wild Draw Four is only fair when you hold nothing in the colour in play: the next player
 * takes four, or challenges it. A bluff caught means the bluffer takes the four; a fair one
 * challenged costs the challenger six.
 *
 * Down to one card, call "UNO!". Anyone who catches you before the next player moves makes
 * you take two. The first to empty their hand wins the round and scores everyone else's cards
 * (numbers at face value, action cards 20, wilds 50). The game is one round or first to a target.
 *
 * House rules on offer: draw until you can play (instead of drawing one), and stacking, where a
 * Draw Two can be passed on with another Draw Two or a Wild Draw Four, and a Wild Draw Four with
 * another, so the next player takes the lot.
 */

const LENGTHS = ['One round', 'To 200 points', 'To 500 points'] as const;
const DRAWS = ['Draw one', 'Draw until you can play'] as const;
const STACKING = ['No', 'Yes'] as const;
const CLOCKS = ['Off', '30 seconds', '60 seconds'] as const;

/** Cards dealt to each player. */
export const HAND_SIZE = 7;
/** Cards for not calling "UNO!" in time. */
export const CAUGHT_DRAW = 2;
/** Time between a round ending and the next deal, to see who went out and the scores. */
export const NEXT_ROUND_MS = 8_000;
/** Moves kept for the screens (the newest last). */
const MOVES_KEPT = 12;

export const optionsSchema = z.object({
  length: z.enum(LENGTHS).describe('Game length'),
  drawing: z.enum(DRAWS).describe('Drawing'),
  stacking: z.enum(STACKING).describe('Stack draw cards'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
});
export type UnoOptions = z.infer<typeof optionsSchema>;

const colourSchema = z.enum(['r', 'y', 'g', 'b']);

export const actionSchema = z.discriminatedUnion('type', [
  /** Play a card; a wild names its colour. `call` says "UNO!" as it goes down. */
  z.object({
    type: z.literal('play'),
    card: z.number().int().min(0).max(107),
    colour: colourSchema.optional(),
    call: z.boolean().optional(),
  }),
  /** Draw (or, with a Draw Two or Four waiting on you, take the cards). */
  z.object({ type: z.literal('draw') }),
  /** Keep the card you just drew and end your turn. */
  z.object({ type: z.literal('pass') }),
  /** Challenge the Wild Draw Four played on you. */
  z.object({ type: z.literal('challenge') }),
  /** Say "UNO!" with one card left, before anyone catches you. */
  z.object({ type: z.literal('call') }),
  /** Catch whoever is down to one card without calling it: they take two. */
  z.object({ type: z.literal('catch') }),
  /** Between rounds: deal the next one now (the server deals by itself after NEXT_ROUND_MS). */
  z.object({ type: z.literal('deal'), after: z.number().int().nonnegative().optional() }),
]);
export type UnoAction = z.infer<typeof actionSchema>;

export type Phase = 'play' | 'done' | 'over';

/** One public line of play, for the screens to show and animate. */
export interface Move {
  /** Counts up through the game, so screens can tell new moves from old. */
  seq: number;
  player: string;
  kind: 'play' | 'draw' | 'take' | 'pass' | 'challenge' | 'call' | 'catch';
  /** The card played. */
  card?: number;
  /** The colour a wild called. */
  colour?: Colour;
  /** Cards drawn or taken. */
  count?: number;
  /** Who it hit: the player skipped or made to draw, the player caught. */
  target?: string;
  /** A challenge: true when the Wild Draw Four was a bluff (the challenger was right). */
  ok?: boolean;
  /** Out of time: the server moved for them. */
  late?: boolean;
}

/** A Draw Two or Wild Draw Four waiting on the player to act. */
export interface Pending {
  /** Cards to take (stacked draws add up). */
  count: number;
  /** Who played the last draw card. */
  from: string;
  /** The last one was a Wild Draw Four, so it can be challenged. */
  wild4: boolean;
  /** For a Wild Draw Four: the colour in play when it went down (a bluff means holding it). */
  was?: Colour;
}

/** How the last round ended, public once it's over. */
export interface RoundResult {
  round: number;
  winner: string;
  /** What the winner scored: everyone else's cards. */
  points: number;
  /** The cards left in every other hand, shown once the round is over. */
  left: Record<string, number[]>;
}

export interface UnoState {
  players: string[];
  /** Points to win, 0 for a single round. */
  target: number;
  drawUntil: boolean;
  stacking: boolean;
  turnSecs: number;
  round: number;
  phase: Phase;
  dealer: string;
  /** Secret: everyone's cards. */
  hands: Record<string, number[]>;
  /** Secret: the draw pile, next card first. */
  deck: number[];
  /** The discard pile, top card last. */
  discard: number[];
  /** The colour in play (a wild's called colour, otherwise the top card's). */
  colour: Colour;
  /** 1 goes up the seat order, -1 back down it. */
  dir: 1 | -1;
  toAct: string | null;
  pending:
    | (Pending & {
        /** Secret: the Wild Draw Four was played holding the colour. */ bluff: boolean;
      })
    | null;
  /** Secret: the card the player to act just drew and may play now. */
  drawn: number | null;
  /** Down to one card without calling it, until the next player moves. */
  uncalled: string | null;
  /** Down to one card and called it. */
  called: string[];
  scores: Record<string, number>;
  seq: number;
  moves: Move[];
  last: RoundResult | null;
  recap: RecapEvent[];
  /** When the next round deals itself (server time), between rounds. */
  dealAt: number | null;
  /** When the player to act runs out of time (server time), with a turn timer. */
  actBy: number | null;
  /** The best single round so far, for the night's awards. */
  biggest?: { player: string; points: number; round: number };
}

/** Everything public: the TV and every phone render this. */
export interface UnoTableView {
  players: string[];
  /** Cards in each hand. */
  counts: Record<string, number>;
  /** The top of the discard pile. */
  top: number | null;
  discardCount: number;
  deckCount: number;
  colour: Colour;
  dir: 1 | -1;
  round: number;
  target: number;
  phase: Phase;
  dealer: string;
  toAct: string | null;
  pending: Pending | null;
  /** The player to act drew a card they could play, and is deciding whether to. */
  deciding: boolean;
  uncalled: string | null;
  called: string[];
  scores: Record<string, number>;
  moves: Move[];
  last: RoundResult | null;
  dealAt: number | null;
  actBy: number | null;
  drawUntil: boolean;
  stacking: boolean;
}

export interface UnoPlayerView extends UnoTableView {
  me: string;
  /** Your cards, sorted by colour and face. */
  hand: number[];
  /** The card you just drew, if you may play it now. */
  drawn: number | null;
}

export interface UnoReveal {
  /** Highest score first. */
  players: string[];
  scores: Record<string, number>;
  rounds: number;
  target: number;
  last: RoundResult | null;
}

function parseOptions(o: UnoOptions) {
  return {
    target: o.length === 'One round' ? 0 : Number(o.length.split(' ')[1]),
    drawUntil: o.drawing === 'Draw until you can play',
    stacking: o.stacking === 'Yes',
    turnSecs: o.turnTimer === 'Off' ? 0 : Number(o.turnTimer.split(' ')[0]),
  };
}

/** The seat `steps` places on from `from`, in the direction of play. */
function seatFrom(s: UnoState, from: string, steps = 1): string {
  const n = s.players.length;
  const i = s.players.indexOf(from);
  return s.players[(((i + s.dir * steps) % n) + n) % n]!;
}

/** Can this card go down now? With a draw waiting, only a stack (if allowed) can. */
function canPlay(
  s: { pending: Pending | null; stacking: boolean; colour: Colour },
  top: number | null,
  id: number,
) {
  if (s.pending) {
    if (!s.stacking) return false;
    const face = cardOf(id).face;
    return face === 'wild4' || (face === 'draw2' && !s.pending.wild4);
  }
  return top === null || matches(id, top, s.colour);
}

/** Take `n` cards off the draw pile, shuffling the discards back in when it runs out. */
function take(s: UnoState, id: string, n: number, rng: Rng): { s: UnoState; got: number[] } {
  let deck = s.deck;
  let discard = s.discard;
  const got: number[] = [];
  for (let k = 0; k < n; k++) {
    if (deck.length === 0 && discard.length > 1) {
      deck = rng.shuffle(discard.slice(0, -1));
      discard = discard.slice(-1);
    }
    if (deck.length === 0) break;
    got.push(deck[0]!);
    deck = deck.slice(1);
  }
  return {
    s: { ...s, deck, discard, hands: { ...s.hands, [id]: [...(s.hands[id] ?? []), ...got] } },
    got,
  };
}

/** Record a public move. */
function log(s: UnoState, m: Omit<Move, 'seq'>): UnoState {
  const seq = s.seq + 1;
  return { ...s, seq, moves: [...s.moves, { ...m, seq }].slice(-MOVES_KEPT) };
}

/** Keep the calls honest: only someone holding exactly one card can have called or be uncalled. */
function tidyCalls(s: UnoState): UnoState {
  const one = (id: string) => (s.hands[id]?.length ?? 0) === 1;
  const called = s.called.filter(one);
  const uncalled = s.uncalled && one(s.uncalled) ? s.uncalled : null;
  return called.length === s.called.length && uncalled === s.uncalled
    ? s
    : { ...s, called, uncalled };
}

/** Deal a new round, or end the game once someone has reached the target. */
function startRound(s: UnoState, rng: Rng): UnoState {
  const top = Math.max(0, ...Object.values(s.scores));
  if (s.round > 0 && (s.target === 0 || top >= s.target)) {
    return { ...s, phase: 'over', toAct: null };
  }
  const round = s.round + 1;
  // The deal moves one seat on each round.
  const dealer =
    round === 1 ? s.dealer : s.players[(s.players.indexOf(s.dealer) + 1) % s.players.length]!;
  let deck = rng.shuffle(FULL_DECK);
  const hands: Record<string, number[]> = {};
  for (const id of s.players) {
    hands[id] = deck.slice(0, HAND_SIZE);
    deck = deck.slice(HAND_SIZE);
  }
  // Turn up the first number card, so the round opens on a plain colour.
  const first = deck.findIndex(isNumber);
  const up = deck[first]!;
  deck = [...deck.slice(0, first), ...deck.slice(first + 1)];
  const next: UnoState = {
    ...s,
    round,
    phase: 'play',
    dealer,
    hands,
    deck,
    discard: [up],
    colour: cardOf(up).colour!,
    dir: 1,
    toAct: null,
    pending: null,
    drawn: null,
    uncalled: null,
    called: [],
    moves: [],
  };
  return { ...next, toAct: seatFrom(next, dealer) };
}

/** Someone went out: they score everyone else's cards. */
function finishRound(s: UnoState, winner: string): UnoState {
  const others = s.players.filter((id) => id !== winner);
  const left = Object.fromEntries(others.map((id) => [id, sortHand(s.hands[id] ?? [])]));
  const scored = others.reduce(
    (sum, id) => sum + (s.hands[id] ?? []).reduce((a, c) => a + points(c), 0),
    0,
  );
  const scores = { ...s.scores, [winner]: (s.scores[winner] ?? 0) + scored };
  const biggest =
    scored > (s.biggest?.points ?? 0)
      ? { player: winner, points: scored, round: s.round }
      : s.biggest;
  return {
    ...s,
    phase: 'done',
    toAct: null,
    pending: null,
    drawn: null,
    uncalled: null,
    called: [],
    scores,
    biggest,
    last: { round: s.round, winner, points: scored, left },
    recap: [
      ...s.recap,
      {
        round: s.round,
        actor: winner,
        text: `Round ${s.round}: {${winner}} went out and scored ${scored}.`,
        data: { left, scores },
      },
    ],
  };
}

/** Play a card from your hand. */
function play(
  s: UnoState,
  me: string,
  a: Extract<UnoAction, { type: 'play' }>,
  rng: Rng,
): UnoState {
  const hand = s.hands[me] ?? [];
  if (!hand.includes(a.card)) throw new GameError('no_card', 'That card isn’t in your hand.');
  if (s.drawn !== null && a.card !== s.drawn)
    throw new GameError('drawn_only', 'You can only play the card you drew, or keep it.');
  const top = s.discard[s.discard.length - 1] ?? null;
  if (!canPlay(s, top, a.card)) {
    throw s.pending
      ? new GameError(
          'must_take',
          s.stacking
            ? `Take ${s.pending.count}, or pass it on with a draw card.`
            : `Take ${s.pending.count} first.`,
        )
      : new GameError(
          'no_match',
          `That doesn’t go on ${top === null ? 'the pile' : cardName(top)}.`,
        );
  }
  const c = cardOf(a.card);
  if (isWild(a.card) && !a.colour) throw new GameError('no_colour', 'Choose a colour.');
  const colour = c.colour ?? a.colour!;
  // A Wild Draw Four is a bluff when you held anything in the colour in play.
  const bluff =
    c.face === 'wild4' && hand.some((id) => id !== a.card && cardOf(id).colour === s.colour);
  const rest = hand.filter((id) => id !== a.card);
  let next: UnoState = {
    ...s,
    hands: { ...s.hands, [me]: rest },
    discard: [...s.discard, a.card],
    colour,
    drawn: null,
    uncalled: rest.length === 1 && !a.call ? me : null,
    called: rest.length === 1 && a.call ? [...s.called, me] : s.called,
  };
  if (c.face === 'rev') next = { ...next, dir: next.dir === 1 ? -1 : 1 };
  const victim = seatFrom(next, me);
  const two = s.players.length === 2;
  const played: Omit<Move, 'seq'> = {
    player: me,
    kind: 'play',
    card: a.card,
    colour: isWild(a.card) ? colour : undefined,
  };

  switch (c.face) {
    case 'skip':
      next = log(next, { ...played, target: victim });
      next = { ...next, toAct: seatFrom(next, me, 2) };
      break;
    case 'rev':
      next = log(next, { ...played, target: two ? victim : undefined });
      // With two players a Reverse is a Skip: it's your go again.
      next = { ...next, toAct: two ? me : victim };
      break;
    case 'draw2':
      next = log(next, { ...played, target: victim });
      if (s.stacking) {
        next = {
          ...next,
          pending: { count: (s.pending?.count ?? 0) + 2, from: me, wild4: false, bluff: false },
          toAct: victim,
        };
      } else {
        const t = take(next, victim, 2, rng);
        next = log(t.s, { player: victim, kind: 'take', count: t.got.length });
        next = { ...next, toAct: seatFrom(next, victim) };
      }
      break;
    case 'wild4':
      next = log(next, { ...played, target: victim });
      next = {
        ...next,
        pending: {
          count: (s.pending?.count ?? 0) + 4,
          from: me,
          wild4: true,
          was: s.colour,
          bluff,
        },
        toAct: victim,
      };
      break;
    default:
      next = log(next, played);
      next = { ...next, toAct: victim };
  }

  if (rest.length === 0) {
    // Going out on a draw card still makes the next player draw, for the points.
    if (next.pending) {
      const t = take(next, victim, next.pending.count, rng);
      next = log({ ...t.s, pending: null }, { player: victim, kind: 'take', count: t.got.length });
    }
    return finishRound(next, me);
  }
  return next;
}

/** One player's move, before the clocks are set (see `stamp`). */
function move(s: UnoState, me: string, action: UnoAction, rng: Rng, late = false): UnoState {
  if (!s.players.includes(me)) throw new GameError('not_playing', 'You’re not in this game.');
  if (action.type === 'deal') {
    if (action.after !== undefined && (action.after !== s.round || s.phase !== 'done')) return s;
    if (s.phase !== 'done') throw new GameError('not_yet', 'This round isn’t over yet.');
    return startRound(s, rng);
  }
  if (s.phase !== 'play') throw new GameError('no_round', 'There’s no round being played.');

  if (action.type === 'call') {
    if ((s.hands[me]?.length ?? 0) !== 1 || s.called.includes(me))
      throw new GameError('no_call', 'You can call it when you’re down to one card.');
    return log({ ...s, called: [...s.called, me], uncalled: null }, { player: me, kind: 'call' });
  }
  if (action.type === 'catch') {
    const caught = s.uncalled;
    if (!caught) throw new GameError('nobody', 'Nobody’s down to one card without calling it.');
    if (caught === me) throw new GameError('own', 'Call it yourself instead.');
    const t = take(s, caught, CAUGHT_DRAW, rng);
    return tidyCalls(
      log(
        { ...t.s, uncalled: null },
        { player: me, kind: 'catch', target: caught, count: t.got.length },
      ),
    );
  }

  if (s.toAct !== me) throw new GameError('not_your_turn', 'It’s not your turn.');
  // Your move closes the window to catch whoever went down to one card before you.
  const cur: UnoState = { ...s, uncalled: null };
  const next = (() => {
    switch (action.type) {
      case 'play':
        return play(cur, me, action, rng);
      case 'draw': {
        if (cur.drawn !== null) throw new GameError('drew', 'Play the card you drew, or keep it.');
        if (cur.pending) {
          const t = take(cur, me, cur.pending.count, rng);
          const n = log(
            { ...t.s, pending: null },
            { player: me, kind: 'take', count: t.got.length, late },
          );
          return { ...n, toAct: seatFrom(n, me) };
        }
        let n = cur;
        const got: number[] = [];
        const top = cur.discard[cur.discard.length - 1] ?? null;
        // Draw one, or keep drawing until a card will go, as the table chose (or both piles run out).
        for (;;) {
          const t = take(n, me, 1, rng);
          n = t.s;
          if (t.got.length === 0) break;
          got.push(t.got[0]!);
          if (!cur.drawUntil || canPlay(n, top, t.got[0]!)) break;
        }
        n = log(n, { player: me, kind: 'draw', count: got.length, late });
        const lastDrawn = got[got.length - 1];
        if (lastDrawn !== undefined && canPlay(n, top, lastDrawn))
          return { ...n, drawn: lastDrawn };
        return { ...n, toAct: seatFrom(n, me) };
      }
      case 'pass': {
        if (cur.drawn === null)
          throw new GameError(
            'no_pass',
            'Play a card or draw. You can keep a card you’ve just drawn.',
          );
        const n = log({ ...cur, drawn: null }, { player: me, kind: 'pass', late });
        return { ...n, toAct: seatFrom(n, me) };
      }
      case 'challenge': {
        const p = cur.pending;
        if (!p?.wild4)
          throw new GameError('no_challenge', 'There’s no Wild Draw Four to challenge.');
        if (p.bluff) {
          // Caught bluffing: the bluffer takes the cards, and you play on as normal.
          const t = take(cur, p.from, p.count, rng);
          return log(
            { ...t.s, pending: null },
            { player: me, kind: 'challenge', target: p.from, ok: true, count: t.got.length },
          );
        }
        const t = take(cur, me, p.count + 2, rng);
        const n = log(
          { ...t.s, pending: null },
          { player: me, kind: 'challenge', target: p.from, ok: false, count: t.got.length },
        );
        return { ...n, toAct: seatFrom(n, me) };
      }
    }
  })();
  return tidyCalls(next);
}

/**
 * Sets the clocks after a change: when a round has just ended the next deals itself in a few
 * seconds, and whenever play moves on the turn timer starts again. `turned` says the change was
 * a turn being taken (even one that comes straight back, like a Skip with two players or a
 * caught bluff), not a call or a catch from across the table.
 */
function stamp(prev: UnoState | null, s: UnoState, now: number, turned = false): UnoState {
  if (s === prev) return s;
  const ended = s.phase === 'done' && (prev?.phase !== 'done' || prev.round !== s.round);
  const dealAt = s.phase === 'done' ? (ended ? now + NEXT_ROUND_MS : s.dealAt) : null;
  const moved =
    !prev || turned || s.toAct !== prev.toAct || s.drawn !== prev.drawn || s.round !== prev.round;
  const actBy = s.toAct && s.turnSecs ? (moved ? now + s.turnSecs * 1000 : s.actBy) : null;
  return { ...s, dealAt, actBy };
}

function view(s: UnoState): UnoTableView {
  return {
    players: s.players,
    counts: Object.fromEntries(s.players.map((id) => [id, s.hands[id]?.length ?? 0])),
    top: s.discard[s.discard.length - 1] ?? null,
    discardCount: s.discard.length,
    deckCount: s.deck.length,
    colour: s.colour,
    dir: s.dir,
    round: s.round,
    target: s.target,
    phase: s.phase,
    dealer: s.dealer,
    toAct: s.toAct,
    pending: s.pending
      ? { count: s.pending.count, from: s.pending.from, wild4: s.pending.wild4, was: s.pending.was }
      : null,
    deciding: s.drawn !== null,
    uncalled: s.uncalled,
    called: s.called,
    scores: s.scores,
    moves: s.moves,
    last: s.last,
    dealAt: s.dealAt,
    actBy: s.actBy,
    drawUntil: s.drawUntil,
    stacking: s.stacking,
  };
}

/** The cards you could play right now (none when it isn't your turn). */
export function playable(v: UnoPlayerView): number[] {
  if (v.phase !== 'play' || v.toAct !== v.me) return [];
  if (v.drawn !== null) return [v.drawn];
  return v.hand.filter((id) => canPlay(v, v.top, id));
}

/** True once the round just played was the last. */
export function lastRoundPlayed(t: Pick<UnoTableView, 'target' | 'scores'>): boolean {
  return t.target === 0 || Math.max(0, ...Object.values(t.scores)) >= t.target;
}

/**
 * The result if the host ended the game now (Lesia, 2026-10-24: "End Game still saves progress
 * of any rounds"). Playing to a target, the points leader after the rounds finished so far wins
 * (null before the first round ends). A single round in progress goes to whoever holds the fewest
 * cards (null before anyone has moved). Ties share the win.
 */
export function partialResult(s: UnoState): GameResult | null {
  if (s.phase === 'over') return uno.getResult(s);
  if (s.phase === 'done' && lastRoundPlayed(s)) return uno.getResult({ ...s, phase: 'over' });
  const ranked = (score: (id: string) => number) =>
    [...s.players].sort((a, b) => score(b) - score(a));
  const reveal = (rounds: number): UnoReveal => ({
    players: ranked((id) => s.scores[id] ?? 0),
    scores: s.scores,
    rounds,
    target: s.target,
    last: s.last,
  });
  const result = (
    winners: string[],
    summary: string,
    role: (id: string) => string,
    rounds: number,
  ) => ({
    winners,
    summary,
    reveal: reveal(rounds),
    recap: s.recap,
    highlights: s.biggest
      ? [
          {
            award: 'Biggest round',
            playerIds: [s.biggest.player],
            text: `${s.biggest.points} points in round ${s.biggest.round}`,
            value: s.biggest.points,
          },
        ]
      : [],
    standings: s.players.map((id) => ({
      playerId: id,
      outcome: winners.includes(id)
        ? winners.length > 1
          ? ('draw' as const)
          : ('win' as const)
        : ('loss' as const),
      role: role(id),
    })),
  });

  if (s.target === 0) {
    if (s.seq === 0) return null;
    const left = (id: string) => s.hands[id]?.length ?? 0;
    const fewest = Math.min(...s.players.map(left));
    const winners = s.players.filter((id) => left(id) === fewest);
    const cards = `${fewest} ${fewest === 1 ? 'card' : 'cards'}`;
    return result(
      winners,
      winners.length > 1
        ? `${winners.length} players tied on ${cards} left`
        : `Fewest cards left: ${cards}`,
      (id) => `${left(id)} ${left(id) === 1 ? 'card' : 'cards'} left`,
      0,
    );
  }

  if (!s.last) return null;
  const rounds = s.phase === 'done' ? s.round : s.round - 1;
  const top = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const winners = s.players.filter((id) => (s.scores[id] ?? 0) === top);
  const after = `after ${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  return result(
    winners,
    winners.length > 1
      ? `${winners.length} players tied on ${top} points ${after}`
      : `Led with ${top} points ${after}`,
    (id) => `${s.scores[id] ?? 0} points`,
    rounds,
  );
}

export const uno: GameModule<UnoState, UnoAction, UnoPlayerView, UnoTableView, UnoOptions> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({
    length: 'To 200 points',
    drawing: 'Draw one',
    stacking: 'No',
    turnTimer: 'Off',
  }),

  setup({ playerIds, options, rng, now }) {
    const o = parseOptions(options);
    const base: UnoState = {
      players: playerIds,
      target: o.target,
      drawUntil: o.drawUntil,
      stacking: o.stacking,
      turnSecs: o.turnSecs,
      round: 0,
      phase: 'done',
      dealer: rng.pick(playerIds),
      hands: {},
      deck: [],
      discard: [],
      colour: 'r',
      dir: 1,
      toAct: null,
      pending: null,
      drawn: null,
      uncalled: null,
      called: [],
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      seq: 0,
      moves: [],
      last: null,
      recap: [],
      dealAt: null,
      actBy: null,
    };
    return stamp(null, startRound(base, rng), now);
  },

  getPlayerView(s, playerId) {
    return {
      ...view(s),
      me: playerId,
      hand: sortHand(s.hands[playerId] ?? []),
      drawn: s.toAct === playerId ? s.drawn : null,
    };
  },

  getTableView: view,

  applyAction(s, playerId, action, rng, now) {
    const turned = action.type !== 'call' && action.type !== 'catch';
    return stamp(s, move(s, playerId, action, rng), now, turned);
  },

  waitingOn: (s) => (s.phase === 'play' && s.toAct ? [s.toAct] : []),

  nextTimer(s) {
    if (s.phase === 'done' && s.dealAt) return { id: 'deal', at: s.dealAt };
    if (s.phase === 'play' && s.toAct && s.actBy) return { id: 'act', at: s.actBy };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'deal' && s.phase === 'done') return stamp(s, startRound(s, rng), now);
    if (id === 'act' && s.phase === 'play' && s.toAct) {
      // Out of time: take what's waiting, keep a drawn card, or draw and move on.
      const who = s.toAct;
      let next = move(s, who, { type: s.drawn !== null ? 'pass' : 'draw' }, rng, true);
      if (next.toAct === who && next.drawn !== null)
        next = move(next, who, { type: 'pass' }, rng, true);
      return stamp(s, next, now, true);
    }
    return s;
  },

  partialResult,
  bot: unoBot,

  getResult(s): GameResult | null {
    if (s.phase !== 'over') return null;
    const top = Math.max(0, ...s.players.map((id) => s.scores[id] ?? 0));
    const winners =
      s.target === 0 && s.last
        ? [s.last.winner]
        : s.players.filter((id) => (s.scores[id] ?? 0) === top);
    const ranked = [...s.players].sort((a, b) => (s.scores[b] ?? 0) - (s.scores[a] ?? 0));
    const reveal: UnoReveal = {
      players: ranked,
      scores: s.scores,
      rounds: s.round,
      target: s.target,
      last: s.last,
    };
    return {
      winners,
      summary:
        s.target === 0
          ? `Out first, scoring ${s.last?.points ?? 0}`
          : winners.length > 1
            ? `A tie at ${top} points after ${s.round} rounds`
            : `First to ${s.target}: ${top} points after ${s.round} rounds`,
      reveal,
      recap: s.recap,
      highlights: s.biggest
        ? [
            {
              award: 'Biggest round',
              playerIds: [s.biggest.player],
              text: `${s.biggest.points} points in round ${s.biggest.round}`,
              value: s.biggest.points,
            },
          ]
        : [],
      standings: s.players.map((id) => ({
        playerId: id,
        outcome: winners.includes(id) ? (winners.length > 1 ? 'draw' : 'win') : 'loss',
        role: `${s.scores[id] ?? 0} points`,
      })),
    };
  },
};
