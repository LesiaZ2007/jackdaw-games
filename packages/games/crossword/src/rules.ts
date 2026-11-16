import { GameError, type GameModule, type GameResult } from '@jackdaw/engine';
import { z } from 'zod';
import { PUZZLES } from '#puzzles';
import { gridClues, type Clue, type Direction, type Puzzle } from './grid';
import { meta } from './meta';
export const optionsSchema = z.object({
  puzzle: z.enum(['random', 'ink', 'camp', 'post']),
  help: z.boolean(),
});
export type CrosswordOptions = z.infer<typeof optionsSchema>;
const cell = z.number().int().min(0).max(224);
const direction = z.enum(['across', 'down']);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('edit'),
    cell,
    letter: z.string().regex(/^[A-Z]?$/),
    revision: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('focus'), cell, direction }),
  z.object({
    type: z.literal('check'),
    cell,
    direction,
    scope: z.enum(['letter', 'word', 'puzzle']),
  }),
  z.object({ type: z.literal('reveal'), cell, direction, scope: z.enum(['letter', 'word']) }),
]);
export type CrosswordAction = z.infer<typeof actionSchema>;
export interface Cursor {
  cell: number;
  direction: Direction;
  at: number;
}
export interface CrosswordState {
  players: string[];
  puzzle: Puzzle;
  help: boolean;
  letters: string[];
  revisions: number[];
  authors: (string | null)[];
  cursors: Record<string, Cursor>;
  errors: number[];
  revealed: number[];
  checks: number;
  startedAt: number;
  finishedAt: number | null;
  notice: string;
}
export interface CrosswordView {
  players: string[];
  title: string;
  author: string;
  puzzleId: string;
  width: number;
  blocks: boolean[];
  clues: Clue[];
  letters: string[];
  revisions: number[];
  authors: (string | null)[];
  cursors: Record<string, Cursor>;
  errors: number[];
  revealed: number[];
  checks: number;
  help: boolean;
  startedAt: number;
  finishedAt: number | null;
  notice: string;
}
function tableView(s: CrosswordState): CrosswordView {
  return {
    players: s.players,
    title: s.puzzle.title,
    author: s.puzzle.author,
    puzzleId: s.puzzle.id,
    width: s.puzzle.rows[0]!.length,
    blocks: [...s.puzzle.rows.join('')].map((c) => c === '#'),
    clues: gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down),
    letters: s.letters,
    revisions: s.revisions,
    authors: s.authors,
    cursors: s.cursors,
    errors: s.errors,
    revealed: s.revealed,
    checks: s.checks,
    help: s.help,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    notice: s.notice,
  };
}
function result(s: CrosswordState): GameResult {
  const seconds = Math.max(0, Math.floor(((s.finishedAt ?? s.startedAt) - s.startedAt) / 1000));
  return {
    winners: s.players,
    standings: s.players.map((playerId) => ({ playerId, outcome: 'win', team: 'Together' })),
    summary:
      'Solved together in ' +
      Math.floor(seconds / 60) +
      ':' +
      String(seconds % 60).padStart(2, '0') +
      ' · ' +
      s.checks +
      ' checks · ' +
      s.revealed.length +
      ' letters revealed.',
    reveal: tableView(s),
    recap: [
      {
        text:
          'Completed “' +
          s.puzzle.title +
          '” together. ' +
          s.checks +
          ' checks; ' +
          s.revealed.length +
          ' letters revealed.',
      },
    ],
  };
}
export const crossword: GameModule<
  CrosswordState,
  CrosswordAction,
  CrosswordView,
  CrosswordView,
  CrosswordOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({ puzzle: 'random', help: true }),
  setup({ playerIds, options, rng, now }) {
    const puzzle =
      options.puzzle === 'random'
        ? rng.pick(PUZZLES)
        : PUZZLES.find((p) => p.id === options.puzzle)!;
    const length = puzzle.rows.join('').length;
    return {
      players: [...playerIds],
      puzzle,
      help: options.help,
      letters: Array<string>(length).fill(''),
      revisions: Array<number>(length).fill(0),
      authors: Array<string | null>(length).fill(null),
      cursors: {},
      errors: [],
      revealed: [],
      checks: 0,
      startedAt: now,
      finishedAt: null,
      notice: 'Choose a clue and put your heads together.',
    };
  },
  getPlayerView: (s) => tableView(s),
  getTableView: tableView,
  applyAction(s, playerId, input, _rng, now) {
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw new GameError('BAD_ACTION', 'Choose a square and enter one letter.');
    const action = parsed.data;
    if (!s.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', 'Join the table to solve.');
    if (s.finishedAt !== null) throw new GameError('GAME_OVER', 'This crossword is complete.');
    const solution = [...s.puzzle.rows.join('')];
    if (action.cell >= solution.length || solution[action.cell] === '#')
      throw new GameError('BAD_CELL', 'Choose a white square.');
    if (action.type === 'focus')
      return {
        ...s,
        cursors: {
          ...s.cursors,
          [playerId]: { cell: action.cell, direction: action.direction, at: now },
        },
      };
    let next: CrosswordState = {
      ...s,
      letters: [...s.letters],
      revisions: [...s.revisions],
      authors: [...s.authors],
    };
    if (action.type === 'edit') {
      if (s.revealed.includes(action.cell))
        throw new GameError('REVEALED', 'That letter has been revealed.');
      if (action.revision !== s.revisions[action.cell])
        throw new GameError(
          'STALE_CELL',
          'A teammate just changed that square. Check their letter and try again.',
        );
      next.letters[action.cell] = action.letter;
      next.revisions[action.cell] = s.revisions[action.cell]! + 1;
      next.cursors = {
        ...s.cursors,
        [playerId]: {
          cell: action.cell,
          direction: s.cursors[playerId]?.direction ?? 'across',
          at: now,
        },
      };
      next.authors[action.cell] = action.letter ? playerId : null;
      next.errors = s.errors.filter((i) => i !== action.cell);
      next.notice = '';
    } else {
      if (!s.help) throw new GameError('HELP_OFF', 'Checks and reveals are off for this puzzle.');
      const clue = gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down).find(
        (c) => c.direction === action.direction && c.cells.includes(action.cell),
      )!;
      const cells =
        action.scope === 'puzzle'
          ? solution.flatMap((c, i) => (c === '#' ? [] : [i]))
          : action.scope === 'word'
            ? clue.cells
            : [action.cell];
      if (action.type === 'check') {
        const wrong = cells.filter((i) => s.letters[i] && s.letters[i] !== solution[i]);
        next.errors = [...new Set([...s.errors.filter((i) => !cells.includes(i)), ...wrong])];
        next.checks++;
        next.notice = wrong.length
          ? wrong.length +
            ' incorrect ' +
            (wrong.length === 1 ? 'letter' : 'letters') +
            ' marked ×.'
          : cells.every((i) => s.letters[i])
            ? 'Those letters are correct.'
            : 'The filled letters are correct. Some squares are still empty.';
      } else {
        const revealed = new Set(s.revealed);
        for (const i of cells) {
          if (s.letters[i] === solution[i]) continue;
          next.letters[i] = solution[i]!;
          next.revisions[i] = s.revisions[i]! + 1;
          next.authors[i] = null;
          revealed.add(i);
        }
        next.revealed = [...revealed];
        next.errors = s.errors.filter((i) => !cells.includes(i));
        next.notice = 'Revealed letters are underlined. They stay in the grid.';
      }
    }
    if (solution.every((letter, i) => letter === '#' || next.letters[i] === letter))
      next = {
        ...next,
        finishedAt: now,
        errors: [],
        notice: 'Crossword complete. You solved it together!',
      };
    else if (solution.every((letter, i) => letter === '#' || next.letters[i]))
      next.notice = 'The grid is full, but something is not quite right. Revisit your crossings.';
    return next;
  },
  getResult: (s) => (s.finishedAt === null ? null : result(s)),
  announce: (prev, next) =>
    !prev
      ? ['“' + next.puzzle.title + '”: one crossword for the whole table.']
      : next.finishedAt !== null && prev.finishedAt === null
        ? ['Crossword complete. Solved together!']
        : [],
};
