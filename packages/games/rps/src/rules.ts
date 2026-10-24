import {
  GameError,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { meta } from './meta';

/**
 * Rock Paper Scissors for 2–10 players, the Phase 1 test game. Each round everyone picks in
 * secret; when the last pick is in, all picks are revealed together and each player scores one
 * point per opponent their pick beats. Most points after the last round wins; ties share it.
 */

export const PICKS = ['rock', 'paper', 'scissors'] as const;
export type Pick = (typeof PICKS)[number];

const BEATS: Record<Pick, Pick> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

/** Does throw `a` beat throw `b`? */
export const beats = (a: Pick, b: Pick) => BEATS[a] === b;

export const optionsSchema = z.object({
  rounds: z.number().int().min(1, 'At least 1 round').max(9, 'At most 9 rounds'),
});
export type RpsOptions = z.infer<typeof optionsSchema>;

export const actionSchema = z.object({ type: z.literal('pick'), pick: z.enum(PICKS) });
export type RpsAction = z.infer<typeof actionSchema>;

export interface RoundResult {
  round: number;
  picks: Record<string, Pick>;
  /** Points each player scored this round. */
  points: Record<string, number>;
}

export interface RpsState {
  players: string[];
  rounds: number;
  /** 1-based; equals rounds + 1 once the game is over. */
  round: number;
  /** Secret picks for the current round. Never leave the server until the round resolves. */
  picks: Record<string, Pick>;
  history: RoundResult[];
  scores: Record<string, number>;
  recap: RecapEvent[];
}

/** Everything public: the TV and every phone render this. */
export interface RpsTableView {
  round: number;
  rounds: number;
  players: string[];
  /** Who has picked this round. Not what. */
  picked: string[];
  scores: Record<string, number>;
  history: RoundResult[];
}

export interface RpsPlayerView extends RpsTableView {
  myPick: Pick | null;
}

export function scoreRound(picks: Record<string, Pick>): Record<string, number> {
  const ids = Object.keys(picks);
  return Object.fromEntries(
    ids.map((id) => [
      id,
      ids.filter((other) => other !== id && BEATS[picks[id]!] === picks[other]).length,
    ]),
  );
}

function tableView(state: RpsState): RpsTableView {
  return {
    round: state.round,
    rounds: state.rounds,
    players: state.players,
    picked: state.players.filter((id) => id in state.picks),
    scores: state.scores,
    history: state.history,
  };
}

/**
 * A computer player's throw (Lesia, 2026-10-24: "play against bots"), from its own view only. It
 * throws once a round and then waits. Usually it picks at random; now and then it leans against
 * what the others threw last round (people often throw the same again), so it plays the throw
 * that would have beaten the most of them. Randomness only from `rng`.
 */
export function botPick(v: RpsPlayerView, me: string, rng: Rng): RpsAction | null {
  if (v.round > v.rounds || v.myPick || !v.players.includes(me)) return null;
  const last = v.history[v.history.length - 1];
  if (last && rng.next() < 0.35) {
    const theirs = Object.entries(last.picks)
      .filter(([id]) => id !== me)
      .map(([, p]) => p);
    const beaten = (p: Pick) => theirs.filter((t) => beats(p, t)).length;
    const most = Math.max(...PICKS.map(beaten));
    if (most > 0) return { type: 'pick', pick: rng.pick(PICKS.filter((p) => beaten(p) === most)) };
  }
  return { type: 'pick', pick: rng.pick(PICKS) };
}

/** The game's result from the points so far: the most wins, a tie shares it, all level is a draw. */
function resultFrom(
  state: RpsState,
  summary: (best: number, winners: string[]) => string,
): GameResult {
  const best = Math.max(...state.players.map((id) => state.scores[id]!));
  const winners = state.players.filter((id) => state.scores[id] === best);
  const allTied = winners.length === state.players.length;
  return {
    winners,
    summary: summary(best, winners),
    reveal: { history: state.history, scores: state.scores },
    recap: state.recap,
    standings: state.players.map((playerId) => ({
      playerId,
      outcome: allTied ? 'draw' : winners.includes(playerId) ? 'win' : 'loss',
    })),
  };
}

export const rps: GameModule<RpsState, RpsAction, RpsPlayerView, RpsTableView, RpsOptions> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions: () => ({ rounds: 3 }),

  setup: ({ playerIds, options }) => ({
    players: playerIds,
    rounds: options.rounds,
    round: 1,
    picks: {},
    history: [],
    scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
    recap: [],
  }),

  getPlayerView: (state, playerId) => ({
    ...tableView(state),
    myPick: state.picks[playerId] ?? null,
  }),
  getTableView: tableView,

  applyAction(state, playerId, action) {
    if (state.round > state.rounds) throw new GameError('GAME_OVER', 'The game is over.');
    if (!state.players.includes(playerId))
      throw new GameError('NOT_A_PLAYER', "You're not in this game.");
    // Changing your mind is allowed until the last pick is in.
    const picks = { ...state.picks, [playerId]: action.pick };
    if (Object.keys(picks).length < state.players.length) return { ...state, picks };

    const points = scoreRound(picks);
    const scores = Object.fromEntries(
      state.players.map((id) => [id, state.scores[id]! + points[id]!]),
    );
    const result: RoundResult = { round: state.round, picks, points };
    return {
      ...state,
      round: state.round + 1,
      picks: {},
      history: [...state.history, result],
      scores,
      recap: [
        ...state.recap,
        {
          round: state.round,
          // Player ids in the text are swapped for names by the recap screens.
          text: state.players.map((id) => `${id} threw ${picks[id]} (+${points[id]})`).join(', '),
          data: result,
        },
      ],
    };
  },

  waitingOn: (s) => (s.round > s.rounds ? [] : s.players.filter((id) => !(id in s.picks))),

  getResult(state): GameResult | null {
    if (state.round <= state.rounds) return null;
    // A tie for first between some players is a shared win; a tie between everyone is a draw.
    return resultFrom(state, (best, winners) => {
      const pts = `${best} point${best === 1 ? '' : 's'}`;
      return winners.length === 1 ? `Won with ${pts}` : `${winners.length}-way tie at ${pts}`;
    });
  },

  /**
   * Ended early: whoever has the most points from the rounds played so far wins (the same scoring
   * as a full game), ties share it. Nothing is decided before the first round resolves.
   */
  partialResult(state): GameResult | null {
    if (state.history.length === 0) return null;
    if (state.round > state.rounds) return rps.getResult(state);
    const [top = 0, next = 0] = state.players.map((id) => state.scores[id]!).sort((a, b) => b - a);
    const played = state.history.length;
    const after = `after ${played} of ${state.rounds} round${state.rounds === 1 ? '' : 's'}`;
    return resultFrom(state, () =>
      top === next ? `Level at ${top} ${after}` : `Led ${top}–${next} ${after}`,
    );
  },

  bot: ({ view, playerId, rng }) => botPick(view, playerId, rng),
};
