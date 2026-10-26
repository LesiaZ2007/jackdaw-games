import {
  botFate,
  GameError,
  type Announcement,
  type BotLevel,
  type GameModule,
  type GameResult,
  type Highlight,
  type RecapEvent,
} from '@jackdaw/engine';
import { z } from 'zod';
import { meta } from './meta';
import { checkKings, makePuzzle, MAX_SIZE, MIN_SIZE, solve, type Puzzle } from './puzzle';
import { clock } from './time';

/**
 * Kings: LinkedIn's Queens, with kings. Everyone gets the same run of puzzles, made fresh for
 * the game, and solves them on their own phone. Alone it's a puzzle book; with friends it's a
 * race: most puzzles solved wins, and the quickest to get there breaks a tie.
 *
 * The board stays on the phone while you work; only a finished board is sent, and the server
 * checks it. A board solved by someone is never shown to anyone else until the game is over, so
 * the TV and the other phones see how far each player is, not where their kings went.
 *
 * Once the first player has solved them all, the others get `CLOSE_MS` to finish the puzzle
 * they're on, then the race ends.
 */

export const SIZES = [...Array(MAX_SIZE - MIN_SIZE + 1).keys()].map(
  (i) => `${i + MIN_SIZE}×${i + MIN_SIZE}`,
) as [string, ...string[]];
export const MAX_PUZZLES = 20;
export const CLOSE_MS = 120_000;

export const optionsSchema = z.object({
  board: z.enum(SIZES).describe('Board'),
  puzzles: z.number().int().min(1).max(MAX_PUZZLES).describe('Puzzles'),
});
export type KingsOptions = z.infer<typeof optionsSchema>;

export const actionSchema = z.object({
  type: z.literal('solve'),
  /** Which puzzle (0-based), so a late resend can't count against the next one. */
  puzzle: z.number().int().min(0).max(MAX_PUZZLES),
  kings: z
    .array(
      z
        .number()
        .int()
        .min(0)
        .max(MAX_SIZE * MAX_SIZE - 1),
    )
    .max(MAX_SIZE),
});
export type KingsAction = z.infer<typeof actionSchema>;

export interface KingsState {
  players: string[];
  size: number;
  count: number;
  startedAt: number;
  /** Puzzles made so far; the next is made when the first player reaches it. */
  puzzles: Puzzle[];
  /** When each player solved each puzzle, server time. */
  times: Record<string, number[]>;
  /** Secret until the end: where each player put their kings. */
  boards: Record<string, number[][]>;
  /** Set once someone has solved them all and others are still going. */
  closesAt: number | null;
  over: boolean;
  recap: RecapEvent[];
}

/** Everything public: the TV and every phone render this. */
export interface KingsTableView {
  players: string[];
  size: number;
  count: number;
  startedAt: number;
  puzzles: Puzzle[];
  times: Record<string, number[]>;
  closesAt: number | null;
  over: boolean;
}

export interface KingsPlayerView extends KingsTableView {
  me: string;
  /** The puzzle this player is on (0-based), or `count` once they're done. */
  index: number;
  /** When they started it. */
  since: number;
  puzzle: Puzzle | null;
}

export function sizeOf(board: string): number {
  return Number(board.split('×')[0]);
}

/** When this player started the puzzle they're on. */
export function since(t: KingsTableView, id: string): number {
  const times = t.times[id] ?? [];
  return times.length ? times[times.length - 1]! : t.startedAt;
}

/** Players best first: most solved, then soonest to get there. */
export function ranking(t: Pick<KingsTableView, 'players' | 'times' | 'startedAt'>): string[] {
  const solved = (id: string) => t.times[id]?.length ?? 0;
  const last = (id: string) => t.times[id]?.at(-1) ?? Infinity;
  return [...t.players].sort((a, b) => solved(b) - solved(a) || last(a) - last(b));
}

function tableView(s: KingsState): KingsTableView {
  return {
    players: s.players,
    size: s.size,
    count: s.count,
    startedAt: s.startedAt,
    puzzles: s.puzzles,
    times: s.times,
    closesAt: s.closesAt,
    over: s.over,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The result from the puzzles solved so far. Null while nobody has solved one. */
function resultFrom(s: KingsState, early: boolean): GameResult | null {
  const order = ranking(s);
  const best = order[0]!;
  const solved = s.times[best]?.length ?? 0;
  if (solved === 0) return null;
  const took = (id: string) => (s.times[id]?.at(-1) ?? s.startedAt) - s.startedAt;
  const winners = order.filter(
    (id) => (s.times[id]?.length ?? 0) === solved && took(id) === took(best),
  );
  const solo = s.players.length === 1;
  const all = solved === s.count;
  const summary = solo
    ? `${all ? 'Solved' : 'Got through'} ${plural(solved, 'puzzle')} in ${clock(took(best))}`
    : `${winners.length > 1 ? 'Tied' : 'Won'} with ${solved} of ${s.count} in ${clock(took(best))}`;
  const reveal: KingsReveal = {
    size: s.size,
    count: s.count,
    startedAt: s.startedAt,
    order,
    times: s.times,
    puzzles: s.puzzles.map((p) => ({ ...p, answer: answerCells(p) })),
  };
  return {
    winners: solo && !all && early ? [] : winners,
    summary,
    reveal,
    recap: s.recap,
    standings: s.players.map((playerId) => ({
      playerId,
      outcome: solo
        ? all
          ? 'win'
          : 'loss'
        : winners.length === s.players.length
          ? 'draw'
          : winners.includes(playerId)
            ? 'win'
            : 'loss',
    })),
    highlights: fastest(s),
  };
}

/** The quickest single puzzle of the game, for the night's awards. */
function fastest(s: KingsState): Highlight[] {
  let best: { id: string; ms: number } | null = null;
  for (const id of s.players) {
    const times = s.times[id] ?? [];
    times.forEach((at, i) => {
      const ms = at - (i === 0 ? s.startedAt : times[i - 1]!);
      if (!best || ms < best.ms) best = { id, ms };
    });
  }
  if (!best) return [];
  const { id, ms } = best;
  return [
    {
      award: 'Fastest puzzle',
      playerIds: [id],
      text: `${s.size}×${s.size} in ${clock(ms)}`,
      value: -ms,
    },
  ];
}

export interface KingsReveal {
  size: number;
  count: number;
  startedAt: number;
  order: string[];
  times: Record<string, number[]>;
  puzzles: (Puzzle & { answer: number[] })[];
}

function answerCells(p: Puzzle): number[] {
  return (solve(p, 1)[0] ?? []).map((c, r) => r * p.size + c);
}

/**
 * How long a bot takes on a puzzle, in ms: about a second a square at Normal, longer at Easy,
 * quicker at Hard, and different each puzzle so a race against bots stays close.
 */
export function botSolveMs(size: number, level: BotLevel, key: string): number {
  const perSquare: Record<BotLevel, number> = { easy: 1_900, normal: 1_150, hard: 650 };
  const swing = 0.65 + botFate(key).next() * 0.8;
  return Math.round(size * size * perSquare[level] * swing);
}

export const kings: GameModule<
  KingsState,
  KingsAction,
  KingsPlayerView,
  KingsTableView,
  KingsOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: (n) => ({ board: '8×8', puzzles: n === 1 ? 1 : 5 }),

  setup: ({ playerIds, options, rng, now }) => {
    const size = sizeOf(options.board);
    return {
      players: playerIds,
      size,
      count: options.puzzles,
      startedAt: now,
      puzzles: [makePuzzle(size, rng)],
      times: Object.fromEntries(playerIds.map((id) => [id, []])),
      boards: Object.fromEntries(playerIds.map((id) => [id, []])),
      closesAt: null,
      over: false,
      recap: [],
    };
  },

  getPlayerView(s, me) {
    const t = tableView(s);
    const index = s.times[me]?.length ?? 0;
    return {
      ...t,
      me,
      index,
      since: since(t, me),
      puzzle: index < s.count ? (s.puzzles[index] ?? null) : null,
    };
  },
  getTableView: tableView,

  applyAction(s, playerId, action, rng, now) {
    if (s.over) throw new GameError('GAME_OVER', 'The race is over.');
    if (!s.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', "You're not in this game.");
    const index = s.times[playerId]!.length;
    if (index >= s.count) throw new GameError('DONE', "You've solved them all.");
    if (action.puzzle !== index) throw new GameError('STALE', 'That board was already counted.');
    const puzzle = s.puzzles[index]!;
    const wrong = checkKings(puzzle, action.kings);
    if (wrong) throw new GameError('NOT_SOLVED', wrong);

    const mine = [...s.times[playerId]!, now];
    const times = { ...s.times, [playerId]: mine };
    const boards = { ...s.boards, [playerId]: [...s.boards[playerId]!, [...action.kings]] };
    const puzzles =
      mine.length < s.count && mine.length === s.puzzles.length
        ? [...s.puzzles, makePuzzle(s.size, rng)]
        : s.puzzles;
    const ms = now - (index === 0 ? s.startedAt : s.times[playerId]![index - 1]!);
    const done = s.players.filter((id) => times[id]!.length === s.count);
    const over = done.length === s.players.length;
    return {
      ...s,
      times,
      boards,
      puzzles,
      over,
      closesAt: over ? null : (s.closesAt ?? (done.length > 0 ? now + CLOSE_MS : null)),
      recap: [
        ...s.recap,
        {
          round: index + 1,
          actor: playerId,
          text: `${playerId} solved puzzle ${index + 1} in ${clock(ms)}`,
        },
      ],
    };
  },

  nextTimer: (s) => (s.closesAt !== null && !s.over ? { id: 'close', at: s.closesAt } : null),
  onTimer: (s, id, _rng, now) =>
    id === 'close' && s.closesAt !== null && now >= s.closesAt && !s.over
      ? { ...s, over: true, closesAt: null }
      : s,

  waitingOn: (s) => (s.over ? [] : s.players.filter((id) => s.times[id]!.length < s.count)),

  announce(prev, next) {
    if (!prev) {
      const what = `${plural(next.count, 'puzzle')} on ${next.size}×${next.size} boards`;
      return [next.players.length === 1 ? `${what}. Good luck.` : `The race is on: ${what}.`];
    }
    const lines: Announcement[] = [];
    for (const id of next.players) {
      const n = next.times[id]!.length;
      if (n === next.count && prev.times[id]!.length < n)
        lines.push(
          `{${id}} solved all ${next.count} in ${clock(next.times[id]![n - 1]! - next.startedAt)}.`,
        );
    }
    if (next.closesAt !== null && prev.closesAt === null)
      lines.push('Two minutes left for everyone else.');
    return lines;
  },

  getResult: (s) => (s.over ? resultFrom(s, false) : null),
  partialResult: (s) => (s.over ? resultFrom(s, false) : resultFrom(s, true)),

  botDelayMs: 1_000,
  bot({ view, playerId, now, level }) {
    if (view.over || !view.puzzle) return null;
    const due =
      view.since + botSolveMs(view.size, level, `${playerId}:${view.index}:${view.startedAt}`);
    if (now < due) return null;
    const answer = solve(view.puzzle, 1)[0];
    if (!answer) return null;
    return {
      type: 'solve',
      puzzle: view.index,
      kings: answer.map((c, r) => r * view.size + c),
    };
  },
};
