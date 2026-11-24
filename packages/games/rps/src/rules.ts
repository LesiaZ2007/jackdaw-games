import {
  GameError,
  type BotLevel,
  type GameModule,
  type GameResult,
  type GameStory,
  type RecapEvent,
  type RecapStats,
  type Rng,
  type StoryFact,
  buildStory,
  raceStory,
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

/** How often a bot plays against last round's throws, by level (an Easy one never does). */
const LEAN: Record<BotLevel, number> = { easy: 0, normal: 0.35, hard: 0.5 };

/**
 * A computer player's throw (2026-10-24: "play against bots"), from its own view only. It
 * throws once a round and then waits. Usually it picks at random; now and then it leans against
 * what the others threw last round (people often throw the same again), so it plays the throw
 * that would have beaten the most of them. Randomness only from `rng`.
 */
export function botPick(
  v: RpsPlayerView,
  me: string,
  rng: Rng,
  level: BotLevel = 'normal',
): RpsAction | null {
  if (v.round > v.rounds || v.myPick || !v.players.includes(me)) return null;
  const last = v.history[v.history.length - 1];
  if (last && rng.next() < LEAN[level]) {
    const theirs = Object.entries(last.picks)
      .filter(([id]) => id !== me)
      .map(([, p]) => p);
    const beaten = (p: Pick) => theirs.filter((t) => beats(p, t)).length;
    const most = Math.max(...PICKS.map(beaten));
    if (most > 0) return { type: 'pick', pick: rng.pick(PICKS.filter((p) => beaten(p) === most)) };
  }
  return { type: 'pick', pick: rng.pick(PICKS) };
}

/** Points, rounds topped and most-thrown pick per player, the winners first. */
function statsFrom(state: RpsState, winners: string[]): RecapStats {
  const order = [...winners, ...state.players.filter((id) => !winners.includes(id))];
  return {
    columns: ['Points', 'Rounds won', 'Favorite'],
    rows: order.map((playerId) => {
      const thrown = state.history.map((h) => h.picks[playerId]!);
      const favorite = PICKS.map((p) => [p, thrown.filter((t) => t === p).length] as const).sort(
        (a, b) => b[1] - a[1],
      )[0]!;
      const roundsWon = state.history.filter((h) => {
        const top = Math.max(...Object.values(h.points));
        return top > 0 && h.points[playerId] === top;
      }).length;
      return {
        playerId,
        values: [state.scores[playerId]!, roundsWon, favorite[1] > 0 ? favorite[0] : '-'],
      };
    }),
  };
}

/** The stats page, read out of the round history: the score race, throw habits, streaks and sweeps. */
function rpsStory(state: RpsState, winners: string[]): GameStory | undefined {
  const rounds = state.history;
  if (rounds.length === 0) return undefined;
  const ids = state.players;
  const series = ids.map((playerId) => {
    const points = [0];
    for (const h of rounds) points.push(points[points.length - 1]! + (h.points[playerId] ?? 0));
    return { playerId, points };
  });
  const race = raceStory({ series, winners, step: 'round', title: 'Score', unit: ' points' });

  const topOf = (h: RoundResult) => Math.max(...Object.values(h.points));
  const wonRound = (h: RoundResult, id: string) => topOf(h) > 0 && h.points[id] === topOf(h);
  const facts: StoryFact[] = [];

  // Clean sweeps: one throw beating everyone else's.
  const sweeps: Record<string, number> = {};
  for (const h of rounds) {
    const top = topOf(h);
    const leaders = ids.filter((id) => h.points[id] === top);
    if (top > 0 && leaders.length === 1 && top === ids.length - 1 && ids.length > 2)
      sweeps[leaders[0]!] = (sweeps[leaders[0]!] ?? 0) + 1;
  }
  const sweeper = Object.entries(sweeps).sort((a, b) => b[1] - a[1])[0];
  if (sweeper)
    facts.push({
      label: 'Clean sweep',
      text:
        sweeper[1] === 1
          ? `{${sweeper[0]}} beat every other throw in one round.`
          : `{${sweeper[0]}} beat every other throw in ${sweeper[1]} rounds.`,
      playerIds: [sweeper[0]],
      tone: 'good',
    });

  // Longest run of rounds won.
  let streak = { id: '', len: 0, end: 0 };
  for (const id of ids) {
    let run = 0;
    rounds.forEach((h, i) => {
      run = wonRound(h, id) ? run + 1 : 0;
      if (run > streak.len) streak = { id, len: run, end: i + 1 };
    });
  }
  if (streak.len >= 3)
    facts.push({
      label: 'Hot streak',
      text: `{${streak.id}} won ${streak.len} rounds in a row, ending on round ${streak.end}.`,
      playerIds: [streak.id],
      tone: 'good',
    });

  // Throw habits: the most one-note player, and the most evenly mixed.
  if (rounds.length >= 4) {
    const habit = ids.map((id) => {
      const counts = PICKS.map((p) => rounds.filter((h) => h.picks[id] === p).length);
      const most = Math.max(...counts);
      return {
        id,
        pick: PICKS[counts.indexOf(most)]!,
        most,
        pct: Math.round((most / rounds.length) * 100),
      };
    });
    const fav = [...habit].sort((a, b) => b.most - a.most)[0]!;
    if (fav.pct >= 60)
      facts.push({
        label: 'One-trick',
        text: `{${fav.id}} threw ${fav.pick} in ${fav.pct}% of rounds.`,
        playerIds: [fav.id],
      });
    const never = habit.find((h) => PICKS.some((p) => rounds.every((r) => r.picks[h.id] !== p)));
    if (never && rounds.length >= 5) {
      const unused = PICKS.find((p) => rounds.every((r) => r.picks[never.id] !== p))!;
      facts.push({
        label: 'Never once',
        text: `{${never.id}} never threw ${unused} all game.`,
        playerIds: [never.id],
      });
    }
  }

  // Nemesis: the pair where one player out-scored the other head to head by the most.
  if (ids.length >= 2 && rounds.length >= 3) {
    let nem = { a: '', b: '', by: 0 };
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        const by =
          rounds.filter((h) => beats(h.picks[a]!, h.picks[b]!)).length -
          rounds.filter((h) => beats(h.picks[b]!, h.picks[a]!)).length;
        if (by > nem.by) nem = { a, b, by };
      }
    if (nem.by >= 3) {
      const won = rounds.filter((h) => beats(h.picks[nem.a]!, h.picks[nem.b]!)).length;
      facts.push({
        label: 'Nemesis',
        text: `{${nem.a}} beat {${nem.b}} head to head in ${won} of ${rounds.length} rounds.`,
        playerIds: [nem.a, nem.b],
      });
    }
  }

  // Shutouts: rounds with no points at all.
  const draws = rounds.filter((h) => topOf(h) === 0).length;
  if (draws >= 2 && draws >= rounds.length / 3)
    facts.push({
      label: 'Stalemates',
      text: `${draws} of ${rounds.length} rounds ended with nobody scoring.`,
    });

  const roundsWon = ids.map((id) => [id, rounds.filter((h) => wonRound(h, id)).length] as const);
  return buildStory({
    race,
    facts,
    bars: [
      {
        title: 'Rounds won',
        rows: [...roundsWon]
          .sort((a, b) => b[1] - a[1])
          .map(([playerId, value]) => ({ playerId, value })),
      },
    ],
  });
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
    roundName: 'Round',
    stats: statsFrom(state, winners),
    story: rpsStory(state, winners),
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
    const top = Math.max(...Object.values(points));
    const leaders = state.players.filter((id) => points[id] === top);
    // A clean sweep (one throw beating everyone else's) or the final round is a turning point.
    const sweep = top > 0 && leaders.length === 1 && top === state.players.length - 1;
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
          text: state.players.map((id) => `{${id}} threw ${picks[id]} (+${points[id]})`).join(', '),
          tag: top === 0 ? 'Draw' : leaders.length === 1 ? `+${top}` : `${leaders.length} tied`,
          key: sweep || state.round === state.rounds || undefined,
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

  bot: ({ view, playerId, rng, level }) => botPick(view, playerId, rng, level),
};
