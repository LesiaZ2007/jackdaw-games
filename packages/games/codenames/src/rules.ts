import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { codenamesBot } from './bot';
import { meta } from './meta';
import { other, place, TEAM_NAME, TEAMS, type Team } from './teams';
import { WORDS } from './words';

/**
 * Codenames for 4–15 players in two teams. 25 words; only the spymasters see which belong to
 * which team (the key: 9 for the starting team, 8 for the other, 7 bystanders and 1 assassin).
 * A spymaster gives one word and a number; their operatives guess up to that many words plus one.
 * A bystander or the other team's word ends the turn, the assassin loses the game, and the first
 * team to find all its words wins.
 *
 * Guessing: any operative taps a word to suggest it (everyone sees suggestions). It's guessed when
 * a majority of the team's operatives suggest it, or as soon as one of them holds it to confirm.
 */

export { TEAMS, type Team } from './teams';
export type Card = Team | 'bystander' | 'assassin';
export const BOARD_SIZE = 25;
/** Clue numbers run 0–9; `null` is "unlimited". */
export const MAX_CLUE = 9;

export const optionsSchema = z.object({
  /** Player id -> team, as the host arranged it. Players not here are placed at the start. */
  teams: z.record(z.string(), z.enum(TEAMS)),
  /** The host's choice of spymaster for each team. */
  spymasters: z.object({ red: z.string().optional(), blue: z.string().optional() }),
  /** Even out the teams at the start (moving operatives, never a chosen spymaster). */
  balance: z.boolean(),
  /** Draw each team's spymaster at random every game, instead of the host's picks. */
  newSpymasters: z.boolean(),
});
export type CodenamesOptions = z.infer<typeof optionsSchema>;

const cleanWord = (w: string) => w.trim().toUpperCase();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('clue'),
    word: z.string().max(40),
    /** 0–9, or null for unlimited. */
    count: z.number().int().min(0).max(MAX_CLUE).nullable(),
  }),
  /** Suggest a word (or `null` to take your suggestion back). */
  z.object({ type: z.literal('suggest'), index: z.number().int().min(0).max(24).nullable() }),
  /** Hold to confirm: guess this word now. */
  z.object({ type: z.literal('guess'), index: z.number().int().min(0).max(24) }),
  z.object({ type: z.literal('pass') }),
]);
export type CodenamesAction = z.infer<typeof actionSchema>;

/** One guess, as everyone saw it. */
export interface Guess {
  index: number;
  card: Card;
  /** Who locked it in (the holder, or the last suggester to make a majority). */
  by: string;
}

export type TurnEnd = 'bystander' | 'other-team' | 'pass' | 'limit' | 'won' | 'assassin';

export interface Clue {
  team: Team;
  /** The spymaster who gave it. */
  by: string;
  word: string;
  count: number | null;
  /** The clue is one of the words on the board (allowed, but flagged to everyone). */
  onBoard: boolean;
  guesses: Guess[];
  ended: TurnEnd | null;
}

export interface CodenamesState {
  players: string[];
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
  starting: Team;
  words: string[];
  /** The key. Never leaves the server except to spymasters, and to everyone once it's over. */
  key: Card[];
  revealed: boolean[];
  turn: Team;
  phase: 'clue' | 'guess' | 'over';
  /** Every clue given, the current one last. */
  clues: Clue[];
  /** Guesses left this turn, or null for unlimited. */
  guessesLeft: number | null;
  /** Operative id -> the word they're suggesting. */
  suggestions: Record<string, number>;
  /** Total guesses made, a public counter that moves on with every reveal. */
  guessCount: number;
  winner: Team | null;
  /** How it was won: all words found, or the other team found the assassin. */
  how: 'words' | 'assassin' | null;
  recap: RecapEvent[];
}

/** Everything public: the TV and every phone render this. No unrevealed colours. */
export interface CodenamesTableView {
  players: string[];
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
  starting: Team;
  words: string[];
  /** The colour of each revealed word; null while it's still hidden. */
  revealed: (Card | null)[];
  turn: Team;
  phase: CodenamesState['phase'];
  clues: Clue[];
  guessesLeft: number | null;
  suggestions: Record<string, number>;
  guessCount: number;
  /** Words each team still has to find. */
  left: Record<Team, number>;
  winner: Team | null;
  how: CodenamesState['how'];
}

export interface CodenamesPlayerView extends CodenamesTableView {
  myTeam: Team | null;
  spymaster: boolean;
  /** The whole key, for spymasters only. */
  key: Card[] | null;
}

/** Each team's word count: the starting team has one more. */
export const teamSize = (team: Team, starting: Team) => (team === starting ? 9 : 8);

export function defaultOptions(): CodenamesOptions {
  return { teams: {}, spymasters: {}, balance: true, newSpymasters: false };
}

/** Lay out a board: 25 distinct words and a shuffled key. */
export function deal(rng: Rng, starting: Team): { words: string[]; key: Card[] } {
  const words = rng.shuffle(WORDS).slice(0, BOARD_SIZE);
  const key = rng.shuffle<Card>([
    ...Array<Card>(teamSize(starting, starting)).fill(starting),
    ...Array<Card>(teamSize(other(starting), starting)).fill(other(starting)),
    ...Array<Card>(7).fill('bystander'),
    'assassin',
  ]);
  return { words, key };
}

export const operatives = (
  state: Pick<CodenamesState, 'players' | 'teams' | 'spymasters'>,
  team: Team,
) => state.players.filter((id) => state.teams[id] === team && state.spymasters[team] !== id);

function left(state: CodenamesState, team: Team): number {
  return state.key.filter((c, i) => c === team && !state.revealed[i]).length;
}

function tableView(state: CodenamesState): CodenamesTableView {
  return {
    players: state.players,
    teams: state.teams,
    spymasters: state.spymasters,
    starting: state.starting,
    words: state.words,
    revealed: state.key.map((c, i) => (state.revealed[i] ? c : null)),
    turn: state.turn,
    phase: state.phase,
    clues: state.clues,
    guessesLeft: state.guessesLeft,
    suggestions: state.suggestions,
    guessCount: state.guessCount,
    left: { red: left(state, 'red'), blue: left(state, 'blue') },
    winner: state.winner,
    how: state.how,
  };
}

/** Why a clue can't be given, or null. One word: letters, with an inner hyphen or apostrophe. */
export function clueProblem(word: string): string | null {
  const w = cleanWord(word);
  if (!w) return 'Type a one-word clue.';
  if (/\s/.test(w)) return 'Clues are one word: no spaces.';
  if (w.length > 24) return 'That clue is too long.';
  if (!/^[A-Z]+(?:['-][A-Z]+)*$/.test(w)) return 'Use letters only in a clue.';
  return null;
}

/** Is the clue one of the board's words (or a plural of one)? Allowed, but everyone is warned. */
export function clueOnBoard(word: string, words: readonly string[]): boolean {
  const w = cleanWord(word);
  return words.some((b) => b === w || `${b}S` === w || `${w}S` === b);
}

function endTurn(state: CodenamesState, why: TurnEnd): CodenamesState {
  const clues = state.clues.map((c, i) =>
    i === state.clues.length - 1 ? { ...c, ended: why } : c,
  );
  return {
    ...state,
    clues,
    turn: other(state.turn),
    phase: 'clue',
    guessesLeft: null,
    suggestions: {},
  };
}

function reveal(state: CodenamesState, index: number, by: string): CodenamesState {
  const card = state.key[index]!;
  const team = state.turn;
  const revealed = state.revealed.map((r, i) => r || i === index);
  const clue = state.clues[state.clues.length - 1]!;
  const guess: Guess = { index, card, by };
  const clues = [...state.clues.slice(0, -1), { ...clue, guesses: [...clue.guesses, guess] }];
  let next: CodenamesState = {
    ...state,
    revealed,
    clues,
    suggestions: {},
    guessCount: state.guessCount + 1,
    recap: [
      ...state.recap,
      {
        actor: by,
        text: `${by} guessed ${state.words[index]}: ${card === 'bystander' ? 'a bystander' : card === 'assassin' ? 'the assassin' : `${TEAM_NAME[card as Team]}`}`,
        data: { kind: 'guess', team, ...guess, word: state.words[index] },
      },
    ],
  };

  const finish = (winner: Team, how: 'words' | 'assassin', why: TurnEnd): CodenamesState => ({
    ...endTurn(next, why),
    turn: team,
    phase: 'over',
    winner,
    how,
  });

  if (card === 'assassin') return finish(other(team), 'assassin', 'assassin');
  // Revealing a team's last word wins it for that team, whoever guessed it.
  for (const t of [team, other(team)] as const)
    if (card === t && left(next, t) === 0) return finish(t, 'words', 'won');
  if (card !== team) return endTurn(next, card === 'bystander' ? 'bystander' : 'other-team');

  const guessesLeft = next.guessesLeft === null ? null : next.guessesLeft - 1;
  next = { ...next, guessesLeft };
  return guessesLeft === 0 ? endTurn(next, 'limit') : next;
}

export const codenames: GameModule<
  CodenamesState,
  CodenamesAction,
  CodenamesPlayerView,
  CodenamesTableView,
  CodenamesOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,

  setup({ playerIds, options, rng }) {
    const { teams, spymasters } = place(
      playerIds,
      options,
      { balance: options.balance, fresh: options.newSpymasters },
      rng,
    );
    const starting = rng.pick(TEAMS);
    const { words, key } = deal(rng, starting);
    return {
      players: playerIds,
      teams,
      spymasters,
      starting,
      words,
      key,
      revealed: Array<boolean>(BOARD_SIZE).fill(false),
      turn: starting,
      phase: 'clue',
      clues: [],
      guessesLeft: null,
      suggestions: {},
      guessCount: 0,
      winner: null,
      how: null,
      recap: [
        {
          text: `${TEAM_NAME[starting]} goes first with 9 words to find; ${TEAM_NAME[other(starting)]} has 8.`,
          data: { kind: 'start', starting, teams, spymasters },
        },
      ],
    };
  },

  getPlayerView(state, playerId) {
    const myTeam = state.teams[playerId] ?? null;
    const spymaster = myTeam !== null && state.spymasters[myTeam] === playerId;
    return {
      ...tableView(state),
      myTeam,
      spymaster,
      key: spymaster || state.phase === 'over' ? state.key : null,
    };
  },
  getTableView: tableView,

  applyAction(state, playerId, action) {
    if (state.phase === 'over') throw new GameError('GAME_OVER', 'The game is over.');
    const team = state.teams[playerId];
    if (!team) throw new GameError('NOT_A_PLAYER', "You're not in this game.");
    const isSpymaster = state.spymasters[team] === playerId;
    const theirTurn = team === state.turn;

    if (action.type === 'clue') {
      if (!isSpymaster) throw new GameError('NOT_SPYMASTER', 'Only the spymaster gives clues.');
      if (!theirTurn || state.phase !== 'clue')
        throw new GameError('NOT_YOUR_TURN', "It isn't your team's turn to give a clue.");
      const problem = clueProblem(action.word);
      if (problem) throw new GameError('BAD_CLUE', problem);
      const word = cleanWord(action.word);
      const clue: Clue = {
        team,
        by: playerId,
        word,
        count: action.count,
        onBoard: clueOnBoard(
          word,
          state.words.filter((_, i) => !state.revealed[i]),
        ),
        guesses: [],
        ended: null,
      };
      return {
        ...state,
        phase: 'guess',
        clues: [...state.clues, clue],
        // Zero and unlimited both mean "as many as you dare"; otherwise the number plus one.
        guessesLeft: action.count ? action.count + 1 : null,
        suggestions: {},
        recap: [
          ...state.recap,
          {
            actor: playerId,
            text: `${TEAM_NAME[team]} clue: ${word} ${action.count ?? '∞'}`,
            data: { kind: 'clue', team, word, count: action.count },
          },
        ],
      };
    }

    // Guessing moves belong to the operatives of the team whose turn it is.
    if (isSpymaster) throw new GameError('SPYMASTER', 'Spymasters don’t guess.');
    if (!theirTurn) throw new GameError('NOT_YOUR_TURN', "It isn't your team's turn.");
    if (state.phase !== 'guess') throw new GameError('NO_CLUE', 'Wait for your spymaster’s clue.');

    if (action.type === 'pass') {
      // The rules ask operatives to make at least one guess before they stop.
      if (state.clues[state.clues.length - 1]!.guesses.length === 0)
        throw new GameError('GUESS_FIRST', 'Make at least one guess first.');
      return endTurn(state, 'pass');
    }

    const index = action.index;
    if (index !== null && state.revealed[index])
      throw new GameError('REVEALED', 'That word is already uncovered.');

    if (action.type === 'guess') return reveal(state, index!, playerId);

    // Suggest (or take it back by suggesting the same word again, or null).
    const suggestions = { ...state.suggestions };
    if (index === null || suggestions[playerId] === index) delete suggestions[playerId];
    else suggestions[playerId] = index;
    const ops = operatives(state, team);
    if (index !== null && suggestions[playerId] === index) {
      const backing = ops.filter((id) => suggestions[id] === index).length;
      if (backing * 2 > ops.length) return reveal({ ...state, suggestions }, index, playerId);
    }
    return { ...state, suggestions };
  },

  waitingOn: (s) =>
    s.phase === 'clue'
      ? [s.spymasters[s.turn]]
      : s.phase === 'guess'
        ? s.players.filter((id) => s.teams[id] === s.turn && s.spymasters[s.turn] !== id)
        : [],

  getResult(state): GameResult | null {
    if (state.phase !== 'over' || !state.winner) return null;
    const winner = state.winner;
    const loser = other(winner);
    const summary =
      state.how === 'assassin'
        ? `${TEAM_NAME[winner]} wins: ${TEAM_NAME[loser]} found the assassin`
        : `${TEAM_NAME[winner]} wins: all ${teamSize(winner, state.starting)} words found`;
    const reveal: CodenamesReveal = {
      words: state.words,
      key: state.key,
      revealed: state.revealed,
      clues: state.clues,
      teams: state.teams,
      spymasters: state.spymasters,
      starting: state.starting,
      winner,
      how: state.how,
    };
    // The clue that found the most of its team's words, for the night's awards.
    const found = (c: Clue) => c.guesses.filter((g) => g.card === c.team).length;
    const bestClue = state.clues.reduce<Clue | null>(
      (a, c) => (found(c) >= 2 && (!a || found(c) > found(a)) ? c : a),
      null,
    );
    return {
      winners: state.players.filter((id) => state.teams[id] === winner),
      summary,
      reveal,
      recap: state.recap,
      highlights: bestClue
        ? [
            {
              award: 'Best clue',
              playerIds: [bestClue.by],
              text: `“${bestClue.word}” found ${found(bestClue)} words`,
              value: found(bestClue),
            },
          ]
        : [],
      standings: state.players.map((playerId) => {
        const team = state.teams[playerId]!;
        return {
          playerId,
          outcome: team === winner ? 'win' : 'loss',
          team: TEAM_NAME[team],
          role: state.spymasters[team] === playerId ? 'Spymaster' : 'Operative',
        };
      }),
    };
  },

  /**
   * Ended early: the team that has found more of its own words wins; level is a draw for
   * everyone. Nothing to save before either team has found a word.
   */
  partialResult(state): GameResult | null {
    if (state.phase === 'over') return null;
    const found = (t: Team) => state.key.filter((c, i) => c === t && state.revealed[i]).length;
    const red = found('red');
    const blue = found('blue');
    if (red === 0 && blue === 0) return null;
    const leader: Team | null = red > blue ? 'red' : blue > red ? 'blue' : null;
    const words = (n: number) => `${n} word${n === 1 ? '' : 's'}`;
    const summary = leader
      ? `${TEAM_NAME[leader]} led ${words(found(leader))} to ${found(other(leader))}`
      : `Level at ${words(red)} each`;
    return {
      winners: leader ? state.players.filter((id) => state.teams[id] === leader) : [],
      summary,
      reveal: {
        words: state.words,
        key: state.key,
        revealed: state.revealed,
        clues: state.clues,
        teams: state.teams,
        spymasters: state.spymasters,
        starting: state.starting,
        winner: leader,
        how: null,
      } satisfies CodenamesReveal,
      recap: state.recap,
      standings: state.players.map((playerId) => {
        const team = state.teams[playerId]!;
        return {
          playerId,
          outcome: leader === null ? 'draw' : team === leader ? 'win' : 'loss',
          team: TEAM_NAME[team],
          role: state.spymasters[team] === playerId ? 'Spymaster' : 'Operative',
        };
      }),
    };
  },

  bot: codenamesBot,
  /** A beat longer than the default, so people can read a bot's clue and see its suggestion. */
  botDelayMs: 2600,

  /** Each clue goes in the chat, so people across the room can read it too. */
  announce(prev, next) {
    if (!prev || next.clues.length <= prev.clues.length) return [];
    const clue = next.clues[next.clues.length - 1]!;
    return [
      `{${clue.by}} gave ${TEAM_NAME[clue.team]} the clue ${clue.word} ${clue.count ?? '∞'}.`,
    ];
  },
};

/** What the results screen gets once the game is over: the whole board and every clue. */
export interface CodenamesReveal {
  words: string[];
  key: Card[];
  revealed: boolean[];
  clues: Clue[];
  teams: Record<string, Team>;
  spymasters: Record<Team, string>;
  starting: Team;
  /** Null when the host ended a level game early. */
  winner: Team | null;
  how: CodenamesState['how'];
}
