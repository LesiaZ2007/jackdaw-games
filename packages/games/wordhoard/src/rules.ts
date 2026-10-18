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
 * Wordhoard, a crossword tile game for 2–4 players. Each turn you lay tiles from your rack of
 * seven in one line to make words joined to those on the board, and score their letters with the
 * board's bonus squares; using all seven at once earns 50 more. Every word made must be in the
 * word list. Instead of playing you can swap tiles (while the bag has at least seven) or pass.
 * The game ends when someone uses their last tile with the bag empty (they gain what's left on
 * everyone else's racks, who lose it), or after six scoreless turns in a row (everyone loses
 * what's on their rack). Most points wins.
 */

export const optionsSchema = z.object({});
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
  board: Board;
  /** Secret: the bag, in drawing order. */
  bag: string[];
  /** Secret: each player's tiles ('?' is a blank). */
  racks: Record<string, string[]>;
  scores: Record<string, number>;
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
  rack: string[];
}

export interface WordhoardReveal {
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

const nextPlayer = (s: WordhoardState) =>
  s.players[(s.players.indexOf(s.turn) + 1) % s.players.length]!;

/** Ends the game, settling what's left on the racks. `out` used their last tile, if anyone did. */
function finish(s: WordhoardState, out: string | null): WordhoardState {
  const endBonus: Record<string, number> = {};
  let left = 0;
  for (const id of s.players) {
    const v = rackValue(s.racks[id] ?? []);
    if (id !== out) {
      endBonus[id] = -v;
      left += v;
    }
  }
  if (out) endBonus[out] = left;
  const scores = Object.fromEntries(
    s.players.map((id) => [id, (s.scores[id] ?? 0) + (endBonus[id] ?? 0)]),
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
          ? `{${out}} used their last tile and gained ${left} from the other racks.`
          : `Six scoreless turns in a row ended the game.`,
      },
    ],
  };
}

function view(s: WordhoardState): WordhoardTableView {
  return {
    players: s.players,
    board: s.board,
    bagCount: s.bag.length,
    rackCounts: Object.fromEntries(s.players.map((id) => [id, s.racks[id]?.length ?? 0])),
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
  defaultOptions: () => ({}),

  setup({ playerIds, rng }) {
    let bag = rng.shuffle(Object.entries(COUNTS).flatMap(([t, n]) => Array<string>(n).fill(t)));
    const racks: Record<string, string[]> = {};
    for (const id of playerIds) {
      const d = draw(bag, []);
      racks[id] = d.rack;
      bag = d.bag;
    }
    return {
      players: playerIds,
      board: emptyBoard(),
      bag,
      racks,
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      turn: rng.pick(playerIds),
      moves: [],
      scoreless: 0,
      over: false,
      endBonus: {},
      recap: [],
    };
  },

  getPlayerView(s, playerId) {
    return { ...view(s), me: playerId, rack: s.racks[playerId] ?? [] };
  },

  getTableView: view,

  applyAction(s, playerId, action) {
    if (s.over) throw new GameError('over', 'The game is over.');
    if (s.turn !== playerId) throw new GameError('not_your_turn', 'It’s not your turn.');
    const rack = s.racks[playerId] ?? [];

    if (action.type === 'pass') {
      const next: WordhoardState = {
        ...s,
        turn: nextPlayer(s),
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
        racks: { ...s.racks, [playerId]: d.rack },
        bag: [...d.bag, ...action.tiles],
        turn: nextPlayer(s),
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
      racks: { ...s.racks, [playerId]: d.rack },
      scores: { ...s.scores, [playerId]: (s.scores[playerId] ?? 0) + check.score },
      turn: nextPlayer(s),
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
    return d.rack.length === 0 && d.bag.length === 0 ? finish(next, playerId) : next;
  },

  getResult(s): GameResult | null {
    if (!s.over) return null;
    const top = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
    const winners = s.players.filter((id) => (s.scores[id] ?? 0) === top);
    const best = s.moves
      .filter((m) => m.kind === 'play')
      .reduce<Move | null>((a, m) => (!a || m.score > a.score ? m : a), null);
    const reveal: WordhoardReveal = {
      board: s.board,
      scores: s.scores,
      racks: s.racks,
      endBonus: s.endBonus,
      moves: s.moves,
    };
    return {
      winners,
      summary:
        winners.length > 1
          ? `A tie on ${top} points`
          : `${top} points${best ? `; best play ${best.words?.[0]?.word} for ${best.score}` : ''}`,
      reveal,
      recap: s.recap,
      standings: s.players.map((id) => ({
        playerId: id,
        outcome: winners.includes(id) ? (winners.length > 1 ? 'draw' : 'win') : 'loss',
        role: `${s.scores[id] ?? 0} points`,
      })),
    };
  },
};
