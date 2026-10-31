import {
  GameError,
  type Announcement,
  type GameModule,
  type GameResult,
  type RecapEvent,
  type RecapStats,
  type Rng,
} from '@jackdaw/engine';
import { z } from 'zod';
import {
  BAR,
  legalTurns,
  mostDice,
  other,
  pipCount,
  playTurn,
  startPosition,
  winKind,
  type PlayedStep,
  type Position,
  type Side,
} from './board';
import { backgammonBot } from './bot';
import { meta } from './meta';

/**
 * Backgammon for two, played as a match. Each game opens with one die each (ties roll again);
 * the higher plays both. On your turn you may offer the doubling cube before you roll, if it is
 * in the middle or yours; the other player takes (the cube doubles and is theirs) or drops (and
 * loses the game at its value). A game won with the loser having borne nothing off is a gammon
 * (double), and with a loser's checker still on the bar or in the winner's home board, a
 * backgammon (triple). The first to the match length wins. Crawford rule: the game right after
 * someone first comes within one point of the match is played without the cube.
 *
 * Everything on the board is public, so the player view is the table view with `me`.
 */

const MATCHES = ['1 point', '3 points', '5 points', '7 points'] as const;
const CUBE = ['On', 'Off'] as const;
const CLOCKS = ['Off', '30 seconds', '60 seconds'] as const;

/** The winning move stays on the board this long before the results. */
export const SHOW_MS = 3_600;
/** Between games of a match: the finished board, then the next opening roll. */
export const BETWEEN_MS = 6_000;
const LOG = 12;

export const optionsSchema = z.object({
  matchTo: z.enum(MATCHES).describe('Match'),
  cube: z.enum(CUBE).describe('Doubling cube'),
  turnTimer: z.enum(CLOCKS).describe('Turn timer'),
});
export type BackgammonOptions = z.infer<typeof optionsSchema>;

const stepSchema = z.object({
  from: z.number().int().min(1).max(BAR),
  die: z.number().int().min(1).max(6),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('double') }),
  z.object({ type: z.literal('take') }),
  z.object({ type: z.literal('drop') }),
  z.object({ type: z.literal('move'), steps: z.array(stepSchema).min(1).max(4) }),
  z.object({ type: z.literal('next') }),
]);
export type BackgammonAction = z.infer<typeof actionSchema>;

export type Phase = 'roll' | 'double' | 'move' | 'between' | 'show' | 'over';

/** One thing that happened, public, and what the screens animate. */
export interface TurnLog {
  seq: number;
  game: number;
  /** Who acted. For an opening roll, whoever rolled higher. */
  by: string;
  side: Side;
  kind: 'open' | 'move' | 'blocked' | 'double' | 'take' | 'drop';
  /** For `open`: [Ivory's die, Ebony's die]. Otherwise the roll played. */
  dice?: [number, number];
  steps?: PlayedStep[];
  /** The cube's value after a take, or offered by a double. */
  cube?: number;
  /** The clock ran out and the table played for them. */
  late?: boolean;
}

/** How one game of the match ended. */
export interface GameEnd {
  game: number;
  winner: string;
  /** 1 single, 2 gammon, 3 backgammon. A dropped double is always single. */
  kind: 1 | 2 | 3;
  cube: number;
  points: number;
  dropped: boolean;
  /** Score after this game, by side. */
  score: [number, number];
}

interface Tally {
  hits: [number, number];
  rolled: [number, number];
  doublets: [number, number];
}

export interface BackgammonState {
  /** [Ivory, Ebony]: seat order. */
  players: [string, string];
  matchTo: number;
  cubeOn: boolean;
  turnSecs: number;
  game: number;
  score: [number, number];
  pos: Position;
  phase: Phase;
  /** Whose turn it is. During `double`, the side that offered. */
  turn: Side | null;
  dice: [number, number] | null;
  cube: number;
  cubeOwner: Side | null;
  /** This game is played without the cube. */
  crawford: boolean;
  crawfordUsed: boolean;
  seq: number;
  log: TurnLog[];
  actBy: number | null;
  showBy: number | null;
  ends: GameEnd[];
  winner: Side | null;
  tally: Tally;
  recap: RecapEvent[];
}

export interface BackgammonTableView {
  players: [string, string];
  matchTo: number;
  cubeOn: boolean;
  game: number;
  score: [number, number];
  pos: Position;
  phase: Phase;
  /** Who the game waits on. */
  toAct: string | null;
  /** Whose turn it is (the side that rolled, or offered the cube). */
  turn: Side | null;
  dice: [number, number] | null;
  cube: number;
  /** Who holds the cube; null while it is in the middle. */
  cubeOwner: string | null;
  crawford: boolean;
  /** The side to roll may offer the cube now. */
  canDouble: boolean;
  pips: [number, number];
  last: TurnLog | null;
  log: TurnLog[];
  lastEnd: GameEnd | null;
  actBy: number | null;
  showBy: number | null;
  winner: string | null;
}

export interface BackgammonPlayerView extends BackgammonTableView {
  me: string;
  /** Your side, or null if you are not playing. */
  side: Side | null;
}

export interface BackgammonReveal {
  players: [string, string];
  matchTo: number;
  score: [number, number];
  ends: GameEnd[];
  pos: Position;
  winner: string | null;
}

export const KIND_NAME = { 1: 'single', 2: 'gammon', 3: 'backgammon' } as const;
export const SIDE_NAME = ['Ivory', 'Ebony'] as const;

function secs(clock: BackgammonOptions['turnTimer']): number {
  return clock === 'Off' ? 0 : Number(clock.split(' ')[0]);
}

function sideOf(s: BackgammonState, id: string): Side {
  const i = s.players.indexOf(id);
  if (i < 0) throw new GameError('NOT_A_PLAYER', "You're not in this game.");
  return i as Side;
}

function mayDouble(s: BackgammonState): boolean {
  if (!s.cubeOn || s.crawford || s.phase !== 'roll' || s.turn === null) return false;
  if (s.cube >= 64) return false;
  if (s.cubeOwner !== null && s.cubeOwner !== s.turn) return false;
  // A player who already needs no more than the cube's value gains nothing by doubling.
  return s.score[s.turn] + s.cube < s.matchTo;
}

function waiting(s: BackgammonState): Side | null {
  if (s.turn === null) return null;
  if (s.phase === 'double') return other(s.turn);
  if (s.phase === 'roll' || s.phase === 'move') return s.turn;
  return null;
}

function table(s: BackgammonState): BackgammonTableView {
  const w = waiting(s);
  return {
    players: [s.players[0], s.players[1]],
    matchTo: s.matchTo,
    cubeOn: s.cubeOn,
    game: s.game,
    score: [s.score[0], s.score[1]],
    pos: s.pos,
    phase: s.phase,
    toAct: w === null ? null : s.players[w],
    turn: s.turn,
    dice: s.dice,
    cube: s.cube,
    cubeOwner: s.cubeOwner === null ? null : s.players[s.cubeOwner],
    crawford: s.crawford,
    canDouble: mayDouble(s),
    pips: [pipCount(s.pos, 0), pipCount(s.pos, 1)],
    last: s.log[s.log.length - 1] ?? null,
    log: s.log.slice(-LOG),
    lastEnd: s.ends[s.ends.length - 1] ?? null,
    actBy: s.actBy,
    showBy: s.showBy,
    winner: s.winner === null ? null : s.players[s.winner],
  };
}

function clocked(s: BackgammonState, now: number): BackgammonState {
  const live = s.phase === 'roll' || s.phase === 'move' || s.phase === 'double';
  return { ...s, actBy: live && s.turnSecs ? now + s.turnSecs * 1000 : null };
}

function log(s: BackgammonState, entry: Omit<TurnLog, 'seq' | 'game'>): BackgammonState {
  const seq = s.seq + 1;
  return { ...s, seq, log: [...s.log, { seq, game: s.game, ...entry }].slice(-LOG) };
}

function roll(rng: Rng): number {
  return rng.int(6) + 1;
}

function bump(pair: [number, number], side: Side, by: number): [number, number] {
  const out: [number, number] = [pair[0], pair[1]];
  out[side] += by;
  return out;
}

function diceText(d: readonly [number, number]): string {
  return `${d[0]}–${d[1]}`;
}

/** A fresh game: the board set up, then one die each until they differ. */
function openGame(s: BackgammonState, rng: Rng, now: number): BackgammonState {
  let ivory = roll(rng);
  let ebony = roll(rng);
  while (ivory === ebony) {
    ivory = roll(rng);
    ebony = roll(rng);
  }
  const first: Side = ivory > ebony ? 0 : 1;
  const dice: [number, number] = [ivory, ebony];
  let next: BackgammonState = {
    ...s,
    game: s.game + 1,
    pos: startPosition(),
    phase: 'move',
    turn: first,
    dice,
    cube: 1,
    cubeOwner: null,
    showBy: null,
    tally: { ...s.tally, rolled: bump(s.tally.rolled, first, ivory + ebony) },
  };
  next = log(next, { by: s.players[first], side: first, kind: 'open', dice });
  return clocked(next, now);
}

/** After a roll: play on, or pass at once if the dice cannot be played. */
function afterRoll(
  s: BackgammonState,
  side: Side,
  dice: [number, number],
  now: number,
  late: boolean,
) {
  const tally = {
    ...s.tally,
    rolled: bump(s.tally.rolled, side, dice[0] === dice[1] ? dice[0] * 4 : dice[0] + dice[1]),
    doublets: dice[0] === dice[1] ? bump(s.tally.doublets, side, 1) : s.tally.doublets,
  };
  const rolled: BackgammonState = { ...s, dice, tally };
  if (mostDice(s.pos, side, dice) === 0) {
    const passed = log(rolled, {
      by: s.players[side],
      side,
      kind: 'blocked',
      dice,
      ...(late ? { late: true } : {}),
    });
    return clocked({ ...passed, phase: 'roll', turn: other(side), dice: null }, now);
  }
  return clocked({ ...rolled, phase: 'move', turn: side }, now);
}

function doRoll(s: BackgammonState, side: Side, rng: Rng, now: number, late = false) {
  return afterRoll(s, side, [roll(rng), roll(rng)], now, late);
}

function endGame(
  s: BackgammonState,
  winner: Side,
  kind: 1 | 2 | 3,
  dropped: boolean,
  now: number,
): BackgammonState {
  const points = s.cube * kind;
  const score = bump(s.score, winner, points);
  const end: GameEnd = {
    game: s.game,
    winner: s.players[winner],
    kind,
    cube: s.cube,
    points,
    dropped,
    score,
  };
  const matchWon = score[winner] >= s.matchTo;
  const loser = other(winner);
  // Crawford: the first time a player comes within a point of the match, the next game is cubeless.
  const crawfordNext =
    s.cubeOn &&
    !s.crawfordUsed &&
    !matchWon &&
    score[winner] === s.matchTo - 1 &&
    score[loser] < s.matchTo - 1;
  const how = dropped
    ? `{${s.players[loser]}} dropped the cube`
    : kind === 1
      ? 'bore off first'
      : `won a ${KIND_NAME[kind]}`;
  const recap: RecapEvent = {
    round: s.game,
    actor: s.players[winner],
    text: dropped
      ? `${how}, so {${s.players[winner]}} took game ${s.game}. ${score[0]}–${score[1]}.`
      : `{${s.players[winner]}} ${how} in game ${s.game}. ${score[0]}–${score[1]}.`,
    tag: `+${points}${kind > 1 ? ` ${kind === 2 ? 'Gammon' : 'Backgammon'}` : ''}`,
    tone: 'good',
    key: true,
  };
  return {
    ...s,
    score,
    ends: [...s.ends, end],
    phase: matchWon ? 'show' : 'between',
    dice: null,
    actBy: null,
    showBy: now + (matchWon ? SHOW_MS : BETWEEN_MS),
    winner: matchWon ? winner : null,
    crawford: crawfordNext,
    crawfordUsed: s.crawfordUsed || crawfordNext,
    recap: [...s.recap, recap],
  };
}

function doMove(
  s: BackgammonState,
  side: Side,
  steps: readonly { from: number; die: number }[],
  now: number,
  late = false,
): BackgammonState {
  if (!s.dice) throw new GameError('NOT_NOW', 'Roll first.');
  const r = playTurn(s.pos, side, s.dice, steps);
  if (typeof r === 'string') throw new GameError('BAD_MOVE', r);
  const hits = r.played.filter((p) => p.hit).length;
  let next = log(
    { ...s, pos: r.pos, tally: { ...s.tally, hits: bump(s.tally.hits, side, hits) } },
    {
      by: s.players[side],
      side,
      kind: 'move',
      dice: s.dice,
      steps: r.played,
      ...(late ? { late: true } : {}),
    },
  );
  if (hits > 0) {
    next = {
      ...next,
      recap: [
        ...next.recap,
        {
          round: s.game,
          actor: s.players[side],
          text: `{${s.players[side]}} hit ${hits === 1 ? 'a blot' : `${hits} blots`} with ${diceText(s.dice)}.`,
          tag: hits > 1 ? `${hits} hits` : 'Hit',
        },
      ],
    };
  }
  if (r.pos.off[side] === 15) return endGame(next, side, winKind(r.pos, side), false, now);
  return clocked({ ...next, phase: 'roll', turn: other(side), dice: null }, now);
}

function cubeAction(s: BackgammonState, side: Side, kind: 'double' | 'take' | 'drop', now: number) {
  if (kind === 'double') {
    if (s.phase !== 'roll' || s.turn !== side)
      throw new GameError('NOT_NOW', 'Double before you roll, on your turn.');
    if (!s.cubeOn) throw new GameError('NO_CUBE', 'This match is played without the cube.');
    if (s.crawford) throw new GameError('NO_CUBE', 'No doubling in the Crawford game.');
    if (!mayDouble(s)) throw new GameError('NO_CUBE', "You can't offer the cube now.");
    const next = log(s, { by: s.players[side], side, kind: 'double', cube: s.cube * 2 });
    return clocked(
      {
        ...next,
        phase: 'double',
        recap: [
          ...next.recap,
          {
            round: s.game,
            actor: s.players[side],
            text: `{${s.players[side]}} offered the cube at ${s.cube * 2}.`,
            tag: `Double to ${s.cube * 2}`,
          },
        ],
      },
      now,
    );
  }
  if (s.phase !== 'double' || s.turn === null || other(s.turn) !== side) {
    throw new GameError('NOT_NOW', 'There is no cube offered to you.');
  }
  if (kind === 'take') {
    const cube = s.cube * 2;
    const next = log(s, { by: s.players[side], side, kind: 'take', cube });
    return clocked(
      {
        ...next,
        cube,
        cubeOwner: side,
        phase: 'roll',
        recap: [
          ...next.recap,
          {
            round: s.game,
            actor: s.players[side],
            text: `{${s.players[side]}} took the cube at ${cube}.`,
            tag: `Took at ${cube}`,
            key: cube >= 4,
          },
        ],
      },
      now,
    );
  }
  const next = log(s, { by: s.players[side], side, kind: 'drop', cube: s.cube });
  return endGame(next, s.turn, 1, true, now);
}

function statsOf(s: BackgammonState, order: Side[]): RecapStats {
  return {
    columns: ['Points', 'Games', 'Hits', 'Rolled'],
    rows: order.map((side) => ({
      playerId: s.players[side],
      values: [
        s.score[side],
        s.ends.filter((e) => e.winner === s.players[side]).length,
        s.tally.hits[side],
        s.tally.rolled[side],
      ],
    })),
  };
}

function resultOf(s: BackgammonState, winners: Side[], summary: string): GameResult {
  const order: Side[] = winners.length === 1 ? [winners[0]!, other(winners[0]!)] : [0, 1];
  const biggest = s.ends.reduce<GameEnd | null>(
    (b, e) => (!b || e.points > b.points ? e : b),
    null,
  );
  const highlights =
    biggest && biggest.points >= 2
      ? [
          {
            award: 'Biggest game',
            playerIds: [biggest.winner],
            text: `${biggest.points} points in one game${biggest.kind > 1 ? `, a ${KIND_NAME[biggest.kind]}` : ''}`,
            value: biggest.points,
          },
        ]
      : [];
  return {
    winners: winners.map((side) => s.players[side]),
    summary,
    reveal: {
      players: [s.players[0], s.players[1]],
      matchTo: s.matchTo,
      score: s.score,
      ends: s.ends,
      pos: s.pos,
      winner: s.winner === null ? null : s.players[s.winner],
    } satisfies BackgammonReveal,
    recap: s.recap,
    roundName: 'Game',
    stats: statsOf(s, order),
    standings: [0, 1].map((side) => ({
      playerId: s.players[side as Side],
      outcome: winners.length > 1 ? 'draw' : winners.includes(side as Side) ? 'win' : 'loss',
      team: SIDE_NAME[side as Side],
    })),
    ...(highlights.length ? { highlights } : {}),
  };
}

function matchSummary(s: BackgammonState, winner: Side): string {
  const last = s.ends[s.ends.length - 1];
  const how = last && last.kind > 1 && !last.dropped ? ` with a ${KIND_NAME[last.kind]}` : '';
  return s.matchTo === 1
    ? `Won the game${how}.`
    : `Won the match ${s.score[winner]}–${s.score[other(winner)]}${how}.`;
}

export const backgammon: GameModule<
  BackgammonState,
  BackgammonAction,
  BackgammonPlayerView,
  BackgammonTableView,
  BackgammonOptions
> = {
  meta,
  optionsSchema,
  actionSchema,

  defaultOptions() {
    return { matchTo: '3 points', cube: 'On', turnTimer: 'Off' };
  },

  validateOptions(_options, playerCount) {
    return playerCount === 2 ? null : 'Backgammon needs two players.';
  },

  setup({ playerIds, options, rng, now }) {
    const base: BackgammonState = {
      players: [playerIds[0]!, playerIds[1]!],
      matchTo: Number(options.matchTo.split(' ')[0]),
      cubeOn: options.cube === 'On',
      turnSecs: secs(options.turnTimer),
      game: 0,
      score: [0, 0],
      pos: startPosition(),
      phase: 'roll',
      turn: null,
      dice: null,
      cube: 1,
      cubeOwner: null,
      crawford: false,
      crawfordUsed: false,
      seq: 0,
      log: [],
      actBy: null,
      showBy: null,
      ends: [],
      winner: null,
      tally: { hits: [0, 0], rolled: [0, 0], doublets: [0, 0] },
      recap: [],
    };
    return openGame(base, rng, now);
  },

  getPlayerView(s, playerId) {
    const i = s.players.indexOf(playerId);
    return { ...table(s), me: playerId, side: i < 0 ? null : (i as Side) };
  },

  getTableView: table,

  applyAction(s, playerId, action, rng, now) {
    if (s.phase === 'show' || s.phase === 'over')
      throw new GameError('GAME_OVER', 'The match is over.');
    const side = sideOf(s, playerId);
    switch (action.type) {
      case 'next':
        if (s.phase !== 'between')
          throw new GameError('NOT_NOW', 'This game is still being played.');
        return openGame(s, rng, now);
      case 'double':
      case 'take':
      case 'drop':
        return cubeAction(s, side, action.type, now);
      case 'roll':
        if (s.phase !== 'roll' || s.turn !== side) {
          throw new GameError(
            'NOT_YOUR_TURN',
            s.phase === 'double' ? 'Answer the cube first.' : "It isn't your roll.",
          );
        }
        return doRoll(s, side, rng, now);
      case 'move':
        if (s.phase !== 'move' || s.turn !== side)
          throw new GameError('NOT_YOUR_TURN', "It isn't your move.");
        return doMove(s, side, action.steps, now);
    }
  },

  getResult(s) {
    if (s.phase !== 'over' || s.winner === null) return null;
    return resultOf(s, [s.winner], matchSummary(s, s.winner));
  },

  partialResult(s) {
    if (s.winner !== null) return resultOf(s, [s.winner], matchSummary(s, s.winner));
    if (s.ends.length === 0) return null;
    const [a, b] = s.score;
    if (a === b) return resultOf(s, [0, 1], `Level at ${a}–${b}.`);
    const lead: Side = a > b ? 0 : 1;
    return resultOf(s, [lead], `Led ${Math.max(a, b)}–${Math.min(a, b)}.`);
  },

  waitingOn(s) {
    const w = waiting(s);
    return w === null ? [] : [s.players[w]];
  },

  announce(prev, next) {
    const lines: Announcement[] = [];
    const since = prev?.seq ?? 0;
    for (const entry of next.log) {
      if (entry.seq <= since) continue;
      const who = `{${entry.by}}`;
      if (entry.kind === 'open' && entry.dice) {
        const crawford = next.crawford ? ' The Crawford game: no cube.' : '';
        lines.push(`Game ${entry.game}. ${who} opens with ${diceText(entry.dice)}.${crawford}`);
      }
      if (entry.kind === 'double') lines.push(`${who} doubles to ${entry.cube}.`);
      if (entry.kind === 'take') lines.push(`${who} takes. The cube is on ${entry.cube}.`);
      if (entry.kind === 'blocked' && entry.dice)
        lines.push(`${who} rolled ${diceText(entry.dice)} and cannot move.`);
    }
    const end = next.ends[next.ends.length - 1];
    if (end && (prev?.ends.length ?? 0) < next.ends.length) {
      const how = end.dropped ? 'on a dropped cube' : `a ${KIND_NAME[end.kind]}`;
      lines.push(
        `{${end.winner}} wins game ${end.game}, ${how}, for ${end.points} ${end.points === 1 ? 'point' : 'points'}. ${end.score[0]}–${end.score[1]}.`,
      );
    }
    return lines;
  },

  nextTimer(s) {
    if ((s.phase === 'between' || s.phase === 'show') && s.showBy)
      return { id: s.phase, at: s.showBy };
    if (s.actBy && (s.phase === 'roll' || s.phase === 'move' || s.phase === 'double')) {
      return { id: s.phase, at: s.actBy };
    }
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'show' && s.phase === 'show') return { ...s, phase: 'over', showBy: null };
    if (id === 'between' && s.phase === 'between') return openGame(s, rng, now);
    if (s.turn === null || id !== s.phase) return s;
    // Out of time: the table plays for them. A cube offered is taken; a roll is rolled; a move is
    // the first legal turn after a shuffle.
    if (s.phase === 'double') return cubeAction(s, other(s.turn), 'take', now);
    if (s.phase === 'roll') return doRoll(s, s.turn, rng, now, true);
    if (s.phase === 'move' && s.dice) {
      const turns = legalTurns(s.pos, s.turn, s.dice);
      const pick = turns.length ? rng.pick(turns) : [];
      return doMove(s, s.turn, pick, now, true);
    }
    return s;
  },

  botDelayMs: 1400,
  bot: backgammonBot,
};
