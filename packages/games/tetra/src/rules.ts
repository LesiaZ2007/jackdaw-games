import {
  type Announcement,
  type GameModule,
  type GameResult,
  type Highlight,
  type RecapEvent,
  type RecapStats,
  type Rng,
  type Standing,
} from '@jackdaw/engine';
import { z } from 'zod';
import { tetraBot } from './bot';
import { meta } from './meta';
import { H, KINDS, W, freshStack, type Incoming, type Pace, type Stack } from './sim';

/**
 * Tetra, for one to eight. Everyone plays their own well on their own phone, with the same
 * stones in the same order. The phone runs the well itself and reports it every moment or so
 * (a `tick`): the well, its counters, the rubble thrown so far, and how much owed rubble it has
 * used. Everything in a tick is cumulative, so a repeated or late tick changes nothing and a
 * refreshed phone picks up where it left off. The server only routes rubble, keeps score, and
 * runs the rounds.
 *
 * - Versus: rubble you throw lands on someone else (Even, Random or Payback). Topped out, you're
 *   out; the last one standing wins the round, and first to the set number of round wins takes
 *   the match. Whoever threw the last rubble at a player who tops out gets the knockout.
 * - Sprint: forty lines, fastest wins. Blitz: two minutes, best score wins.
 *
 * Ticks are never refused (a refusal would pop a toast on the phone): a tick for an old round, or
 * older than what's already in, is simply ignored.
 */

const MODES = ['Versus', 'Sprint', 'Blitz'] as const;
const FIRST_TO = ['1 win', '2 wins', '3 wins', '5 wins'] as const;
const TARGETS = ['Even', 'Random', 'Payback'] as const;
const PACES = ['Gentle', 'Steady', 'Fierce'] as const satisfies readonly Pace[];

/** Before each round: three, two, one. */
export const COUNTDOWN_MS = 3_000;
/** Between rounds of a match. */
export const BETWEEN_MS = 5_500;
/** The last moment of a match stays up this long before the results. */
export const SHOW_MS = 3_200;
export const SPRINT_LINES = 40;
export const BLITZ_MS = 120_000;
/** Ticks from Blitz phones keep arriving a moment after the bell. */
export const BLITZ_GRACE_MS = 1_500;
/** A Sprint ends for everyone after this long. */
export const SPRINT_CAP_MS = 6 * 60_000;
/** Most rubble one tick can throw, against a broken or doctored phone. */
const MAX_THROW = 40;
const FEED = 14;

export const optionsSchema = z.object({
  mode: z.enum(MODES).describe('Mode'),
  firstTo: z.enum(FIRST_TO).describe('Match'),
  targeting: z.enum(TARGETS).describe('Rubble goes to'),
  pace: z.enum(PACES).describe('Speed'),
});
export type TetraOptions = z.infer<typeof optionsSchema>;
export type Mode = 'versus' | 'sprint' | 'blitz';

const n = () => z.number().int().min(-1).max(1_000_000_000);
export const stackSchema = z.object({
  well: z.string().regex(new RegExp(`^[.IJLOSTZG]{${W * H}}$`)),
  hold: z.enum(KINDS).nullable(),
  next: n(),
  combo: n(),
  b2b: n(),
  lines: n(),
  pieces: n(),
  sent: n(),
  blocked: n(),
  score: n(),
  topped: z.boolean(),
  quads: n(),
  twists: n(),
  perfects: n(),
  bestCombo: n(),
  bestThrow: n(),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tick'),
    round: z.number().int().min(1),
    stack: stackSchema,
    /** Rows used from each owed throw so far, cumulative: [id, rows]. */
    used: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(200),
    /** Sprint: when the fortieth line went, in ms since the round began. */
    finishMs: z.number().int().min(0).max(SPRINT_CAP_MS).optional(),
  }),
]);
export type TetraAction = z.infer<typeof actionSchema>;

/** Rubble thrown at a player, as the server keeps it. */
export interface Owed {
  id: number;
  total: number;
  used: number;
  hole: number;
  at: number;
  from: string;
}

export interface Board {
  stack: Stack;
  owed: Owed[];
  /** Out of the round: topped out, or (Sprint) finished. */
  done: boolean;
  /** Finished Sprint, in ms. */
  finishMs: number | null;
  /** This round's placing once decided (1 is best). */
  place: number | null;
  kos: number;
  koBy: string | null;
  lastHitBy: string | null;
  /** Rubble thrown at this player this round. */
  received: number;
  /** Server time of the last tick that changed anything (or the round's start). */
  lastAt: number;
}

export interface FeedItem {
  seq: number;
  at: number;
  kind: 'ko' | 'out' | 'clear' | 'finish';
  who: string;
  by?: string;
  /** For a clear: its name ("Quad", "Perfect clear"). */
  text?: string;
  /** Rubble thrown, or the Sprint time in ms. */
  value?: number;
}

export interface RoundEnd {
  round: number;
  /** Best first. */
  order: string[];
  winner: string | null;
}

export interface Career {
  lines: number;
  sent: number;
  pieces: number;
  kos: number;
  playMs: number;
  bestThrow: number;
  bestCombo: number;
  quads: number;
  /** Best Sprint time and Blitz score. */
  bestSprint: number | null;
  bestBlitz: number | null;
}

export type Phase = 'play' | 'between' | 'show' | 'over';

export interface TetraState {
  players: string[];
  mode: Mode;
  firstTo: number;
  targeting: (typeof TARGETS)[number];
  pace: Pace;
  round: number;
  seed: number;
  phase: Phase;
  /** Stones start falling at this server time (the countdown runs until then). */
  startAt: number;
  /** Blitz: the bell. */
  endsAt: number | null;
  showBy: number | null;
  boards: Record<string, Board>;
  gid: number;
  wins: Record<string, number>;
  seq: number;
  feed: FeedItem[];
  rounds: RoundEnd[];
  career: Record<string, Career>;
  recap: RecapEvent[];
}

/** A player's well as everyone sees it. */
export interface PublicBoard {
  id: string;
  well: string;
  hold: Stack['hold'];
  lines: number;
  pieces: number;
  sent: number;
  score: number;
  combo: number;
  b2b: number;
  done: boolean;
  topped: boolean;
  place: number | null;
  finishMs: number | null;
  kos: number;
  /** Rubble rows owed right now. */
  owing: number;
  playMs: number;
}

export interface TetraTableView {
  mode: Mode;
  firstTo: number;
  targeting: TetraState['targeting'];
  pace: Pace;
  round: number;
  phase: Phase;
  startAt: number;
  endsAt: number | null;
  showBy: number | null;
  boards: PublicBoard[];
  wins: Record<string, number>;
  feed: FeedItem[];
  rounds: RoundEnd[];
}

export interface TetraPlayerView extends TetraTableView {
  me: string;
  /** Null for someone watching. */
  seed: number | null;
  stack: Stack | null;
  /** My owed rubble, rows still to come. */
  owed: OwedView[];
}

/** One throw owed to me: `lines` is what's left, `used` and `total` let a phone report cumulatively. */
export type OwedView = Incoming & { used: number; total: number };

function modeOf(o: TetraOptions): Mode {
  return o.mode === 'Sprint' ? 'sprint' : o.mode === 'Blitz' ? 'blitz' : 'versus';
}

function freshBoard(at: number): Board {
  return {
    stack: freshStack(),
    owed: [],
    done: false,
    finishMs: null,
    place: null,
    kos: 0,
    koBy: null,
    lastHitBy: null,
    received: 0,
    lastAt: at,
  };
}

function freshCareer(): Career {
  return {
    lines: 0,
    sent: 0,
    pieces: 0,
    kos: 0,
    playMs: 0,
    bestThrow: 0,
    bestCombo: 0,
    quads: 0,
    bestSprint: null,
    bestBlitz: null,
  };
}

function startRound(s: TetraState, rng: Rng, now: number): TetraState {
  const round = s.round + 1;
  const startAt = now + COUNTDOWN_MS;
  return {
    ...s,
    round,
    seed: rng.int(2 ** 31),
    phase: 'play',
    startAt,
    endsAt: s.mode === 'blitz' ? startAt + BLITZ_MS : null,
    showBy: null,
    boards: Object.fromEntries(s.players.map((id) => [id, freshBoard(startAt)])),
  };
}

function pushFeed(s: TetraState, item: Omit<FeedItem, 'seq'>): TetraState {
  const seq = s.seq + 1;
  return { ...s, seq, feed: [...s.feed, { ...item, seq }].slice(-FEED) };
}

function playMs(s: TetraState, b: Board): number {
  return Math.max(0, (b.finishMs ?? b.lastAt - s.startAt) | 0);
}

/** Who a throw lands on. */
function target(s: TetraState, from: string, rng: Rng): string | null {
  const open = s.players.filter((id) => id !== from && !s.boards[id]!.done);
  if (open.length === 0) return null;
  if (s.targeting === 'Random') return rng.pick(open);
  if (s.targeting === 'Payback') {
    const back = s.boards[from]!.lastHitBy;
    if (back && open.includes(back)) return back;
  }
  const least = Math.min(...open.map((id) => s.boards[id]!.received));
  return rng.pick(open.filter((id) => s.boards[id]!.received === least));
}

function tick(s: TetraState, playerId: string, a: TetraAction, rng: Rng, now: number): TetraState {
  if (s.phase !== 'play' || a.round !== s.round) return s;
  const prev = s.boards[playerId];
  if (!prev || prev.done) return s;
  if (now < s.startAt - 1_000) return s;
  if (a.stack.pieces < prev.stack.pieces) return s;

  // Owed rubble used, never less than before.
  const usedBy = new Map(a.used);
  const owed = prev.owed
    .map((g) => ({ ...g, used: Math.max(g.used, Math.min(g.total, usedBy.get(g.id) ?? 0)) }))
    .filter((g) => g.used < g.total);

  const stack: Stack = { ...a.stack, sent: Math.max(a.stack.sent, prev.stack.sent) };
  const thrown = Math.min(MAX_THROW, stack.sent - prev.stack.sent);
  let board: Board = { ...prev, stack, owed, lastAt: now };
  let out: TetraState = { ...s, boards: { ...s.boards, [playerId]: board } };

  // What's worth a line in the feed.
  const clearName =
    stack.perfects > prev.stack.perfects
      ? 'Perfect clear'
      : stack.quads > prev.stack.quads
        ? 'Quad'
        : stack.twists > prev.stack.twists
          ? 'T-twist'
          : stack.combo >= 4 && stack.combo > prev.stack.combo
            ? `${stack.combo + 1} chain`
            : null;
  if (clearName)
    out = pushFeed(out, { at: now, kind: 'clear', who: playerId, text: clearName, value: thrown });

  if (thrown > 0 && out.mode === 'versus') {
    const to = target(out, playerId, rng);
    if (to) {
      const t = out.boards[to]!;
      const g: Owed = {
        id: out.gid + 1,
        total: thrown,
        used: 0,
        hole: rng.int(W),
        at: now,
        from: playerId,
      };
      out = {
        ...out,
        gid: out.gid + 1,
        boards: {
          ...out.boards,
          [to]: { ...t, owed: [...t.owed, g], received: t.received + thrown, lastHitBy: playerId },
        },
      };
    }
  }

  if (stack.topped) {
    board = out.boards[playerId]!;
    const standing = out.players.filter((id) => !out.boards[id]!.done).length;
    const by = out.mode === 'versus' ? board.lastHitBy : null;
    out = {
      ...out,
      boards: {
        ...out.boards,
        [playerId]: {
          ...board,
          done: true,
          owed: [],
          koBy: by,
          place: out.mode === 'versus' ? standing : null,
        },
        ...(by ? { [by]: { ...out.boards[by]!, kos: out.boards[by]!.kos + 1 } } : {}),
      },
    };
    out = pushFeed(out, { at: now, kind: by ? 'ko' : 'out', who: playerId, ...(by ? { by } : {}) });
    if (by) {
      out = {
        ...out,
        recap: [
          ...out.recap,
          {
            round: out.round,
            actor: by,
            text: `{${by}} knocked out {${playerId}}.`,
            tag: 'KO',
            key: true,
          },
        ],
      };
    }
  } else if (out.mode === 'sprint' && stack.lines >= SPRINT_LINES) {
    const ms = a.finishMs ?? now - out.startAt;
    board = out.boards[playerId]!;
    out = {
      ...out,
      boards: { ...out.boards, [playerId]: { ...board, done: true, finishMs: ms } },
    };
    out = pushFeed(out, { at: now, kind: 'finish', who: playerId, value: ms });
  }

  return checkRoundEnd(out, rng, now);
}

/** Ends the round if it's decided: one left standing (Versus), or everyone done. */
function checkRoundEnd(s: TetraState, rng: Rng, now: number): TetraState {
  if (s.phase !== 'play') return s;
  const left = s.players.filter((id) => !s.boards[id]!.done);
  if (s.mode === 'versus') return left.length <= 1 ? endRound(s, rng, now) : s;
  return left.length === 0 ? endRound(s, rng, now) : s;
}

export function fmtTime(ms: number): string {
  const sec = ms / 1000;
  const m = Math.floor(sec / 60);
  const rest = (sec - m * 60).toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${rest}` : `${sec.toFixed(2)}s`;
}

/** This round's order, best first. */
function orderOf(s: TetraState): string[] {
  const b = s.boards;
  if (s.mode === 'versus') {
    return [...s.players].sort((x, y) => (b[x]!.place ?? 0) - (b[y]!.place ?? 0));
  }
  if (s.mode === 'sprint') {
    return [...s.players].sort((x, y) => {
      const fx = b[x]!.finishMs;
      const fy = b[y]!.finishMs;
      if (fx !== null && fy !== null) return fx - fy;
      if (fx !== null) return -1;
      if (fy !== null) return 1;
      return b[y]!.stack.lines - b[x]!.stack.lines;
    });
  }
  return [...s.players].sort((x, y) => b[y]!.stack.score - b[x]!.stack.score);
}

function endRound(s: TetraState, _rng: Rng, now: number): TetraState {
  // Whoever's still standing in Versus takes first place.
  const boards = { ...s.boards };
  for (const id of s.players) {
    const b = boards[id]!;
    if (s.mode === 'versus' && !b.done) boards[id] = { ...b, done: true, place: 1, lastAt: now };
    else if (!b.done) boards[id] = { ...b, done: true, lastAt: Math.min(now, s.endsAt ?? now) };
  }
  let out: TetraState = { ...s, boards };
  const order = orderOf(out);
  const winner = order[0] ?? null;
  const wins = { ...out.wins };
  if (winner) wins[winner] = (wins[winner] ?? 0) + 1;

  const career = { ...out.career };
  for (const id of out.players) {
    const b = out.boards[id]!;
    const c = career[id] ?? freshCareer();
    career[id] = {
      lines: c.lines + b.stack.lines,
      sent: c.sent + b.stack.sent,
      pieces: c.pieces + b.stack.pieces,
      kos: c.kos + b.kos,
      playMs: c.playMs + playMs(out, b),
      bestThrow: Math.max(c.bestThrow, b.stack.bestThrow),
      bestCombo: Math.max(c.bestCombo, b.stack.bestCombo),
      quads: c.quads + b.stack.quads,
      bestSprint:
        b.finishMs !== null ? Math.min(c.bestSprint ?? Infinity, b.finishMs) : c.bestSprint,
      bestBlitz: out.mode === 'blitz' ? Math.max(c.bestBlitz ?? 0, b.stack.score) : c.bestBlitz,
    };
  }

  const w = winner ? out.boards[winner]! : null;
  const how =
    !w || !winner
      ? 'No one'
      : out.mode === 'versus'
        ? `{${winner}} is the last one standing`
        : out.mode === 'sprint'
          ? w.finishMs !== null
            ? `{${winner}} clears forty lines in ${fmtTime(w.finishMs)}`
            : `{${winner}} gets furthest, ${w.stack.lines} lines`
          : `{${winner}} scores ${w.stack.score.toLocaleString('en-GB')}`;
  const matchOver =
    out.mode !== 'versus' || (winner !== null && (wins[winner] ?? 0) >= out.firstTo);
  out = {
    ...out,
    wins,
    career,
    rounds: [...out.rounds, { round: out.round, order, winner }],
    recap: [
      ...out.recap,
      {
        round: out.round,
        ...(winner ? { actor: winner } : {}),
        text: `${how}.`,
        tag: out.mode === 'versus' ? `${wins[winner ?? ''] ?? 0} of ${out.firstTo}` : 'Winner',
        tone: 'good',
        key: matchOver,
      },
    ],
    phase: matchOver ? 'show' : 'between',
    showBy: now + (matchOver ? SHOW_MS : BETWEEN_MS),
  };
  return out;
}

function publicBoard(s: TetraState, id: string): PublicBoard {
  const b = s.boards[id]!;
  return {
    id,
    well: b.stack.well,
    hold: b.stack.hold,
    lines: b.stack.lines,
    pieces: b.stack.pieces,
    sent: b.stack.sent,
    score: b.stack.score,
    combo: b.stack.combo,
    b2b: b.stack.b2b,
    done: b.done,
    topped: b.stack.topped,
    place: b.place,
    finishMs: b.finishMs,
    kos: b.kos,
    owing: b.owed.reduce((a, g) => a + g.total - g.used, 0),
    playMs: playMs(s, b),
  };
}

function table(s: TetraState): TetraTableView {
  return {
    mode: s.mode,
    firstTo: s.firstTo,
    targeting: s.targeting,
    pace: s.pace,
    round: s.round,
    phase: s.phase,
    startAt: s.startAt,
    endsAt: s.endsAt,
    showBy: s.showBy,
    boards: s.players.map((id) => publicBoard(s, id)),
    wins: s.wins,
    feed: s.feed,
    rounds: s.rounds,
  };
}

const pps = (c: Career) => (c.playMs > 0 ? (c.pieces / (c.playMs / 1000)).toFixed(2) : '0.00');

function resultOf(s: TetraState, winners: string[], summary: string): GameResult {
  const last = s.rounds[s.rounds.length - 1];
  const order =
    s.mode === 'versus'
      ? [...s.players].sort(
          (a, b) =>
            (s.wins[b] ?? 0) - (s.wins[a] ?? 0) ||
            (last ? last.order.indexOf(a) - last.order.indexOf(b) : 0),
        )
      : (last?.order ?? s.players);
  const c = (id: string) => s.career[id] ?? freshCareer();
  const stats: RecapStats =
    s.mode === 'versus'
      ? {
          columns: ['Rounds', 'KOs', 'Rubble thrown', 'Lines', 'Stones a second'],
          rows: order.map((id) => ({
            playerId: id,
            values: [s.wins[id] ?? 0, c(id).kos, c(id).sent, c(id).lines, pps(c(id))],
          })),
        }
      : s.mode === 'sprint'
        ? {
            columns: ['Time', 'Lines', 'Stones a second'],
            rows: order.map((id) => ({
              playerId: id,
              values: [
                s.boards[id]?.finishMs != null ? fmtTime(s.boards[id]!.finishMs!) : 'Unfinished',
                c(id).lines,
                pps(c(id)),
              ],
            })),
          }
        : {
            columns: ['Score', 'Lines', 'Stones a second'],
            rows: order.map((id) => ({
              playerId: id,
              values: [s.boards[id]?.stack.score ?? 0, c(id).lines, pps(c(id))],
            })),
          };
  const highlights: Highlight[] = [];
  const thrower = [...s.players].sort((a, b) => c(b).bestThrow - c(a).bestThrow)[0];
  if (thrower && c(thrower).bestThrow >= 4) {
    highlights.push({
      award: 'Biggest throw',
      playerIds: [thrower],
      text: `${c(thrower).bestThrow} rows of rubble at once`,
      value: c(thrower).bestThrow,
    });
  }
  if (s.mode === 'sprint') {
    const fast = [...s.players]
      .filter((id) => c(id).bestSprint !== null)
      .sort((a, b) => c(a).bestSprint! - c(b).bestSprint!)[0];
    if (fast) {
      highlights.push({
        award: 'Fastest forty lines',
        playerIds: [fast],
        text: fmtTime(c(fast).bestSprint!),
        value: Math.max(1, SPRINT_CAP_MS - c(fast).bestSprint!),
      });
    }
  }
  const standings: Standing[] = s.players.map((id) => ({
    playerId: id,
    outcome: winners.includes(id) ? 'win' : 'loss',
  }));
  return {
    winners,
    summary,
    reveal: { order, mode: s.mode, rounds: s.rounds, wins: s.wins },
    recap: s.recap,
    roundName: 'Round',
    standings,
    stats,
    highlights,
  };
}

function summaryOf(s: TetraState, winner: string): string {
  const last = s.recap[s.recap.length - 1];
  if (s.mode === 'versus') {
    if (s.players.length === 1) return `{${winner}} wins.`;
    return `{${winner}} wins the match, ${s.wins[winner] ?? 0} rounds to ${Math.max(
      0,
      ...s.players.filter((id) => id !== winner).map((id) => s.wins[id] ?? 0),
    )}.`;
  }
  return last?.text ?? `{${winner}} wins.`;
}

export const tetra: GameModule<
  TetraState,
  TetraAction,
  TetraPlayerView,
  TetraTableView,
  TetraOptions
> = {
  meta,
  optionsSchema,
  actionSchema,

  defaultOptions(playerCount) {
    return {
      mode: playerCount <= 1 ? 'Sprint' : 'Versus',
      firstTo: '2 wins',
      targeting: 'Even',
      pace: 'Steady',
    };
  },

  validateOptions(options, playerCount) {
    if (options.mode === 'Versus' && playerCount < 2)
      return 'Versus needs two or more. Add a bot, or play Sprint or Blitz.';
    return null;
  },

  setup({ playerIds, options, rng, now }) {
    const base: TetraState = {
      players: [...playerIds],
      mode: modeOf(options),
      firstTo: Number(options.firstTo.split(' ')[0]),
      targeting: options.targeting,
      pace: options.pace,
      round: 0,
      seed: 0,
      phase: 'play',
      startAt: now,
      endsAt: null,
      showBy: null,
      boards: {},
      gid: 0,
      wins: Object.fromEntries(playerIds.map((id) => [id, 0])),
      seq: 0,
      feed: [],
      rounds: [],
      career: Object.fromEntries(playerIds.map((id) => [id, freshCareer()])),
      recap: [],
    };
    return startRound(base, rng, now);
  },

  getPlayerView(s, playerId) {
    const b = s.boards[playerId];
    return {
      ...table(s),
      me: playerId,
      seed: b ? s.seed : null,
      stack: b ? b.stack : null,
      owed: b
        ? b.owed.map((g) => ({
            id: g.id,
            lines: g.total - g.used,
            hole: g.hole,
            at: g.at,
            used: g.used,
            total: g.total,
          }))
        : [],
    };
  },

  getTableView: table,

  applyAction(s, playerId, action, rng, now) {
    return tick(s, playerId, action, rng, now);
  },

  getResult(s) {
    if (s.phase !== 'over') return null;
    const winner = s.rounds[s.rounds.length - 1]?.winner;
    if (!winner) return resultOf(s, [], 'No one finished.');
    return resultOf(s, [winner], summaryOf(s, winner));
  },

  partialResult(s) {
    if (s.mode !== 'versus' || s.rounds.length === 0) return null;
    const best = Math.max(...s.players.map((id) => s.wins[id] ?? 0));
    const leaders = s.players.filter((id) => (s.wins[id] ?? 0) === best);
    return resultOf(
      s,
      leaders,
      leaders.length === 1 ? `{${leaders[0]}} led with ${best}.` : `Level at ${best} each.`,
    );
  },

  waitingOn() {
    return [];
  },

  announce(prev, next) {
    const lines: Announcement[] = [];
    if (!prev || prev.round !== next.round) {
      if (next.mode === 'versus')
        lines.push(
          next.round === 1
            ? `First to ${next.firstTo} ${next.firstTo === 1 ? 'round' : 'rounds'}. Stones fall in three…`
            : `Round ${next.round}. Stones fall in three…`,
        );
      else
        lines.push(
          next.mode === 'sprint'
            ? 'Sprint: forty lines, as fast as you can.'
            : 'Blitz: two minutes. Score all you can.',
        );
    }
    const since = prev?.seq ?? 0;
    for (const f of next.feed) {
      if (f.seq <= since) continue;
      if (f.kind === 'ko' && f.by) lines.push(`{${f.by}} knocked out {${f.who}}.`);
      if (f.kind === 'finish' && f.value !== undefined)
        lines.push(`{${f.who}} cleared forty lines in ${fmtTime(f.value)}.`);
    }
    if (prev && prev.rounds.length < next.rounds.length && next.mode === 'versus') {
      const r = next.rounds[next.rounds.length - 1]!;
      if (r.winner) lines.push(`{${r.winner}} takes round ${r.round}.`);
    }
    return lines;
  },

  nextTimer(s) {
    if ((s.phase === 'between' || s.phase === 'show') && s.showBy)
      return { id: s.phase, at: s.showBy };
    if (s.phase === 'play' && s.mode === 'blitz' && s.endsAt)
      return { id: 'bell', at: s.endsAt + BLITZ_GRACE_MS };
    if (s.phase === 'play' && s.mode === 'sprint')
      return { id: 'bell', at: s.startAt + SPRINT_CAP_MS };
    return null;
  },

  onTimer(s, id, rng, now) {
    if (id === 'show' && s.phase === 'show') return { ...s, phase: 'over', showBy: null };
    if (id === 'between' && s.phase === 'between') return startRound(s, rng, now);
    if (id === 'bell' && s.phase === 'play') return endRound(s, rng, now);
    return s;
  },

  botDelayMs: (s) => (s.phase === 'play' ? 380 : 2_000),
  bot: tetraBot,
};
