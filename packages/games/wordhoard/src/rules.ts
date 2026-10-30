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
  COUNTS,
  RACK,
  checkPlay,
  emptyBoard,
  rackValue,
  type Board,
  type FormedWord,
} from './board';
import { wordhoardBot } from './bot';
import { meta } from './meta';
import { isWord } from './words';

/**
 * Letterhoard, a crossword tile game for 2–4 players, or up to eight in pairs. Each turn you lay tiles from your rack of
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
const CLOCKS = ['Off', '1 minute', '2 minutes', '3 minutes'] as const;
/** Most sides at the board: four racks of seven still leave the bag a game's worth. */
const MAX_SIDES = 4;

export const optionsSchema = z.object({
  pairs: z.enum(PAIRS).describe('Pairs'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
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
  /** A pass because the turn timer ran out. */
  late?: boolean;
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
  /** Seconds each turn may take, 0 or absent for no limit. */
  turnSecs?: number;
  /** When the side to play runs out of time (server time), with a turn timer. */
  turnBy?: number | null;
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
  /** When the side to play runs out of time (server time), with a turn timer. */
  turnBy: number | null;
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
  // The racks were hidden all game; now they are told, with what each cost or earned.
  const racks = keys(s)
    .map((id) => {
      const rack = s.racks[id] ?? [];
      return `${(s.sides.find((x) => x[0] === id) ?? [id]).map((p) => `{${p}}`).join(' and ')}: ${rack.length ? tilesText(rack) : 'empty'}`;
    })
    .join('; ');
  // The single best play of the game is a turning point (older games' recaps carry no tags).
  const best = s.moves.reduce(
    (a, m, i) => (m.kind === 'play' && (a < 0 || m.score > s.moves[a]!.score) ? i : a),
    -1,
  );
  const bestWord = best >= 0 ? s.moves[best]!.words?.[0]?.word : undefined;
  const recap = s.recap.map((e) =>
    bestWord &&
    e.tag &&
    e.text.includes(`played ${bestWord}`) &&
    e.tag === `${s.moves[best]!.score} pts`
      ? { ...e, key: true }
      : e,
  );
  return {
    ...s,
    scores,
    endBonus,
    over: true,
    recap: [
      ...recap,
      {
        round: roundOf(s),
        actor: out ? (who ?? out) : undefined,
        text: out
          ? `{${who ?? out}} used the last tile and gained ${left} from the other racks.`
          : `Six scoreless turns in a row ended the game.`,
        secret: `Racks left: ${racks}`,
        tag: out ? `+${left}` : 'Stalemate',
        ...(out ? { tone: 'good' as const } : {}),
        key: true,
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
    turnBy: s.turnBy ?? null,
  };
}

/** Starts the turn timer for whoever plays next, after any move. */
function clock(prev: WordhoardState | null, s: WordhoardState, now: number): WordhoardState {
  if (s === prev) return s;
  const moved = !prev || s.moves.length !== prev.moves.length;
  const turnBy =
    s.over || !s.turnSecs ? null : moved ? now + s.turnSecs * 1000 : (s.turnBy ?? null);
  return { ...s, turnBy };
}

const words = (ws: FormedWord[]) => ws.map((w) => w.word).join(', ');

/** The round a move belongs to: each side has played once per round. */
const roundOf = (s: WordhoardState) => Math.floor(s.moves.length / s.sides.length) + 1;

/** A play this big is worth a mention on its own. */
const BIG_PLAY = 40;

const tilesText = (tiles: string[]) =>
  [...tiles]
    .sort()
    .map((t) => (t === '?' ? 'blank' : t))
    .join(' ');

/** One player's move, before the turn timer is set (see `clock`). */
function act(
  s: WordhoardState,
  playerId: string,
  action: WordhoardAction,
  rng: Rng,
): WordhoardState {
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
      recap: [
        ...s.recap,
        {
          round: roundOf(s),
          actor: playerId,
          text: 'passed',
          secret: `Rack: ${tilesText(rack)}`,
          tag: 'Pass',
        },
      ],
    };
    return next.scoreless >= SCORELESS_END ? finish(next, null) : next;
  }

  if (action.type === 'swap') {
    if (s.bag.length < RACK)
      throw new GameError('bag_low', 'You can only swap while the bag has at least seven tiles.');
    const left = takeFrom(rack, action.tiles);
    if (!left) throw new GameError('not_yours', 'Those tiles aren’t on your rack.');
    const d = draw(s.bag, left);
    // The swapped tiles go back into the bag, which is shaken so nobody knows where they are.
    const next: WordhoardState = {
      ...s,
      racks: { ...s.racks, [side]: d.rack },
      bag: rng.shuffle([...d.bag, ...action.tiles]),
      turn: nextSide(s),
      moves: [...s.moves, { player: playerId, kind: 'swap', score: 0, count: action.tiles.length }],
      scoreless: s.scoreless + 1,
      recap: [
        ...s.recap,
        {
          round: roundOf(s),
          actor: playerId,
          text: `swapped ${action.tiles.length} tiles`,
          secret: `Threw back ${tilesText(action.tiles)}`,
          tag: 'Swap',
        },
      ],
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
    // A play worth nothing (blanks alone) counts as scoreless too.
    scoreless: check.score > 0 ? 0 : s.scoreless + 1,
    recap: [
      ...s.recap,
      {
        round: roundOf(s),
        actor: playerId,
        text: `played ${words(check.words)} for ${check.score}${check.bingo ? ' (all seven tiles)' : ''}`,
        tag: check.bingo ? `Bingo ${check.score} pts` : `${check.score} pts`,
        ...(check.bingo || check.score >= BIG_PLAY ? { tone: 'good' as const } : {}),
        ...(check.bingo ? { key: true } : {}),
      },
    ],
  };
  if (d.rack.length === 0 && d.bag.length === 0) return finish(next, side, playerId);
  return next.scoreless >= SCORELESS_END ? finish(next, null) : next;
}

/** Score, best word and words played for each side, winners first. */
function statsOf(s: WordhoardState, won: string[]): RecapStats {
  const rows = keys(s).map((id) => {
    const plays = s.moves.filter(
      (m) => m.kind === 'play' && (sideOf(s, m.player) ?? m.player) === id,
    );
    const top = plays.reduce<Move | null>((a, m) => (!a || m.score > a.score ? m : a), null);
    return {
      playerId: id,
      score: s.scores[id] ?? 0,
      won: won.includes(id),
      values: [
        s.scores[id] ?? 0,
        top ? `${top.words?.[0]?.word} ${top.score}` : '-',
        plays.length,
        plays.filter((m) => m.bingo).length,
      ],
    };
  });
  rows.sort((a, b) => Number(b.won) - Number(a.won) || b.score - a.score);
  return {
    columns: ['Score', 'Best word', 'Words', 'Bingos'],
    rows: rows.map((r) => ({ playerId: r.playerId, values: r.values })),
  };
}

/**
 * The result from the scores as they stand: at the end of the game, or (`partialResult`) when the
 * host ends it early, before the tiles left on the racks are settled.
 */
function resultOf(s: WordhoardState): GameResult {
  const top = Math.max(...keys(s).map((id) => s.scores[id] ?? 0));
  const won = keys(s).filter((id) => (s.scores[id] ?? 0) === top);
  const winners = s.players.filter((id) => won.includes(sideOf(s, id)!));
  const best = s.moves
    .filter((m) => m.kind === 'play')
    .reduce<Move | null>((a, m) => (!a || m.score > a.score ? m : a), null);
  const paired = s.sides.some((side) => side.length > 1);
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
    roundName: 'Round',
    stats: statsOf(s, won),
    highlights: best
      ? [
          {
            award: 'Best word',
            playerIds: [best.player],
            text: `${best.words?.[0]?.word} for ${best.score}`,
            value: best.score,
          },
        ]
      : [],
    standings: s.players.map((id) => {
      const side = s.sides.find((x) => x.includes(id)) ?? [id];
      return {
        playerId: id,
        outcome: winners.includes(id) ? (won.length > 1 ? 'draw' : 'win') : 'loss',
        // In a game of pairs, stats can tell playing with a partner from playing alone.
        ...(paired ? { team: side.length > 1 ? 'In a pair' : 'On their own' } : {}),
        role: `${s.scores[side[0]!] ?? 0} points`,
      };
    }),
  };
}

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
  defaultOptions: () => ({ pairs: 'Past four players', turnTimer: 'Off' }),
  validateOptions: (o, n) =>
    o.pairs === 'Always' && n < 3 ? 'Pairs need at least three players.' : null,

  setup({ playerIds, options, rng, now }) {
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
    const start: WordhoardState = {
      turnSecs: options.turnTimer === 'Off' ? 0 : 60 * Number(options.turnTimer.split(' ')[0]),
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
    return clock(null, start, now);
  },

  getPlayerView(s, playerId) {
    const side = sideOf(s, playerId) ?? playerId;
    return { ...view(s), me: playerId, side, rack: s.racks[side] ?? [] };
  },

  getTableView: view,

  applyAction(s, playerId, action, rng, now) {
    return clock(s, act(s, playerId, action, rng), now);
  },

  nextTimer: (s) => (!s.over && s.turnBy ? { id: 'turn', at: s.turnBy } : null),

  onTimer(s, id, _rng, now) {
    if (id !== 'turn' || s.over) return s;
    // Out of time: the side to play passes.
    const next: WordhoardState = {
      ...s,
      turn: nextSide(s),
      moves: [...s.moves, { player: s.turn, kind: 'pass', score: 0, late: true }],
      scoreless: s.scoreless + 1,
      recap: [
        ...s.recap,
        {
          round: roundOf(s),
          actor: s.turn,
          text: 'ran out of time',
          secret: `Rack: ${tilesText(s.racks[s.turn] ?? [])}`,
          tag: 'Timed out',
          tone: 'bad',
        },
      ],
    };
    return clock(s, next.scoreless >= SCORELESS_END ? finish(next, null) : next, now);
  },

  waitingOn: (s) => (s.over ? [] : (s.sides.find((side) => side[0] === s.turn) ?? [])),

  getResult: (s) => (s.over ? resultOf(s) : null),

  /** Ending early: the highest score so far wins (ties share it); null before anyone scores. */
  partialResult(s) {
    if (s.over) return null;
    const scored = keys(s).some((id) => (s.scores[id] ?? 0) > 0);
    return scored ? resultOf(s) : null;
  },

  bot: wordhoardBot,
};
