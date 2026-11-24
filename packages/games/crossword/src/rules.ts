import {
  GameError,
  buildStory,
  type GameModule,
  type GameResult,
  type GameStory,
  type StoryFact,
  type StoryHeadline,
} from '@jackdaw/engine';
import { z } from 'zod';
import { PUZZLES, generatePuzzle, withDifficulty } from '#puzzles';
import { crosswordBot } from './bot';
import { gridClues, type Clue, type Direction, type Puzzle } from './grid';
import { meta } from './meta';
export const optionsSchema = z.object({
  puzzle: z.enum(['random', 'ink', 'camp', 'post']),
  help: z.boolean(),
  size: z.enum(['mini', 'standard', 'large', 'extraLarge', 'sunday', 'giant']),
  mode: z.enum(['cooperative', 'race']),
  difficulty: z.enum(['easy', 'normal', 'hard']).default('normal').describe('Puzzle difficulty'),
});
export type CrosswordOptions = z.input<typeof optionsSchema>;
const cell = z.number().int().min(0).max(960);
const direction = z.enum(['across', 'down']);
const letter = z.string().regex(/^[A-Z]?$/);
const revision = z.number().int().nonnegative();
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit'), cell, letter, revision, direction: direction.optional() }),
  /** Several squares typed while the previous save was in flight, applied in order as one write. */
  z.object({
    type: z.literal('fill'),
    edits: z.array(z.object({ cell, letter, revision })).min(1).max(64),
    direction: direction.optional(),
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
  mode: 'cooperative' | 'race';
  boards: Record<string, BoardState>;
  winner: string | null;
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
type BoardState = Pick<
  CrosswordState,
  'letters' | 'revisions' | 'authors' | 'errors' | 'revealed' | 'checks' | 'notice'
>;
function boardState(s: CrosswordState): BoardState {
  return {
    letters: [...s.letters],
    revisions: [...s.revisions],
    authors: [...s.authors],
    errors: [...s.errors],
    revealed: [...s.revealed],
    checks: s.checks,
    notice: s.notice,
  };
}
export interface CrosswordView {
  mode: 'cooperative' | 'race';
  progress: Record<string, number>;
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
function tableView(s: CrosswordState, playerId?: string): CrosswordView {
  const board =
    s.mode === 'race'
      ? ((playerId ? s.boards[playerId] : s.winner ? s.boards[s.winner] : null) ?? s)
      : s;
  return {
    mode: s.mode ?? 'cooperative',
    progress: Object.fromEntries(
      s.players.map((id) => [
        id,
        (s.mode === 'race' ? s.boards[id]! : s).letters.filter(Boolean).length,
      ]),
    ),
    players: s.players,
    title: s.puzzle.title,
    author: s.puzzle.author,
    puzzleId: s.puzzle.id,
    width: s.puzzle.rows[0]!.length,
    blocks: [...s.puzzle.rows.join('')].map((c) => c === '#'),
    clues: gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down),
    letters: board.letters,
    revisions: board.revisions,
    authors: board.authors,
    cursors: s.cursors,
    errors: board.errors,
    revealed: board.revealed,
    checks: board.checks,
    help: s.help,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    notice: board.notice,
  };
}
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The stats page: who filled how much, who finished the most words, and what help was used. */
function crosswordStory(s: CrosswordState, seconds: number): GameStory | undefined {
  const race = s.mode === 'race';
  const board = race ? (s.boards[s.winner ?? '']?.letters ? s.boards[s.winner!]! : s) : s;
  const clues = gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down);
  const squares = s.puzzle.rows.join('').replace(/#/g, '').length;
  const headlines: StoryHeadline[] = [
    { label: race ? 'Winning time' : 'Time to solve', value: clock(seconds) },
    { label: 'Squares', value: String(squares), detail: `${plural(clues.length, 'clue')}` },
  ];
  const facts: StoryFact[] = [];
  const bars: GameStory['bars'] = [];
  const checks = board.checks ?? 0;
  const revealed = board.revealed?.length ?? 0;
  if (race) {
    const filled = (id: string) => (s.boards[id]?.letters ?? []).filter(Boolean).length;
    bars.push({
      title: 'Squares filled',
      rows: [...s.players]
        .sort((a, b) => filled(b) - filled(a))
        .map((id) => ({ playerId: id, value: filled(id) })),
    });
    if (s.winner) {
      const second = [...s.players]
        .filter((id) => id !== s.winner)
        .sort((a, b) => filled(b) - filled(a))[0];
      if (second && squares - filled(second) <= 3 && squares - filled(second) > 0)
        facts.push({
          label: 'Photo finish',
          text: `{${second}} was just ${plural(squares - filled(second), 'square')} short when {${s.winner}} finished.`,
          playerIds: [s.winner, second],
        });
    }
  } else {
    const count: Record<string, number> = {};
    for (const a of board.authors) if (a) count[a] = (count[a] ?? 0) + 1;
    const ranked = s.players.map((id) => ({ id, n: count[id] ?? 0 })).sort((a, b) => b.n - a.n);
    bars.push({
      title: 'Squares filled',
      rows: ranked.map((r) => ({ playerId: r.id, value: r.n })),
    });
    const top = ranked[0];
    if (top && top.n > 0 && s.players.length > 1) {
      const total = ranked.reduce((a, r) => a + r.n, 0);
      headlines.push({
        label: 'Most squares',
        value: String(top.n),
        detail: `{${top.id}}, ${Math.round((top.n / total) * 100)}% of the typing`,
        playerId: top.id,
      });
    }
    // A clue goes to whoever typed most of its squares.
    const wins: Record<string, number> = {};
    for (const c of clues) {
      const mine: Record<string, number> = {};
      for (const i of c.cells) {
        const a = board.authors[i];
        if (a) mine[a] = (mine[a] ?? 0) + 1;
      }
      const best = Object.entries(mine).sort((a, b) => b[1] - a[1])[0];
      if (best && best[1] * 2 > c.cells.length) wins[best[0]] = (wins[best[0]] ?? 0) + 1;
    }
    const clueRank = s.players.map((id) => ({ id, n: wins[id] ?? 0 })).sort((a, b) => b.n - a.n);
    if (clueRank.length > 1) {
      bars.push({
        title: 'Clues mostly filled',
        rows: clueRank.map((r) => ({ playerId: r.id, value: r.n })),
      });
      const c = clueRank[0]!;
      if (c.n >= 3)
        facts.push({
          label: 'Clue master',
          text: `{${c.id}} filled most of the squares in ${plural(c.n, 'clue')}.`,
          playerIds: [c.id],
          tone: 'good',
        });
    }
    if (top && s.players.length > 1 && top.n > 0) {
      const second = ranked[1]!;
      if (second.n === 0)
        facts.push({
          label: 'Solo run',
          text: `{${top.id}} typed every letter.`,
          playerIds: [top.id],
        });
      else if (top.n >= second.n * 2 && top.n >= 10)
        facts.push({
          label: 'Carried',
          text: `{${top.id}} typed ${top.n} squares to {${second.id}}'s ${second.n}.`,
          playerIds: [top.id, second.id],
        });
    }
  }
  const longest = [...clues].sort((a, b) => b.cells.length - a.cells.length)[0];
  if (longest && longest.cells.length >= 7)
    facts.push({
      label: 'Longest word',
      text: `The longest answer was ${longest.cells.length} letters: ${longest.number} ${longest.direction}.`,
    });
  if (s.help) {
    if (checks + revealed > 0)
      headlines.push({ label: 'Help used', value: String(checks + revealed) });
    if (checks === 0 && revealed === 0)
      facts.push({
        label: 'No help',
        text: race
          ? 'The winning grid used no checks and no reveals.'
          : 'Solved without a single check or reveal.',
        tone: 'good',
      });
    else
      facts.push({
        label: 'Help used',
        text: `${plural(checks, 'check')} and ${plural(revealed, 'revealed letter')}.`,
      });
  }
  if (seconds > 0 && seconds <= 120 && squares >= 20)
    facts.push({
      label: 'Quick work',
      text: `Done in ${clock(seconds)}.`,
      tone: 'good',
    });
  return buildStory({ headlines, bars, facts });
}

function result(s: CrosswordState): GameResult {
  const seconds = Math.max(0, Math.floor(((s.finishedAt ?? s.startedAt) - s.startedAt) / 1000));
  return {
    winners: s.mode === 'race' ? [s.winner!] : s.players,
    standings: s.players.map((playerId) => ({
      playerId,
      outcome: s.mode === 'race' && playerId !== s.winner ? 'loss' : 'win',
      team: s.mode === 'race' ? undefined : 'Together',
    })),
    summary:
      (s.mode === 'race' ? 'First correct finish in ' : 'Solved together in ') +
      Math.floor(seconds / 60) +
      ':' +
      String(seconds % 60).padStart(2, '0') +
      ' · ' +
      s.checks +
      ' checks · ' +
      s.revealed.length +
      ' letters revealed.',
    reveal: tableView(s),
    story: crosswordStory(s, seconds),
    recap: [
      {
        text:
          'Completed “' +
          s.puzzle.title +
          (s.mode === 'race' ? '” won by the first correct finisher. ' : '” together. ') +
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
  defaultOptions: () => ({
    puzzle: 'random',
    size: 'standard',
    mode: 'cooperative',
    help: true,
    difficulty: 'normal',
  }),
  validateOptions: (options, count) =>
    options.mode === 'race' && count < 2
      ? 'Race needs at least two players.'
      : options.puzzle !== 'random' && options.size !== 'mini'
        ? 'The named puzzles are 5 × 5. Choose Random for larger sizes.'
        : null,
  setup({ playerIds, options, rng, now }) {
    const puzzle =
      options.puzzle === 'random'
        ? generatePuzzle(
            { mini: 5, standard: 9, large: 13, extraLarge: 17, sunday: 21, giant: 31 }[
              options.size
            ],
            rng,
            options.difficulty ?? 'normal',
          )
        : withDifficulty(
            PUZZLES.find((p) => p.id === options.puzzle)!,
            options.difficulty ?? 'normal',
          );
    const length = puzzle.rows.join('').length;
    const initial: CrosswordState = {
      mode: options.mode,
      boards: {},
      winner: null,
      players: [...playerIds],
      puzzle,
      help: options.help && options.mode !== 'race',
      letters: Array<string>(length).fill(''),
      revisions: Array<number>(length).fill(0),
      authors: Array<string | null>(length).fill(null),
      cursors: {},
      errors: [],
      revealed: [],
      checks: 0,
      startedAt: now,
      finishedAt: null,
      notice:
        options.mode === 'race'
          ? 'Same puzzle, separate grids. First correct finish wins.'
          : 'Choose a clue and put your heads together.',
    };
    if (options.mode === 'race')
      initial.boards = Object.fromEntries(playerIds.map((id) => [id, boardState(initial)]));
    return initial;
  },
  getPlayerView: (s, id) => tableView(s, id),
  getTableView: tableView,
  applyAction(s, playerId, input, _rng, now) {
    const parsed = actionSchema.safeParse(input);
    if (!parsed.success) throw new GameError('BAD_ACTION', 'Choose a square and enter one letter.');
    const action = parsed.data;
    if (!s.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', 'Join the table to solve.');
    if (s.finishedAt !== null) throw new GameError('GAME_OVER', 'This crossword is complete.');
    const root = s;
    if (s.mode === 'race') s = { ...s, ...s.boards[playerId]! };
    const solution = [...s.puzzle.rows.join('')];
    for (const target of action.type === 'fill' ? action.edits.map((e) => e.cell) : [action.cell])
      if (target >= solution.length || solution[target] === '#')
        throw new GameError('BAD_CELL', 'Choose a white square.');
    if (action.type === 'focus')
      return {
        ...root,
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
    if (action.type === 'edit' || action.type === 'fill') {
      const edits = action.type === 'fill' ? action.edits : [action];
      for (const e of edits) {
        if (s.revealed.includes(e.cell))
          throw new GameError('REVEALED', 'That letter has been revealed.');
        if (e.revision !== next.revisions[e.cell])
          throw new GameError(
            'STALE_CELL',
            s.mode === 'race'
              ? 'That square changed. Try again.'
              : 'A teammate just changed that square. Check their letter and try again.',
          );
        next.letters[e.cell] = e.letter;
        next.revisions[e.cell] = next.revisions[e.cell]! + 1;
        next.authors[e.cell] = e.letter ? playerId : null;
      }
      const last = edits[edits.length - 1]!.cell;
      next.cursors = {
        ...s.cursors,
        [playerId]: {
          cell: last,
          direction: action.direction ?? s.cursors[playerId]?.direction ?? 'across',
          at: now,
        },
      };
      next.errors = s.errors.filter((i) => !edits.some((e) => e.cell === i));
      next.notice = '';
    } else {
      if (!s.help) throw new GameError('HELP_OFF', 'Checks and reveals are off for this puzzle.');
      const clue =
        gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down).find(
          (c) => c.direction === action.direction && c.cells.includes(action.cell),
        ) ??
        gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down).find((c) =>
          c.cells.includes(action.cell),
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
        const before = revealed.size;
        for (const i of cells) {
          if (s.letters[i] === solution[i]) continue;
          next.letters[i] = solution[i]!;
          next.revisions[i] = s.revisions[i]! + 1;
          next.authors[i] = null;
          revealed.add(i);
        }
        next.revealed = [...revealed];
        next.errors = s.errors.filter((i) => !cells.includes(i));
        next.notice =
          revealed.size > before
            ? 'Revealed letters are underlined. They stay in the grid.'
            : action.scope === 'letter'
              ? 'That letter is already correct.'
              : 'Those letters are already correct.';
      }
    }
    if (solution.every((letter, i) => letter === '#' || next.letters[i] === letter))
      next = {
        ...next,
        finishedAt: now,
        errors: [],
        notice:
          s.mode === 'race'
            ? 'Crossword complete. Yours was the first correct grid!'
            : 'Crossword complete. You solved it together!',
      };
    else if (solution.every((letter, i) => letter === '#' || next.letters[i]))
      next.notice = 'The grid is full, but something is not quite right. Revisit your crossings.';
    if (root.mode === 'race')
      return {
        ...root,
        cursors: next.cursors,
        boards: { ...root.boards, [playerId]: boardState(next) },
        finishedAt: next.finishedAt,
        winner: next.finishedAt !== null ? playerId : null,
        notice:
          next.finishedAt !== null ? 'Race complete. The first correct grid wins.' : root.notice,
      };
    return next;
  },
  bot: crosswordBot,
  botDelayMs: 1500,
  realTime: true,
  getResult: (s) => (s.finishedAt === null ? null : result(s)),
  announce: (prev, next) =>
    !prev
      ? [
          '“' +
            next.puzzle.title +
            '”: ' +
            (next.mode === 'race'
              ? 'a race on identical separate grids.'
              : 'one crossword for the whole table.'),
        ]
      : next.finishedAt !== null && prev.finishedAt === null
        ? [
            next.mode === 'race'
              ? 'Crossword race complete!'
              : 'Crossword complete. Solved together!',
          ]
        : [],
};
