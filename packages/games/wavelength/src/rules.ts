import {
  GameError,
  type GameModule,
  type GameResult,
  type Highlight,
  type RecapEvent,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import { meta } from './meta';
import { SPECTRUMS, type Spectrum } from './spectrums';

/**
 * Wavelength for 2–15 players. Each round one player, the psychic, sees a hidden target on a dial
 * running between two opposites (Cold to Hot), picks one of two spectrum cards and gives a clue
 * that sits at that spot. Their team turns the dial to where they think the target is and scores
 * 4, 3 or 2 by how close it lands (docs/wavelength/DESIGN.md).
 *
 * Teams: two teams take turns, and after each guess the other team calls whether the target is
 * left or right of the dial for a point. A team that hits the bullseye and is still behind goes
 * again. First to the goal wins. Together: everyone on one team for a set number of rounds, a
 * bullseye earning one more.
 *
 * Guessing is a shared dial anyone on the team drags (locked in by a majority), or everyone
 * setting a dial of their own (the team's guess is the average, revealed at the end).
 */

export const TEAMS = ['sun', 'moon'] as const;
export type Team = (typeof TEAMS)[number];
export const TEAM_NAME: Record<Team, string> = { sun: 'Sun', moon: 'Moon' };
export const other = (t: Team): Team => (t === 'sun' ? 'moon' : 'sun');
export type Side = 'left' | 'right';

const MODES = ['Teams', 'Together'] as const;
const PICKS = ['Random', 'Chosen'] as const;
const GUESSING = ['Shared dial', 'Everyone guesses'] as const;
const LENGTHS = ['Short', 'Standard', 'Long'] as const;
const TIMERS = ['Off', '60 seconds', '2 minutes'] as const;

/** Points to win (Teams) and rounds to play (Together), by length. */
export const GOALS: Record<(typeof LENGTHS)[number], { points: number; rounds: number }> = {
  Short: { points: 7, rounds: 5 },
  Standard: { points: 10, rounds: 7 },
  Long: { points: 15, rounds: 10 },
};
/** The fewest players for two teams of at least two. */
export const TEAMS_MIN = 4;
/** The middle of the dial, where it starts. */
export const MIDDLE = 50;
/** Where a target's centre can fall, so its whole zone is on the dial. */
export const TARGET_MIN = 10;
export const TARGET_MAX = 90;
/** Time on the reveal before the next round starts by itself. */
export const REVEAL_MS = 12_000;
/** Longest clue, in characters. */
export const CLUE_MAX = 60;

export const optionsSchema = z.object({
  mode: z.enum(MODES).describe('Mode'),
  /** Random: dealt afresh each game. Chosen: as the host placed everyone in the lobby. */
  teams: z.enum(PICKS).describe('Teams'),
  /** Chosen teams: player id -> team, as the host arranged them (the lobby draws this). */
  sides: z.record(z.string(), z.enum(TEAMS)),
  guessing: z.enum(GUESSING).describe('Guessing'),
  length: z.enum(LENGTHS).describe('Length'),
  timer: z.enum(TIMERS).describe('Dial timer'),
});
export type WavelengthOptions = z.infer<typeof optionsSchema>;

export const actionSchema = z.discriminatedUnion('type', [
  /** The psychic: which of the two cards, and the clue for it. */
  z.object({
    type: z.literal('clue'),
    card: z.union([z.literal(0), z.literal(1)]),
    text: z.string().max(CLUE_MAX * 2),
  }),
  /** Turn the dial (the shared one, or your own), 0 = the left word, 100 = the right. */
  z.object({ type: z.literal('dial'), at: z.number().min(0).max(100) }),
  /** Lock in (or take your lock back). */
  z.object({ type: z.literal('lock'), on: z.boolean() }),
  /** The other team's call: is the target left or right of the dial? */
  z.object({ type: z.literal('call'), side: z.enum(['left', 'right']) }),
  /** The psychic: stop waiting and go with what's there (as if the timer ran out). */
  z.object({ type: z.literal('hurry') }),
  /** From the reveal: the next round now (after = the round it's leaving). */
  z.object({ type: z.literal('next'), after: z.number().int().positive() }),
]);
export type WavelengthAction = z.infer<typeof actionSchema>;

export type Phase = 'clue' | 'guess' | 'call' | 'reveal' | 'over';

/** The round being played. `target` and `dials` never leave the server before the reveal. */
export interface Round {
  n: number;
  /** The team guessing (Together: everyone is 'sun'). */
  team: Team;
  psychic: string;
  /** The two cards on offer, as SPECTRUMS indices. */
  offer: [number, number];
  /** The card the psychic chose (an index into `offer`). */
  card: 0 | 1 | null;
  clue: string | null;
  target: number;
  /** The shared dial. */
  dial: number;
  /** Counts every move of the shared dial, so screens can tell a new position from an old. */
  dialSeq: number;
  dialBy: string | null;
  /** Guessers who have locked in. */
  locks: string[];
  /** Everyone guesses: each guesser's own dial. */
  dials: Record<string, number>;
  /** The team's guess, once it's locked. */
  guess: number | null;
  /** The other team's votes, and the call it came to (null: no call, or no point possible). */
  calls: Record<string, Side>;
  call: Side | null;
  /** A bullseye while behind earned this turn. */
  catchUp: boolean;
}

/** One finished round, public from its reveal on. */
export interface RoundResult {
  n: number;
  team: Team;
  psychic: string;
  spectrum: Spectrum;
  clue: string;
  target: number;
  guess: number;
  points: number;
  /** Teams: the other team's call and whether it was right. */
  call: Side | null;
  callPoint: 0 | 1;
  /** Everyone guesses: each guesser's dial. */
  dials: Record<string, number> | null;
  catchUp: boolean;
  /** The game ended with this round. */
  final: boolean;
}

export interface WavelengthState {
  players: string[];
  mode: 'teams' | 'together';
  guessing: 'shared' | 'average';
  /** Teams: points to win. Together: rounds to play (bonus rounds come on top). */
  goal: number;
  timerSecs: number;
  teams: Record<string, Team>;
  /** Each team's players in the order they take the psychic's seat. */
  order: Record<Team, string[]>;
  /** Psychics each team has had so far. */
  turns: Record<Team, number>;
  scores: Record<Team, number>;
  /** Together: rounds earned by bullseyes. */
  bonus: number;
  phase: Phase;
  round: Round;
  history: RoundResult[];
  /** SPECTRUMS indices already offered, so cards don't come round again too soon. */
  used: number[];
  /** When the dial (or the call) locks by itself; null without a timer. */
  actBy: number | null;
  /** When the reveal moves on by itself. */
  nextAt: number | null;
  winner: Team | null;
  recap: RecapEvent[];
}

/** The round as everyone sees it: no target before the reveal and no private dials. */
export interface PublicRound extends Omit<Round, 'target' | 'dials'> {
  spectrums: [Spectrum, Spectrum];
  /** Revealed with the round. */
  target: number | null;
  /** Everyone guesses: who has turned their own dial (positions come with the reveal). */
  moved: string[];
}

export interface WavelengthTableView {
  players: string[];
  mode: WavelengthState['mode'];
  guessing: WavelengthState['guessing'];
  goal: number;
  /** Together: rounds in all so far, bonus rounds included. */
  rounds: number;
  teams: Record<string, Team>;
  scores: Record<Team, number>;
  phase: Phase;
  round: PublicRound;
  /** The guessers this round. */
  guessers: string[];
  /** The players making the left/right call this round. */
  callers: string[];
  history: RoundResult[];
  actBy: number | null;
  nextAt: number | null;
  winner: Team | null;
}

export interface WavelengthPlayerView extends WavelengthTableView {
  me: string;
  myTeam: Team | null;
  /** The target, for this round's psychic only (everyone has it from the reveal). */
  target: number | null;
  /** Everyone guesses: my own dial, if I've turned it. */
  myDial: number | null;
}

/** The points a guess scores against a target. */
export function scoreOf(guess: number, target: number): 0 | 2 | 3 | 4 {
  const d = Math.abs(guess - target);
  return d <= 2 ? 4 : d <= 6 ? 3 : d <= 10 ? 2 : 0;
}

/** Which side of the dial the target is on, or null when the dial is dead on it. */
export function sideOf(guess: number, target: number): Side | null {
  return target < guess ? 'left' : target > guess ? 'right' : null;
}

const tidy = (at: number) => Math.round(Math.min(100, Math.max(0, at)) * 10) / 10;
const cleanClue = (text: string) => text.replace(/\s+/g, ' ').trim();

export function defaultOptions(playerCount: number): WavelengthOptions {
  return {
    mode: playerCount >= TEAMS_MIN ? 'Teams' : 'Together',
    teams: 'Random',
    sides: {},
    guessing: 'Shared dial',
    length: 'Standard',
    timer: 'Off',
  };
}

export function validateOptions(o: WavelengthOptions, playerCount: number): string | null {
  if (o.mode === 'Teams' && playerCount < TEAMS_MIN)
    return `Teams needs at least ${TEAMS_MIN} players. Try Together.`;
  return null;
}

/**
 * Chosen teams for the players actually seated. The host's placings are kept (ids of players who
 * left are ignored); anyone not placed joins the smaller team, and a team left with fewer than
 * two takes players from the other at random so both have a psychic and a guesser.
 */
export function placeTeams(
  playerIds: string[],
  sides: Record<string, Team>,
  rng: Rng,
): Record<string, Team> {
  const teams: Record<string, Team> = {};
  const unplaced: string[] = [];
  for (const id of playerIds) {
    const t = sides[id];
    if (t === 'sun' || t === 'moon') teams[id] = t;
    else unplaced.push(id);
  }
  const members = (t: Team) => playerIds.filter((id) => teams[id] === t);
  for (const id of rng.shuffle(unplaced)) {
    const sun = members('sun').length;
    const moon = members('moon').length;
    teams[id] = sun < moon ? 'sun' : moon < sun ? 'moon' : rng.pick(TEAMS);
  }
  for (const t of TEAMS) {
    while (members(t).length < 2 && members(other(t)).length > 2) {
      teams[rng.pick(members(other(t)))] = t;
    }
  }
  return teams;
}

/** Everyone guessing this round: the guessing team but its psychic. */
export const guessersOf = (s: Pick<WavelengthState, 'players' | 'teams' | 'round'>) =>
  s.players.filter((id) => s.teams[id] === s.round.team && id !== s.round.psychic);

/** Teams: the other team, who make the left/right call. */
export const callersOf = (s: Pick<WavelengthState, 'players' | 'teams' | 'round' | 'mode'>) =>
  s.mode === 'teams' ? s.players.filter((id) => s.teams[id] === other(s.round.team)) : [];

/** Two cards nobody has had yet (starting over once the box runs out). */
function drawOffer(used: number[], rng: Rng): { offer: [number, number]; used: number[] } {
  let fresh = SPECTRUMS.map((_, i) => i).filter((i) => !used.includes(i));
  let kept = used;
  if (fresh.length < 2) {
    fresh = SPECTRUMS.map((_, i) => i);
    kept = [];
  }
  const [a, b] = rng.shuffle(fresh) as [number, number];
  return { offer: [a, b], used: [...kept, a, b] };
}

/** Deal the next round for `team`: its next psychic, two cards and a target. */
function newRound(s: WavelengthState, team: Team, catchUp: boolean, rng: Rng): WavelengthState {
  const seat = s.order[team];
  const psychic = seat[s.turns[team] % seat.length]!;
  const { offer, used } = drawOffer(s.used, rng);
  const round: Round = {
    n: s.round ? s.round.n + 1 : 1,
    team,
    psychic,
    offer,
    card: null,
    clue: null,
    target: TARGET_MIN + rng.int(TARGET_MAX - TARGET_MIN + 1),
    dial: MIDDLE,
    dialSeq: 0,
    dialBy: null,
    locks: [],
    dials: {},
    guess: null,
    calls: {},
    call: null,
    catchUp,
  };
  return {
    ...s,
    round,
    used,
    turns: { ...s.turns, [team]: s.turns[team] + 1 },
    phase: 'clue',
    actBy: null,
    nextAt: null,
  };
}

const average = (xs: number[]) =>
  xs.length ? tidy(xs.reduce((a, x) => a + x, 0) / xs.length) : MIDDLE;

/** The team's guess is in: on to the other team's call, or straight to the reveal. */
function lockGuess(s: WavelengthState, guess: number, now: number): WavelengthState {
  const round = { ...s.round, guess: tidy(guess), locks: [] };
  const next = { ...s, round };
  // Teams call left or right, unless the dial is dead on the target (no point to be had).
  if (s.mode === 'teams' && sideOf(round.guess, round.target) !== null)
    return { ...next, phase: 'call', actBy: s.timerSecs ? now + s.timerSecs * 1000 : null };
  return reveal(next, now);
}

/** The guess is set; was the shared or averaged dial locked by enough of the team? */
function checkLocks(s: WavelengthState, now: number): WavelengthState {
  const guessers = guessersOf(s);
  const locked = s.round.locks.filter((id) => guessers.includes(id)).length;
  if (s.guessing === 'shared') {
    return locked * 2 > guessers.length ? lockGuess(s, s.round.dial, now) : s;
  }
  if (locked < guessers.length) return s;
  return lockGuess(s, average(guessers.map((id) => s.round.dials[id] ?? MIDDLE)), now);
}

/** The other team's call, once more than half of it agrees. */
function checkCalls(s: WavelengthState, now: number, force = false): WavelengthState {
  const callers = callersOf(s);
  const votes = callers.map((id) => s.round.calls[id]).filter((v): v is Side => Boolean(v));
  const left = votes.filter((v) => v === 'left').length;
  const right = votes.length - left;
  const need = Math.floor(callers.length / 2) + 1;
  if (left >= need || right >= need)
    return reveal({ ...s, round: { ...s.round, call: left >= need ? 'left' : 'right' } }, now);
  if (!force) return s;
  // Out of time: the bigger side, and a tie makes no call.
  const call = left > right ? 'left' : right > left ? 'right' : null;
  return reveal({ ...s, round: { ...s.round, call } }, now);
}

/** Score the round, show the target, and work out whether the game is over. */
function reveal(s: WavelengthState, now: number): WavelengthState {
  const r = s.round;
  const guess = r.guess ?? MIDDLE;
  const points = scoreOf(guess, r.target);
  const right = sideOf(guess, r.target);
  const callPoint: 0 | 1 = r.call !== null && r.call === right ? 1 : 0;
  const scores = { ...s.scores };
  scores[r.team] += points;
  if (callPoint) scores[other(r.team)] += 1;
  const bonus = s.mode === 'together' && points === 4 ? s.bonus + 1 : s.bonus;

  let winner: Team | null = null;
  let final = false;
  if (s.mode === 'teams') {
    const top = Math.max(scores.sun, scores.moon);
    if (top >= s.goal && scores.sun !== scores.moon) {
      winner = scores.sun > scores.moon ? 'sun' : 'moon';
      final = true;
    }
  } else if (s.history.length + 1 >= s.goal + bonus) {
    final = true;
  }

  const spectrum = SPECTRUMS[r.offer[r.card ?? 0]]!;
  const result: RoundResult = {
    n: r.n,
    team: r.team,
    psychic: r.psychic,
    spectrum,
    clue: r.clue ?? '',
    target: r.target,
    guess,
    points,
    call: s.mode === 'teams' ? r.call : null,
    callPoint,
    dials: s.guessing === 'average' ? { ...r.dials } : null,
    catchUp: r.catchUp,
    final,
  };
  const who = s.mode === 'teams' ? TEAM_NAME[r.team] : 'The team';
  const callText =
    s.mode === 'teams' && r.call
      ? ` ${TEAM_NAME[other(r.team)]} called ${r.call}: ${callPoint ? '+1' : 'wrong'}.`
      : '';
  return {
    ...s,
    round: { ...r, guess },
    scores,
    bonus,
    history: [...s.history, result],
    phase: 'reveal',
    actBy: null,
    nextAt: now + REVEAL_MS,
    winner,
    recap: [
      ...s.recap,
      {
        round: r.n,
        actor: r.psychic,
        text: `${who} turned the dial to ${Math.round(guess)} and scored ${points}.${callText}`,
        secret: `The target was at ${r.target}.`,
        data: { kind: 'reveal', ...result },
      },
    ],
  };
}

/** From the reveal: the next round (or the end). */
function advance(s: WavelengthState, rng: Rng): WavelengthState {
  const last = s.history[s.history.length - 1]!;
  if (last.final) return { ...s, phase: 'over', nextAt: null };
  if (s.mode === 'together') return newRound(s, 'sun', false, rng);
  // A bullseye while still behind: the same team goes again (once per bullseye).
  const behind = s.scores[last.team] < s.scores[other(last.team)];
  const again = last.points === 4 && behind;
  return newRound(s, again ? last.team : other(last.team), again, rng);
}

/** Out of time (or the psychic says go): lock whatever is there. */
function force(s: WavelengthState, now: number): WavelengthState {
  if (s.phase === 'guess') {
    if (s.guessing === 'shared') return lockGuess(s, s.round.dial, now);
    const guessers = guessersOf(s);
    const set = guessers.map((id) => s.round.dials[id]).filter((v): v is number => v !== undefined);
    return lockGuess(s, average(set), now);
  }
  if (s.phase === 'call') return checkCalls(s, now, true);
  return s;
}

function publicRound(s: WavelengthState): PublicRound {
  const { target, dials, ...r } = s.round;
  const shown = s.phase === 'reveal' || s.phase === 'over';
  return {
    ...r,
    spectrums: [SPECTRUMS[r.offer[0]]!, SPECTRUMS[r.offer[1]]!],
    target: shown ? target : null,
    moved: Object.keys(dials),
    // The shared dial only means something in Shared dial; the average shows with the reveal.
    dial: s.guessing === 'shared' || shown ? (r.guess ?? r.dial) : MIDDLE,
  };
}

function tableView(s: WavelengthState): WavelengthTableView {
  return {
    players: s.players,
    mode: s.mode,
    guessing: s.guessing,
    goal: s.goal,
    rounds: s.goal + s.bonus,
    teams: s.teams,
    scores: s.scores,
    phase: s.phase,
    round: publicRound(s),
    guessers: guessersOf(s),
    callers: callersOf(s),
    history: s.history,
    actBy: s.actBy,
    nextAt: s.nextAt,
    winner: s.winner,
  };
}

export const wavelength: GameModule<
  WavelengthState,
  WavelengthAction,
  WavelengthPlayerView,
  WavelengthTableView,
  WavelengthOptions
> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,
  validateOptions,

  setup({ playerIds, options, rng }) {
    const mode = options.mode === 'Teams' && playerIds.length >= TEAMS_MIN ? 'teams' : 'together';
    const teams: Record<string, Team> = {};
    const order: Record<Team, string[]> = { sun: [], moon: [] };
    if (mode === 'teams' && options.teams === 'Chosen') {
      // As the host placed them; each team takes the psychic's seat in seat order.
      Object.assign(teams, placeTeams(playerIds, options.sides, rng));
      for (const id of playerIds) order[teams[id]!].push(id);
    } else if (mode === 'teams') {
      // Dealt evenly at random; with an odd number, the first team dealt gets the extra player.
      const first = rng.pick(TEAMS);
      rng.shuffle(playerIds).forEach((id, i) => {
        const t = i % 2 === 0 ? first : other(first);
        teams[id] = t;
        order[t].push(id);
      });
    } else {
      for (const id of rng.shuffle(playerIds)) {
        teams[id] = 'sun';
        order.sun.push(id);
      }
    }
    const goal = GOALS[options.length][mode === 'teams' ? 'points' : 'rounds'];
    const base: WavelengthState = {
      players: playerIds,
      mode,
      guessing: options.guessing === 'Shared dial' ? 'shared' : 'average',
      goal,
      timerSecs: options.timer === 'Off' ? 0 : options.timer === '60 seconds' ? 60 : 120,
      teams,
      order,
      turns: { sun: 0, moon: 0 },
      scores: { sun: 0, moon: 0 },
      bonus: 0,
      phase: 'clue',
      round: null as unknown as Round,
      history: [],
      used: [],
      actBy: null,
      nextAt: null,
      winner: null,
      recap: [
        {
          text:
            mode === 'teams'
              ? `Sun and Moon play to ${goal} points.`
              : `Everyone together for ${goal} rounds.`,
          data: { kind: 'start', mode, teams },
        },
      ],
    };
    const startTeam = mode === 'teams' ? rng.pick(TEAMS) : 'sun';
    return newRound(base, startTeam, false, rng);
  },

  getPlayerView(s, playerId) {
    const t = tableView(s);
    const psychic = s.round.psychic === playerId;
    return {
      ...t,
      me: playerId,
      myTeam: s.teams[playerId] ?? null,
      target: psychic || t.round.target !== null ? s.round.target : null,
      myDial: s.round.dials[playerId] ?? null,
    };
  },
  getTableView: tableView,

  applyAction(s, playerId, action, rng, now) {
    if (s.phase === 'over') throw new GameError('GAME_OVER', 'The game is over.');
    if (!s.teams[playerId]) throw new GameError('NOT_A_PLAYER', "You're not in this game.");
    const r = s.round;
    const isPsychic = r.psychic === playerId;

    switch (action.type) {
      case 'clue': {
        if (!isPsychic) throw new GameError('NOT_PSYCHIC', 'Only the psychic gives the clue.');
        if (s.phase !== 'clue') throw new GameError('WRONG_PHASE', 'The clue is already in.');
        const text = cleanClue(action.text);
        if (!text) throw new GameError('BAD_CLUE', 'Type a clue first.');
        if (text.length > CLUE_MAX) throw new GameError('BAD_CLUE', 'That clue is too long.');
        const spectrum = SPECTRUMS[r.offer[action.card]]!;
        return {
          ...s,
          phase: 'guess',
          round: { ...r, card: action.card, clue: text },
          actBy: s.timerSecs ? now + s.timerSecs * 1000 : null,
          recap: [
            ...s.recap,
            {
              round: r.n,
              actor: playerId,
              text: `${playerId} gave “${text}” for ${spectrum[0]} to ${spectrum[1]}.`,
              secret: `The target was at ${r.target}.`,
              data: { kind: 'clue', psychic: playerId, clue: text, spectrum },
            },
          ],
        };
      }

      case 'dial':
      case 'lock': {
        if (s.phase !== 'guess') throw new GameError('WRONG_PHASE', 'It isn’t time to guess.');
        if (!guessersOf(s).includes(playerId))
          throw new GameError(
            'NOT_GUESSING',
            isPsychic ? 'The psychic doesn’t touch the dial.' : 'It isn’t your team’s dial.',
          );
        if (action.type === 'dial') {
          const at = tidy(action.at);
          if (s.guessing === 'shared') {
            if (at === r.dial) return s;
            // Moving the dial takes everyone's lock back: they locked a different spot.
            return {
              ...s,
              round: { ...r, dial: at, dialSeq: r.dialSeq + 1, dialBy: playerId, locks: [] },
            };
          }
          return {
            ...s,
            round: {
              ...r,
              dials: { ...r.dials, [playerId]: at },
              locks: r.locks.filter((id) => id !== playerId),
            },
          };
        }
        const has = r.locks.includes(playerId);
        if (has === action.on) return s;
        const locks = action.on ? [...r.locks, playerId] : r.locks.filter((id) => id !== playerId);
        // Locking an untouched dial of your own means "the middle".
        const dials =
          s.guessing === 'average' && action.on && r.dials[playerId] === undefined
            ? { ...r.dials, [playerId]: MIDDLE }
            : r.dials;
        return checkLocks({ ...s, round: { ...r, locks, dials } }, now);
      }

      case 'call': {
        if (s.phase !== 'call') throw new GameError('WRONG_PHASE', 'It isn’t time to call.');
        if (!callersOf(s).includes(playerId))
          throw new GameError('NOT_CALLING', 'The other team makes this call.');
        if (r.calls[playerId] === action.side) return s;
        return checkCalls(
          { ...s, round: { ...r, calls: { ...r.calls, [playerId]: action.side } } },
          now,
        );
      }

      case 'hurry': {
        if (!isPsychic) throw new GameError('NOT_PSYCHIC', 'Only the psychic can lock it in.');
        if (s.phase !== 'guess' && s.phase !== 'call')
          throw new GameError('WRONG_PHASE', 'There’s nothing to lock in.');
        return force(s, now);
      }

      case 'next': {
        // A stale tap (the round moved on already) does nothing.
        if (s.phase !== 'reveal' || action.after !== r.n) return s;
        return advance(s, rng);
      }
    }
  },

  waitingOn(s) {
    if (s.phase === 'clue') return [s.round.psychic];
    if (s.phase === 'guess') return guessersOf(s).filter((id) => !s.round.locks.includes(id));
    if (s.phase === 'call') return callersOf(s).filter((id) => !s.round.calls[id]);
    return [];
  },

  nextTimer(s) {
    if ((s.phase === 'guess' || s.phase === 'call') && s.actBy) return { id: 'act', at: s.actBy };
    if (s.phase === 'reveal' && s.nextAt) return { id: 'next', at: s.nextAt };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'act' && (s.phase === 'guess' || s.phase === 'call')) return force(s, now);
    if (id === 'next' && s.phase === 'reveal') return advance(s, rng);
    return s;
  },

  announce(prev, next) {
    if (!prev) return [];
    const lines: string[] = [];
    if (prev.phase === 'clue' && next.phase !== 'clue' && next.round.clue) {
      const [l, r] = SPECTRUMS[next.round.offer[next.round.card ?? 0]]!;
      lines.push(`{${next.round.psychic}} gave the clue “${next.round.clue}” for ${l} to ${r}.`);
    }
    if (next.history.length > prev.history.length) {
      const last = next.history[next.history.length - 1]!;
      const who = next.mode === 'teams' ? TEAM_NAME[last.team] : 'The team';
      lines.push(
        `${who} scored ${last.points}${last.callPoint ? `, and ${TEAM_NAME[other(last.team)]} 1 for the call` : ''}.`,
      );
    }
    return lines;
  },

  getResult(s): GameResult | null {
    if (s.phase !== 'over') return null;
    const reveal: WavelengthReveal = {
      mode: s.mode,
      teams: s.teams,
      scores: s.scores,
      history: s.history,
      winner: s.winner,
      goal: s.goal,
    };
    const highlights: Highlight[] = [];
    const bull = s.history.find((h) => h.points === 4);
    if (bull)
      highlights.push({
        award: 'Bullseye',
        playerIds: [bull.psychic],
        text: `“${bull.clue}” for ${bull.spectrum[0]} to ${bull.spectrum[1]}`,
        value: 4,
      });

    if (s.mode === 'together') {
      const total = s.scores.sun;
      const pass = total >= s.goal * 2;
      return {
        winners: pass ? s.players : [],
        summary: `${total} points in ${s.history.length} rounds: ${rating(total, s.history.length)}`,
        reveal,
        recap: s.recap,
        highlights,
        standings: s.players.map((playerId) => ({
          playerId,
          outcome: pass ? 'win' : 'loss',
        })),
      };
    }

    const winner = s.winner!;
    return {
      winners: s.players.filter((id) => s.teams[id] === winner),
      summary: `${TEAM_NAME[winner]} wins, ${s.scores[winner]} to ${s.scores[other(winner)]}`,
      reveal,
      recap: s.recap,
      highlights,
      standings: s.players.map((playerId) => ({
        playerId,
        outcome: s.teams[playerId] === winner ? 'win' : 'loss',
        team: TEAM_NAME[s.teams[playerId]!],
      })),
    };
  },
};

/** How well a team did together, by points a round. */
export function rating(total: number, rounds: number): string {
  const each = rounds ? total / rounds : 0;
  if (each >= 3.2) return 'one mind';
  if (each >= 2.5) return 'on the same wavelength';
  if (each >= 2) return 'tuned in';
  if (each >= 1.2) return 'some static';
  return 'lost the signal';
}

/** What the results screen gets: every round, with its target. */
export interface WavelengthReveal {
  mode: WavelengthState['mode'];
  teams: Record<string, Team>;
  scores: Record<Team, number>;
  history: RoundResult[];
  winner: Team | null;
  goal: number;
}
