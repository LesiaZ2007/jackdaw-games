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
import {
  checkBoard,
  deduce,
  makePuzzle,
  MOON,
  BOARD_SIZES as BOARDS,
  solve,
  SUN,
  type Puzzle,
} from './puzzle';
import { clock } from './time';

/**
 * Fandango: LinkedIn's Tango. Everyone gets the same run of puzzles, made fresh for the game, and
 * solves them on their own phone. Alone it's a puzzle book; with friends it's a race: most
 * puzzles solved wins, and the quickest to get there breaks a tie.
 *
 * Each player's marks go to the server as they play; only players who have finished every
 * puzzle see them (they watch the rest), and the TV when someone plays alone. Everyone else sees
 * how much of the board each player has filled. A finished board is checked by the server.
 *
 * Once the first player has solved them all, the others get `CLOSE_MS` to finish the puzzle
 * they're on, then the race ends.
 */

export const SIZES = BOARDS.map((n) => `${n}×${n}`) as [string, ...string[]];
const MAX_SIZE = BOARDS[BOARDS.length - 1]!;
export const MAX_PUZZLES = 20;
export const CLOSE_MS = 120_000;

export const optionsSchema = z.object({
  board: z.enum(SIZES).describe('Board'),
  puzzles: z.number().int().min(1).max(MAX_PUZZLES).describe('Puzzles'),
  /** Hint and Show a mistake, for someone playing alone. Never in a race. */
  hints: z.boolean().describe('Hints when alone'),
});
export type FandangoOptions = z.infer<typeof optionsSchema>;

/** A board's marks, row by row: 0 empty, 1 sun, 2 moon. */
const marks = z.array(z.number().int().min(0).max(2)).max(MAX_SIZE * MAX_SIZE);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('solve'),
    /** Which puzzle (0-based), so a late resend can't count against the next one. */
    puzzle: z.number().int().min(0).max(MAX_PUZZLES),
    cells: marks,
  }),
  /** This player's marks on the puzzle they're on, sent as they play. */
  z.object({
    type: z.literal('progress'),
    puzzle: z.number().int().min(0).max(MAX_PUZZLES),
    cells: marks,
  }),
  /** A hint shown (alone, with hints on), counted for the results. */
  z.object({
    type: z.literal('hint'),
    puzzle: z.number().int().min(0).max(MAX_PUZZLES),
    kind: z.enum(['step', 'mistake']),
  }),
]);
export type FandangoAction = z.infer<typeof actionSchema>;

export interface FandangoState {
  players: string[];
  size: number;
  count: number;
  startedAt: number;
  /** Puzzles made so far; the next is made when the first player reaches it. */
  puzzles: Puzzle[];
  /** When each player solved each puzzle, server time. */
  times: Record<string, number[]>;
  /** Secret until the end: each player's finished boards. */
  boards: Record<string, number[][]>;
  /**
   * Each player's marks right now, on the puzzle they're on. Seen only by players who have
   * finished (they watch the rest), and on the TV when someone plays alone.
   */
  live: Record<string, number[]>;
  /** Set once someone has solved them all and others are still going. */
  closesAt: number | null;
  over: boolean;
  recap: RecapEvent[];
  /** Hints on: only when one person plays alone and the host left them on. */
  hints?: boolean;
  /** Hints used on each puzzle, by the one player. */
  helped?: number[];
}

/** Everything public: the TV and every phone render this. */
export interface FandangoTableView {
  players: string[];
  size: number;
  count: number;
  startedAt: number;
  puzzles: Puzzle[];
  times: Record<string, number[]>;
  /** How many squares each player has filled on the board they're on (not where or with what). */
  drawn: Record<string, number>;
  /** Where they are: only when one person plays alone, so the room can watch. */
  live?: Record<string, number[]>;
  closesAt: number | null;
  over: boolean;
  /** Hint and Show a mistake are offered (alone, with hints on). */
  hints: boolean;
  /** Hints used on each puzzle. */
  helped: number[];
}

export interface FandangoPlayerView extends FandangoTableView {
  me: string;
  /** Your own marks, as the server last heard them. */
  mine: number[];
  /** Everyone's marks, once you've solved them all and are watching. */
  watching?: Record<string, number[]>;
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
export function since(t: FandangoTableView, id: string): number {
  const times = t.times[id] ?? [];
  return times.length ? times[times.length - 1]! : t.startedAt;
}

/** Players best first: most solved, then soonest to get there. */
export function ranking(t: Pick<FandangoTableView, 'players' | 'times' | 'startedAt'>): string[] {
  const solved = (id: string) => t.times[id]?.length ?? 0;
  const last = (id: string) => t.times[id]?.at(-1) ?? Infinity;
  return [...t.players].sort((a, b) => solved(b) - solved(a) || last(a) - last(b));
}

function tableView(s: FandangoState): FandangoTableView {
  return {
    players: s.players,
    size: s.size,
    count: s.count,
    startedAt: s.startedAt,
    puzzles: s.puzzles,
    times: s.times,
    drawn: Object.fromEntries(s.players.map((id) => [id, filled(s.live?.[id])])),
    ...(s.players.length === 1 ? { live: s.live ?? {} } : {}),
    closesAt: s.closesAt,
    over: s.over,
    hints: s.hints ?? false,
    helped: s.helped ?? [],
  };
}

/** Squares filled in by the player (the ones that came filled in don't count). */
function filled(cells: readonly number[] | undefined): number {
  return cells?.filter((v) => v).length ?? 0;
}

/** A finished board, a row at a time: suns and moons, empty squares dotted. */
const boardText = (cells: number[], size: number) =>
  Array.from({ length: size }, (_, r) =>
    cells
      .slice(r * size, (r + 1) * size)
      .map((v) => (v === SUN ? '☀' : v === MOON ? '☾' : '·'))
      .join(''),
  ).join(' / ');

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The result from the puzzles solved so far. Null while nobody has solved one. */
function resultFrom(s: FandangoState, early: boolean): GameResult | null {
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
  const used = (s.helped ?? []).reduce((a, b) => a + b, 0);
  const summary = solo
    ? `${all ? 'Solved' : 'Got through'} ${plural(solved, 'puzzle')} in ${clock(took(best))}${used ? `, ${plural(used, 'hint')}` : ''}`
    : `${solved} of ${s.count} solved in ${clock(took(best))}${winners.length > 1 ? ', a tie' : ''}`;
  const reveal: FandangoReveal = {
    size: s.size,
    count: s.count,
    startedAt: s.startedAt,
    order,
    times: s.times,
    helped: s.helped ?? [],
    puzzles: s.puzzles.map((p) => ({ ...p, answer: answerOf(p) })),
  };
  return {
    winners: solo && !all && early ? [] : winners,
    summary,
    reveal,
    recap: s.recap,
    roundName: 'Puzzle',
    stats: {
      columns: ['Solved', 'Time', 'Fastest'],
      rows: order.map((id) => {
        const times = s.times[id] ?? [];
        const gaps = times.map((at, i) => at - (i === 0 ? s.startedAt : times[i - 1]!));
        return {
          playerId: id,
          values: [
            `${times.length} of ${s.count}`,
            times.length ? clock(took(id)) : '-',
            gaps.length ? clock(Math.min(...gaps)) : '-',
          ],
        };
      }),
    },
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
function fastest(s: FandangoState): Highlight[] {
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

export interface FandangoReveal {
  size: number;
  count: number;
  startedAt: number;
  order: string[];
  times: Record<string, number[]>;
  puzzles: (Puzzle & { answer: number[] })[];
  /** Hints used on each puzzle, when someone played alone. */
  helped: number[];
}

const keyOf = (p: Puzzle) =>
  `${p.size}:${p.given.join('')}:${p.signs.map((g) => `${g.a}${g.same ? '=' : 'x'}${g.b}`).join(',')}`;

const answers = new Map<string, { answer: number[]; order: number[] }>();

/** The puzzle's one answer and the order reasoning finds it in, remembered for the bots. */
function worked(p: Puzzle) {
  const key = keyOf(p);
  let found = answers.get(key);
  if (!found) {
    found = { answer: solve(p, 1)[0] ?? [], order: deduce(p)?.order ?? [] };
    if (answers.size > 200) answers.clear();
    answers.set(key, found);
  }
  return found;
}

/** The puzzle's one answer. */
export function answerOf(p: Puzzle): number[] {
  return worked(p).answer;
}

/**
 * How long a bot takes on a puzzle, in ms: about nine tenths of a second a square at Normal (a
 * 6×6 in half a minute), longer at Easy, quicker at Hard, and different each puzzle so a race
 * stays close.
 */
export function botSolveMs(size: number, level: BotLevel, key: string): number {
  const perSquare: Record<BotLevel, number> = { easy: 1500, normal: 900, hard: 500 };
  const swing = 0.75 + botFate(key).next() * 0.5;
  return Math.round(size * size * perSquare[level] * swing);
}

/** How often a bot puts a wrong mark down for a moment, by level. */
const BOT_SLIP: Record<BotLevel, number> = { easy: 0.3, normal: 0.15, hard: 0.04 };

/**
 * A bot's marks `elapsed` ms into a puzzle it takes `total` to solve: the squares in the order
 * reasoning finds them, slowly at first and faster as the board fills. Now and then the next
 * square gets the wrong mark, put right a step later.
 */
export function botMarks(
  p: Puzzle,
  elapsed: number,
  total: number,
  level: BotLevel,
  key: string,
): number[] {
  const { answer, order } = worked(p);
  const n = order.length;
  const f = Math.min(1, Math.max(0, elapsed / total));
  const m = Math.min(n - 1, Math.floor(n * f ** 1.1));
  const cells = new Array<number>(p.size * p.size).fill(0);
  for (const cell of order.slice(0, m)) cells[cell] = answer[cell]!;
  const next = order[m];
  if (m > 0 && next !== undefined && botFate(`${key}:${m}`).next() < BOT_SLIP[level])
    cells[next] = 3 - answer[next]!;
  return cells;
}

export const fandango: GameModule<
  FandangoState,
  FandangoAction,
  FandangoPlayerView,
  FandangoTableView,
  FandangoOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: (n) => ({ board: '6×6', puzzles: n === 1 ? 1 : 5, hints: true }),

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
      live: Object.fromEntries(playerIds.map((id) => [id, []])),
      closesAt: null,
      over: false,
      recap: [],
      hints: options.hints && playerIds.length === 1,
      helped: [],
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
      mine: s.live?.[me] ?? [],
      ...(index >= s.count ? { watching: s.live ?? {} } : {}),
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
    if (action.type === 'hint') {
      if (!s.hints) throw new GameError('NO_HINTS', 'Hints are only for playing alone.');
      const was = s.helped ?? [];
      const helped = Array.from({ length: Math.max(was.length, index + 1) }, (_, i) => was[i] ?? 0);
      helped[index]! += 1;
      return { ...s, helped };
    }
    const puzzle = s.puzzles[index]!;
    if (action.type === 'progress') {
      // Kept without the squares that came filled in, so `drawn` counts only the player's own.
      const cells = puzzle.given.map((g, i) => (g ? 0 : (action.cells[i] ?? 0)));
      const was = s.live?.[playerId] ?? [];
      if (cells.every((v, i) => v === (was[i] ?? 0))) return s;
      return { ...s, live: { ...s.live, [playerId]: cells } };
    }
    const wrong = checkBoard(puzzle, action.cells);
    if (wrong) throw new GameError('NOT_SOLVED', wrong);

    const mine = [...s.times[playerId]!, now];
    const times = { ...s.times, [playerId]: mine };
    const boards = { ...s.boards, [playerId]: [...s.boards[playerId]!, [...action.cells]] };
    const puzzles =
      mine.length < s.count && mine.length === s.puzzles.length
        ? [...s.puzzles, makePuzzle(s.size, rng)]
        : s.puzzles;
    const ms = now - (index === 0 ? s.startedAt : s.times[playerId]![index - 1]!);
    const done = s.players.filter((id) => times[id]!.length === s.count);
    const over = done.length === s.players.length;
    // Where they came on this puzzle, and whether that took the lead in the race.
    const place = s.players.filter((id) => (s.times[id]?.length ?? 0) > index).length + 1;
    const topBefore = ranking(s)[0]!;
    const topAfter = ranking({ players: s.players, times, startedAt: s.startedAt })[0]!;
    const hints = s.helped?.[index] ?? 0;
    const events: RecapEvent[] = [
      {
        round: index + 1,
        actor: playerId,
        text: `{${playerId}} solved puzzle ${index + 1} in ${clock(ms)}`,
        secret: `Board: ${boardText(action.cells, s.size)}${hints ? `, with ${plural(hints, 'hint')}` : ''}`,
        tag: s.players.length > 1 ? ordinal(place) : clock(ms),
        tone: place === 1 ? 'good' : undefined,
        key: mine.length === s.count && done.length === 1 && s.players.length > 1,
      },
    ];
    if (topAfter !== topBefore && (s.times[topBefore]?.length ?? 0) > 0)
      events.push({
        round: index + 1,
        actor: topAfter,
        text: `{${topAfter}} took the lead from {${topBefore}}.`,
        tag: 'Lead',
        tone: 'good',
        key: true,
      });
    if (s.closesAt === null && !over && done.length > 0)
      events.push({
        round: index + 1,
        text: `{${playerId}} finished all ${s.count}, so everyone else has two minutes.`,
        tag: 'Last call',
        key: true,
      });
    return {
      ...s,
      times,
      boards,
      live: { ...s.live, [playerId]: [] },
      puzzles,
      over,
      closesAt: over ? null : (s.closesAt ?? (done.length > 0 ? now + CLOSE_MS : null)),
      recap: [...s.recap, ...events],
    };
  },

  nextTimer: (s) => (s.closesAt !== null && !s.over ? { id: 'close', at: s.closesAt } : null),
  onTimer: (s, id, _rng, now) =>
    id === 'close' && s.closesAt !== null && now >= s.closesAt && !s.over
      ? {
          ...s,
          over: true,
          closesAt: null,
          recap: [
            ...s.recap,
            {
              text: 'Time ran out for everyone still going.',
              secret: s.players
                .filter((id) => (s.times[id]?.length ?? 0) < s.count)
                .map(
                  (id) =>
                    `{${id}} was on puzzle ${(s.times[id]?.length ?? 0) + 1} with ${plural(filled(s.live?.[id]), 'square')} filled`,
                )
                .join('; '),
              tag: 'Time',
              tone: 'bad',
            },
          ],
        }
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

  // Short, so a bot's board keeps filling while people are busy sending theirs.
  botDelayMs: 300,
  bot({ view, playerId, now, level }) {
    if (view.over || !view.puzzle) return null;
    const key = `${playerId}:${view.index}:${view.startedAt}`;
    const total = botSolveMs(view.size, level, key);
    if (now >= view.since + total) {
      const answer = answerOf(view.puzzle);
      if (!answer.length) return null;
      return { type: 'solve', puzzle: view.index, cells: answer };
    }
    const cells = botMarks(view.puzzle, now - view.since, total, level, key);
    const same = cells.every((v, i) => v === (view.mine[i] ?? 0));
    return same ? null : { type: 'progress', puzzle: view.index, cells };
  },
};
