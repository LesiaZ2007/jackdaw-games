import { GameError, type GameModule, type GameResult, type RecapEvent } from '@jackdaw/engine';
import { z } from 'zod';
import {
  COUNTS,
  RACK,
  checkPlay,
  emptyBoard,
  rackValue,
  type Board,
  type FormedWord,
} from './board';
import { meta } from './meta';
import { isWord } from './words';

/**
 * Wordhoard, a crossword tile game for 2–4 players, or up to eight in pairs. Each turn you lay tiles from your rack of
 * seven in one line to make words joined to those on the board, and score their letters with the
 * board's bonus squares; using all seven at once earns 50 more. Every word made must be in the
 * word list. Instead of playing you can swap tiles (while the bag has at least seven) or pass.
 * The game ends when someone uses their last tile with the bag empty (they gain what's left on
 * everyone else's racks, who lose it), or after six scoreless turns in a row (everyone loses
 * what's on their rack). Most points wins.
 *
 * Past four players (or always, if the host picks it) everyone plays in pairs. Partners are drawn at random (with an odd number, one player is on their own). A
 * pair shares one rack and one score, and either partner can make the pair's move.
 */

/** Pairs: only once there are too many to play alone, or always. */
const PAIRS = ['Past four players', 'Always'] as const;
/** Most sides at the board: four racks of seven still leave the bag a game's worth. */
const MAX_SIDES = 4;

export const optionsSchema = z.object({
  pairs: z.enum(PAIRS).describe('Pairs'),
});
export type WordhoardOptions = z.infer<typeof optionsSchema>;

const letter = z.string().regex(/^[A-Z]$/);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play'),
    tiles: z
      .array(
        z.object({
          row: z.number().int().min(0).max(14),
          col: z.number().int().min(0).max(14),
          letter,
          blank: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(7),
  }),
  /** Swap these tiles ('?' for a blank) for new ones. */
  z.object({
    type: z.literal('swap'),
    tiles: z
      .array(z.string().regex(/^[A-Z?]$/))
      .min(1)
      .max(7),
  }),
  z.object({ type: z.literal('pass') }),
]);
export type WordhoardAction = z.infer<typeof actionSchema>;

export interface Move {
  player: string;
  kind: 'play' | 'swap' | 'pass' | 'out';
  /** Words made, with their scores (plays). */
  words?: { word: string; score: number }[];
  /** The squares the tiles went on (plays), to highlight the last move. */
  cells?: [number, number][];
  score: number;
  /** Tiles swapped. */
  count?: number;
  bingo?: boolean;
}

export interface WordhoardState {
  players: string[];
  /**
   * Who plays together, in turn order: one player each, or pairs. A side is known by its first
   * player's id, which keys racks, scores and turn.
   */
  sides: string[][];
  board: Board;
  /** Secret: the bag, in drawing order. */
  bag: string[];
  /** Secret: each side's tiles ('?' is a blank). */
  racks: Record<string, string[]>;
  scores: Record<string, number>;
  /** The side to play. */
  turn: string;
  moves: Move[];
  /** Scoreless turns in a row (passes, swaps, nothing scored). */
  scoreless: number;
  over: boolean;
  /** At the end: what each player gained or lost from the tiles left on racks. */
  endBonus: Record<string, number>;
  recap: RecapEvent[];
}

/** Everything public: the TV and every phone render this. */
export interface WordhoardTableView {
  players: string[];
  sides: string[][];
  board: Board;
  bagCount: number;
  rackCounts: Record<string, number>;
  scores: Record<string, number>;
  turn: string;
  moves: Move[];
  scoreless: number;
  over: boolean;
  endBonus: Record<string, number>;
}

export interface WordhoardPlayerView extends WordhoardTableView {
  me: string;
  /** Your side: you, or you and your partner. */
  side: string;
  /** Your side's rack. */
  rack: string[];
}

export interface WordhoardReveal {
  /** Older results (before pairs) don't have it: one side per player then. */
  sides?: string[][];
  board: Board;
  scores: Record<string, number>;
  racks: Record<string, string[]>;
  endBonus: Record<string, number>;
  moves: Move[];
}

const SCORELESS_END = 6;

function draw(bag: string[], rack: string[]) {
  const need = Math.max(0, RACK - rack.length);
  return { rack: [...rack, ...bag.slice(0, need)], bag: bag.slice(need) };
}

/** Takes `tiles` out of `rack`, or null if the rack doesn't hold them. */
function takeFrom(rack: string[], tiles: string[]): string[] | null {
  const left = [...rack];
  for (const t of tiles) {
    const i = left.indexOf(t);
    if (i < 0) return null;
    left.splice(i, 1);
  }
  return left;
}

/** The side a player plays on, by its key. */
export const sideOf = (t: { sides: string[][] }, playerId: string) =>
  t.sides.find((side) => side.includes(playerId))?.[0];

const keys = (s: { sides: string[][] }) => s.sides.map((side) => side[0]!);

const nextSide = (s: WordhoardState) => {
  const k = keys(s);
  return k[(k.indexOf(s.turn) + 1) % k.length]!;
};

/**
 * Ends the game, settling what's left on the racks. `out` is the side that used its last tile (and
 * `who` the player who laid it), if anyone did.
 */
function finish(s: WordhoardState, out: string | null, who?: string): WordhoardState {
  const endBonus: Record<string, number> = {};
  let left = 0;
  for (const id of keys(s)) {
    const v = rackValue(s.racks[id] ?? []);
    if (id !== out) {
      endBonus[id] = -v;
      left += v;
    }
  }
  if (out) endBonus[out] = left;
  const scores = Object.fromEntries(
    keys(s).map((id) => [id, (s.scores[id] ?? 0) + (endBonus[id] ?? 0)]),
  );
  return {
    ...s,
    scores,
    endBonus,
    over: true,
    recap: [
      ...s.recap,
      {
        text: out
          ? `{${who ?? out}} used the last tile and gained ${left} from the other racks.`
          : `Six scoreless turns in a row ended the game.`,
      },
    ],
  };
}

function view(s: WordhoardState): WordhoardTableView {
  return {
    players: s.players,
    sides: s.sides,
    board: s.board,
    bagCount: s.bag.length,
    rackCounts: Object.fromEntries(keys(s).map((id) => [id, s.racks[id]?.length ?? 0])),
    scores: s.scores,
    turn: s.turn,
    moves: s.moves,
    scoreless: s.scoreless,
    over: s.over,
    endBonus: s.endBonus,
  };
}

const words = (ws: FormedWord[]) => ws.map((w) => w.word).join(', ');

export const wordhoard: GameModule<
  WordhoardState,
  WordhoardAction,
  WordhoardPlayerView,
  WordhoardTableView,
  WordhoardOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({ pairs: 'Past four players' }),
  validateOptions: (o, n) =>
    o.pairs === 'Always' && n < 3 ? 'Pairs need at least three players.' : null,

  setup({ playerIds, options, rng }) {
    let sides: string[][];
    if (options.pairs === 'Always' || playerIds.length > MAX_SIDES) {
      const drawn = rng.shuffle(playerIds);
      sides = Array.from({ length: Math.ceil(drawn.length / 2) }, (_, i) =>
        drawn.slice(i * 2, i * 2 + 2),
      );
    } else sides = playerIds.map((id) => [id]);
    let bag = rng.shuffle(Object.entries(COUNTS).flatMap(([t, n]) => Array<string>(n).fill(t)));
    const racks: Record<string, string[]> = {};
    for (const id of keys({ sides })) {
      const d = draw(bag, []);
      racks[id] = d.rack;
      bag = d.bag;
    }
    return {
      players: playerIds,
      sides,
      board: emptyBoard(),
      bag,
      racks,
      scores: Object.fromEntries(keys({ sides }).map((id) => [id, 0])),
      turn: rng.pick(keys({ sides })),
      moves: [],
      scoreless: 0,
      over: false,
      endBonus: {},
      recap: [],
    };
  },

  getPlayerView(s, playerId) {
    const side = sideOf(s, playerId) ?? playerId;
    return { ...view(s), me: playerId, side, rack: s.racks[side] ?? [] };
  },

  getTableView: view,

  applyAction(s, playerId, action) {
    if (s.over) throw new GameError('over', 'The game is over.');
    const side = sideOf(s, playerId);
    if (!side || s.turn !== side) throw new GameError('not_your_turn', 'It’s not your turn.');
    const rack = s.racks[side] ?? [];

    if (action.type === 'pass') {
      const next: WordhoardState = {
        ...s,
        turn: nextSide(s),
        moves: [...s.moves, { player: playerId, kind: 'pass', score: 0 }],
        scoreless: s.scoreless + 1,
        recap: [...s.recap, { actor: playerId, text: 'passed' }],
      };
      return next.scoreless >= SCORELESS_END ? finish(next, null) : next;
    }

    if (action.type === 'swap') {
      if (s.bag.length < RACK)
        throw new GameError('bag_low', 'You can only swap while the bag has at least seven tiles.');
      const left = takeFrom(rack, action.tiles);
      if (!left) throw new GameError('not_yours', 'Those tiles aren’t on your rack.');
      const d = draw(s.bag, left);
      // The swapped tiles go back into the bag, below the ones still to be drawn.
      const next: WordhoardState = {
        ...s,
        racks: { ...s.racks, [side]: d.rack },
        bag: [...d.bag, ...action.tiles],
        turn: nextSide(s),
        moves: [
          ...s.moves,
          { player: playerId, kind: 'swap', score: 0, count: action.tiles.length },
        ],
        scoreless: s.scoreless + 1,
        recap: [...s.recap, { actor: playerId, text: `swapped ${action.tiles.length} tiles` }],
      };
      return next.scoreless >= SCORELESS_END ? finish(next, null) : next;
    }

    // A play.
    const used = action.tiles.map((t) => (t.blank ? '?' : t.letter));
    const left = takeFrom(rack, used);
    if (!left) throw new GameError('not_yours', 'Those tiles aren’t on your rack.');
    const check = checkPlay(s.board, action.tiles);
    if (!check.ok) throw new GameError('bad_play', check.reason);
    const wrong = check.words.filter((w) => !isWord(w.word));
    if (wrong.length > 0) {
      throw new GameError(
        'not_a_word',
        wrong.length === 1
          ? `${wrong[0]!.word} isn’t in the word list.`
          : `${words(wrong)} aren’t in the word list.`,
      );
    }
    const board = s.board.map((row) => [...row]);
    for (const t of action.tiles)
      board[t.row]![t.col] = { letter: t.letter, ...(t.blank ? { blank: true } : {}) };
    const d = draw(s.bag, left);
    const next: WordhoardState = {
      ...s,
      board,
      bag: d.bag,
      racks: { ...s.racks, [side]: d.rack },
      scores: { ...s.scores, [side]: (s.scores[side] ?? 0) + check.score },
      turn: nextSide(s),
      moves: [
        ...s.moves,
        {
          player: playerId,
          kind: 'play',
          words: check.words.map((w) => ({ word: w.word, score: w.score })),
          cells: action.tiles.map((t) => [t.row, t.col] as [number, number]),
          score: check.score,
          bingo: check.bingo,
        },
      ],
      scoreless: 0,
      recap: [
        ...s.recap,
        {
          actor: playerId,
          text: `played ${words(check.words)} for ${check.score}${check.bingo ? ' (all seven tiles)' : ''}`,
        },
      ],
    };
    return d.rack.length === 0 && d.bag.length === 0 ? finish(next, side, playerId) : next;
  },

  waitingOn: (s) => (s.over ? [] : (s.sides.find((side) => side[0] === s.turn) ?? [])),

  getResult(s): GameResult | null {
    if (!s.over) return null;
    const top = Math.max(...keys(s).map((id) => s.scores[id] ?? 0));
    const won = keys(s).filter((id) => (s.scores[id] ?? 0) === top);
    const winners = s.players.filter((id) => won.includes(sideOf(s, id)!));
    const best = s.moves
      .filter((m) => m.kind === 'play')
      .reduce<Move | null>((a, m) => (!a || m.score > a.score ? m : a), null);
    const reveal: WordhoardReveal = {
      sides: s.sides,
      board: s.board,
      scores: s.scores,
      racks: s.racks,
      endBonus: s.endBonus,
      moves: s.moves,
    };
    return {
      winners,
      summary:
        won.length > 1
          ? `A tie on ${top} points`
          : `${top} points${best ? `; best play ${best.words?.[0]?.word} for ${best.score}` : ''}`,
      reveal,
      recap: s.recap,
      standings: s.players.map((id) => ({
        playerId: id,
        outcome: winners.includes(id) ? (won.length > 1 ? 'draw' : 'win') : 'loss',
        role: `${s.scores[sideOf(s, id)!] ?? 0} points`,
      })),
    };
  },
};
