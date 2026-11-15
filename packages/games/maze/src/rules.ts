import type {
  Announcement,
  GameModule,
  GameResult,
  RecapEvent,
  RecapStats,
  Rng,
  Standing,
} from '@jackdaw/engine';
import { z } from 'zod';
import { meta } from './meta';
import {
  defaultOptions,
  enabledPowers,
  optionsSchema,
  resolveSize,
  validateOptions,
} from './options';
import type { MazeOptions } from './options';
import { mazeBot } from './bot';
import { initShared, settleShared } from './shared';
import type { Turn } from './sim/chomper';
import type { Aim, GhostCheckpoint, GhostEvent } from './sim/ghosts';
import { layoutAt } from './sim/generate';
import type { MazeRef } from './sim/generate';
import { MAZE_LAYOUTS, SIZE_DIMS, layoutsOf } from './sim/layouts';
import type { MazeLayout } from './sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from './sim/pellets';
import { ATTACK_POWERS, FRUIT, POINTS, POWER_KINDS, powerMs, speeds } from './sim/powers';
import type { PowerKind } from './sim/powers';
import type { Dir } from './sim/walker';

/**
 * Maze, for one to eight. Every phone runs its own chomper and reports cumulative facts in a
 * `tick`: the pellets it ate (a bitset that only grows), the ghosts it ate, the power spots and
 * fruit it picked up, how often it was caught, where it is and how it turned. The server keeps
 * score from those facts, moves players through the mazes, routes attacks and runs the clock.
 *
 * Ticks are never refused (a refusal would pop a toast on the phone): a tick that is stale,
 * repeated, out of order, for another round or maze, or implausible is ignored and the state is
 * returned unchanged.
 *
 * - Solo: three lives; clearing a maze moves on to the next after a countdown; the round ends
 *   when the last maze is cleared or the lives run out.
 * - Race: everyone plays the same mazes on their own phone. Eating a ghost sends a jinx at the
 *   leader (or second place, if you lead); clearing a maze fogs everyone else. The first finish
 *   ends the round (with a short grace for close finishes) and the earliest finish time gets the
 *   finish bonus; the bell is the backstop. Highest score wins.
 * - Shared maze: one maze at a time for everyone; once it's all eaten everyone moves on to the
 *   next together. The round ends after the last maze or at the bell; ticks are settled in
 *   shared.ts.
 */

/** Before the first maze, and between mazes (per player): three, two, one. */
export const COUNTDOWN_MS = 3_000;
/** The end of a round stays up this long before the results. */
export const SHOW_MS = 4_000;
/** Ticks keep arriving a moment after the bell (or after the first Race finish). */
export const BELL_GRACE_MS = 1_500;
/** A tick dated further ahead of the server's round clock than this is ignored. */
export const FUTURE_MS = 2_000;
/** Attacks waiting in a player's inbox, at most. */
export const INBOX_MAX = 3;
/** An attack leaves the inbox after this long (round ms); the phone applies it on arrival. */
export const INBOX_MS = 10_000;
export const LIVES = 3;
export const TURNS_KEPT = 40;
/** Solo has no timer, but a backstop bell rings this long after play starts. */
export const SOLO_BELL_MS = 30 * 60_000;
/** Pellets a tick may add beyond what the fastest chomper could reach (Magnet grabs a few). */
const EAT_SLACK = 24;

export type Mode = MazeOptions['mode'];
export type Phase = 'countdown' | 'play' | 'between' | 'over';

export interface Attack {
  id: number;
  kind: 'jinx' | 'freeze' | 'steal' | 'fog';
  from: string;
  /** Server round ms when it was sent. */
  atMs: number;
  /** Steal: points taken. */
  amount?: number;
}

/** Facts for the maze a player is on now. They only grow. */
export interface MazeFacts {
  /** Ghosts eaten: [tMs, ghost]. */
  ghosts: [number, number][];
  /** Fruit eaten, as FRUIT indexes, in order. */
  fruit: number[];
  /** Power spots picked up: [tMs, spot, kind] (kind as the server reads the spot). */
  powers: [number, number, PowerKind][];
  /** Round ms of each catch on this maze; a catch starts the ghost combo over. */
  caughtAt: number[];
}

export interface PlayerRec {
  seq: number;
  /** 0-based maze index into `layouts`. */
  maze: number;
  /** Round ms when play on the current maze starts (its ghost clock starts here). */
  mazeAt: number;
  /** Pellet bitset (encodeBits) for the current maze. */
  eaten: string;
  score: number;
  lives: number;
  pos: [number, number, Dir | null];
  lastT: number;
  /** Last ≤40 turns. */
  turns: Turn[];
  /** Round totals. */
  ghostsEaten: number;
  caught: number;
  fruit: number;
  pellets: number;
  cleared: number;
  finishMs: number | null;
  power: { kind: PowerKind; untilMs: number } | null;
  inbox: Attack[];
  done: boolean;
  facts: MazeFacts;
  /** Points from mazes already cleared, bonuses included. */
  banked: number;
  /** Server-side points: the Race finish bonus, steals given and taken. */
  adjust: number;
  /**
   * Shared and Race: points lost to catches. Each catch costs up to 200, but never more than
   * the player had when it was reported, so earlier catches can't eat later points.
   */
  lost?: number;
}

export interface PowerSpot {
  spot: number;
  /** What it holds (or will hold once back); null when it's gone for good (Classic). */
  kind: PowerKind | null;
  /** Round ms when it's up again; 0 at the start. */
  backAt: number;
}

/** The server's ghosts at a beat (round ms `atMs`), for everyone to restore and step on from. */
export interface GhostBase {
  atMs: number;
  /** Goes up each time a base is made or stepped again, so a phone knows to restore it. */
  rev: number;
  c: GhostCheckpoint;
}

export interface SharedRec {
  /** base64 of one byte per pellet: 0 = free, k = player index + 1. */
  owner: string;
  /** A beat every AIM_MS (500 ms): the ones a sim restored from the oldest base still needs. */
  aims: Aim[];
  /** Events not yet taken into the oldest base. */
  events: GhostEvent[];
  /** The server's ghosts at the last few beats, oldest first (see shared.ts). */
  bases: GhostBase[];
  spots: PowerSpot[];
  /** The bonus fruit on the board (FRUIT index), from `atMs` until `untilMs` (round ms). */
  fruit: { fruit: number; atMs: number; untilMs: number } | null;
  /** Fruit handed out so far this round. */
  fruitN: number;
  /** How long each phone's fruit list was in its last tick (a longer one is a new claim). */
  fruitSeen: Record<string, number>;
  /** Power spot pickups so far (picks the kind a spot comes back as). */
  pickups: number;
  /** The maze everyone is on (0 when left out), and the round ms its play starts. */
  maze?: number;
  mazeAt?: number;
}

export interface MazeState {
  phase: Phase;
  options: MazeOptions;
  seed: number;
  round: number;
  /** Seat order. */
  ids: string[];
  /** Per maze: an index into MAZE_LAYOUTS, or a generated maze's seed and size (see layoutAt). */
  layouts: MazeRef[];
  /** Server time when the round clock reads 0 (play starts). */
  startAt: number;
  /** The bell (Shared, Race; a backstop in Solo), or when the first Race finish ended it. */
  endAt: number | null;
  /** When the end of the round gives way to the results. */
  showBy: number | null;
  players: Record<string, PlayerRec>;
  shared: SharedRec | null;
  /** Last attack id handed out. */
  attackId: number;
  log: RecapEvent[];
}

const int = (min: number, max: number) => z.number().int().min(min).max(max);
/** A tile coordinate in any maze size, with room for a tunnel mouth past either edge. */
const coord = z
  .number()
  .min(-2)
  .max(Math.max(SIZE_DIMS.Large.w, SIZE_DIMS.Large.h) + 2);
const dirSchema = z.enum(['up', 'down', 'left', 'right']);
const powerSchema = z.enum(POWER_KINDS as [PowerKind, ...PowerKind[]]);

export const tickSchema = z.object({
  type: z.literal('tick'),
  round: z.number().int().min(1),
  seq: z.number().int().min(1),
  /** Round ms. */
  t: int(0, 3_600_000),
  maze: int(0, 4),
  pos: z.tuple([coord, coord, dirSchema.nullable()]),
  turns: z.array(z.tuple([int(0, 3_600_000), coord, coord, dirSchema])).max(TURNS_KEPT),
  eaten: z
    .string()
    .max(600)
    .regex(/^[A-Za-z0-9_-]*$/),
  /** Cumulative this maze: [tMs, ghost]. */
  ghosts: z.array(z.tuple([int(0, 3_600_000), int(0, 15)])).max(64),
  /** Cumulative this round. */
  caught: int(0, 10_000),
  /** Cumulative this maze: round ms of each catch (the last 16 are enough; they merge). */
  caughtAt: z.array(int(0, 3_600_000)).max(16).optional(),
  /** Cumulative this maze, FRUIT indexes in order. */
  fruit: z.array(int(0, FRUIT.length - 1)).max(16),
  /** Cumulative pickups this maze: [tMs, spot, kind]. */
  powers: z.array(z.tuple([int(0, 3_600_000), int(0, 15), powerSchema])).max(32),
  lives: int(0, LIVES),
  /** Round ms when the last maze was cleared. */
  finishMs: int(0, 3_600_000).optional(),
});
export const actionSchema = z.discriminatedUnion('type', [tickSchema]);
export type MazeTick = z.infer<typeof tickSchema>;
export type MazeAction = z.infer<typeof actionSchema>;

/** What everyone may see of a player; the facts and bookkeeping stay on the server. */
export type MazePublicPlayer = Pick<
  PlayerRec,
  | 'maze'
  | 'mazeAt'
  | 'eaten'
  | 'score'
  | 'lives'
  | 'pos'
  | 'lastT'
  | 'turns'
  | 'ghostsEaten'
  | 'caught'
  | 'pellets'
  | 'cleared'
  | 'finishMs'
  | 'power'
  | 'done'
> & { id: string };

/** Turns the table view carries per player (a phone draws others over about the last second). */
export const TABLE_TURNS = 8;

export interface MazeTableView {
  mode: Mode;
  phase: Phase;
  round: number;
  seed: number;
  options: MazeOptions;
  /** The power-ups in play. */
  powers: PowerKind[];
  layouts: MazeRef[];
  startAt: number;
  endAt: number | null;
  showBy: number | null;
  /** Seat order. */
  players: MazePublicPlayer[];
  shared: SharedRec | null;
  log: RecapEvent[];
}

export interface MazePlayerView {
  me: string;
  inbox: Attack[];
  /** The player's own record, for their phone and bot (the table view leaves these out). */
  seq: number;
  lastT: number;
  eaten: string;
  caught: number;
  lives: number;
  facts: MazeFacts;
  /** The player's last ≤40 turns (the table view keeps only the last few). */
  turns: Turn[];
}

// ---------------------------------------------------------------------------------------------
// Layout helpers

export function layoutOf(s: MazeState, maze: number): MazeLayout {
  return layoutAt(s, maze);
}

/** Later mazes are harder. */
export const levelOf = (maze: number): number => maze + 1;

const powerIdx = new WeakMap<MazeLayout, Set<number>>();

/** Pellet indexes that are power spots. */
export function powerIndexes(m: MazeLayout): Set<number> {
  const cached = powerIdx.get(m);
  if (cached) return cached;
  const out = new Set<number>();
  for (const [k, i] of pelletIndex(m)) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (m.rows[y]![x] === 'o') out.add(i);
  }
  powerIdx.set(m, out);
  return out;
}

/** What power spot `spot` holds on a maze at a level (as ChomperSim reads it). */
export function spotKind(
  m: MazeLayout,
  powers: PowerKind[],
  spot: number,
  level: number,
): PowerKind | null {
  const n = powers.length;
  if (!n || spot < 0 || spot >= m.powers.length) return null;
  return powers[(spot + (level - 1) * m.powers.length) % n]!;
}

function popcount(bits: Uint8Array): number {
  let c = 0;
  for (const b of bits) c += b;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Score

/**
 * Ghost points: combos count from the latest Hunt pickup or catch before each ghost, up to 1600
 * (the phone's chomper starts its combo over at both too).
 */
export function ghostPoints(facts: MazeFacts): number {
  const hunts = [
    ...facts.powers.filter((p) => p[2] === 'hunt').map((p) => p[0]),
    ...(facts.caughtAt ?? []),
  ].sort((a, b) => a - b);
  const ghosts = [...facts.ghosts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let pts = 0;
  let hi = -1;
  let combo = 0;
  for (const [t] of ghosts) {
    let h = -1;
    for (const ht of hunts) if (ht <= t) h = ht;
    if (h !== hi) {
      hi = h;
      combo = 0;
    }
    pts += POINTS.ghost[Math.min(combo++, 3)]!;
  }
  return pts;
}

/** Points from power-ups, ghosts and fruit. */
export function factPoints(facts: MazeFacts): number {
  return (
    facts.powers.length * POINTS.power +
    ghostPoints(facts) +
    facts.fruit.reduce((a, f) => a + (FRUIT[f]?.pts ?? 0), 0)
  );
}

/** Points from the current maze's facts. */
export function mazePoints(m: MazeLayout, eaten: string, facts: MazeFacts): number {
  const n = pelletIndex(m).size;
  const bits = decodeBits(eaten, n);
  const spots = powerIndexes(m);
  let pellets = 0;
  for (let i = 0; i < n; i++) if (bits[i] && !spots.has(i)) pellets++;
  return pellets * POINTS.pellet + factPoints(facts);
}

/**
 * A player's score from their facts. Never below 0. In the Shared maze only owned pellets score
 * (`pellets`, settled in shared.ts), not every pellet the phone claimed. In Solo a catch costs a
 * life, not points; elsewhere what catches took (`lost`, see chargeCatches).
 */
export function scoreOf(s: MazeState, p: PlayerRec): number {
  const here =
    s.options.mode === 'Shared'
      ? p.pellets * POINTS.pellet + factPoints(p.facts)
      : mazePoints(layoutOf(s, p.maze), p.eaten, p.facts);
  return Math.max(0, p.banked + here - (p.lost ?? 0) + p.adjust);
}

/**
 * What `catches` new catches cost a player who has `score` points before them: 200 each in the
 * Shared maze and Race, but never more than the player has (nothing in Solo).
 */
export function catchCost(mode: Mode, score: number, catches: number): number {
  if (mode === 'Solo' || catches <= 0) return 0;
  return Math.min(-POINTS.caught * catches, Math.max(0, score));
}

/** `next` with the catches it reported since `prev` charged to `lost`. */
export function chargeCatches(s: MazeState, prev: PlayerRec, next: PlayerRec): PlayerRec {
  const cost = catchCost(s.options.mode, scoreOf(s, next), next.caught - prev.caught);
  return cost ? { ...next, lost: (next.lost ?? 0) + cost } : next;
}

const rescore = (s: MazeState, id: string): MazeState => {
  const p = s.players[id]!;
  return { ...s, players: { ...s.players, [id]: { ...p, score: scoreOf(s, p) } } };
};

// ---------------------------------------------------------------------------------------------
// Attacks

/** The leader among everyone else still playing (second place, if `from` leads). */
export function leaderOther(s: MazeState, from: string): string | null {
  const open = s.ids.filter((id) => id !== from && !s.players[id]!.done);
  let best: string | null = null;
  for (const id of open) if (!best || s.players[id]!.score > s.players[best]!.score) best = id;
  return best;
}

/** Drops attacks older than INBOX_MS on the round clock. */
function pruneInbox(inbox: Attack[], nowMs: number): Attack[] {
  return inbox.filter((a) => nowMs - a.atMs < INBOX_MS);
}

/** Puts an attack in a player's inbox, unless it already holds INBOX_MAX. */
export function sendAttack(
  s: MazeState,
  to: string,
  kind: Attack['kind'],
  from: string,
  now: number,
  amount?: number,
): MazeState {
  const p = s.players[to];
  if (!p) return s;
  const atMs = now - s.startAt;
  const inbox = pruneInbox(p.inbox, atMs);
  if (inbox.length >= INBOX_MAX) return s;
  const id = s.attackId + 1;
  const a: Attack = { id, kind, from, atMs, ...(amount !== undefined ? { amount } : {}) };
  return {
    ...s,
    attackId: id,
    players: { ...s.players, [to]: { ...p, inbox: [...inbox, a] } },
  };
}

/** Steal: up to 200 (15%, to the nearest 10) moved from `victim` to `thief`. */
export function steal(s: MazeState, thief: string, victim: string, now: number): MazeState {
  if (thief === victim) return s;
  const v = s.players[victim];
  const t = s.players[thief];
  if (!v || !t) return s;
  const amount = Math.min(200, Math.round((0.15 * v.score) / 10) * 10, v.score);
  if (amount <= 0) return s;
  let out: MazeState = {
    ...s,
    players: {
      ...s.players,
      [victim]: { ...v, adjust: v.adjust - amount },
      [thief]: { ...t, adjust: t.adjust + amount },
    },
  };
  out = rescore(rescore(out, victim), thief);
  out = sendAttack(out, victim, 'steal', thief, now, amount);
  return {
    ...out,
    log: [
      ...out.log,
      { round: out.round, actor: thief, text: `{${thief}} stole ${amount} from {${victim}}.` },
    ],
  };
}

/** An attack power-up picked up by `from`. */
export function attackOnPickup(s: MazeState, from: string, kind: PowerKind, now: number) {
  if (kind === 'jinx' || kind === 'steal') {
    const to = leaderOther(s, from);
    if (!to) return s;
    return kind === 'jinx' ? sendAttack(s, to, 'jinx', from, now) : steal(s, from, to, now);
  }
  if (kind === 'freeze' || kind === 'fog') {
    let out = s;
    for (const id of s.ids)
      if (id !== from && !s.players[id]!.done) out = sendAttack(out, id, kind, from, now);
    return out;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Setup and rounds

function freshPlayer(): PlayerRec {
  return {
    seq: 0,
    maze: 0,
    mazeAt: 0,
    eaten: '',
    score: 0,
    lives: LIVES,
    pos: [0, 0, null],
    lastT: 0,
    turns: [],
    ghostsEaten: 0,
    caught: 0,
    fruit: 0,
    pellets: 0,
    cleared: 0,
    finishMs: null,
    power: null,
    inbox: [],
    done: false,
    facts: { ghosts: [], fruit: [], powers: [], caughtAt: [] },
    banked: 0,
    adjust: 0,
    lost: 0,
  };
}

/**
 * The mazes of a run: handmade ones in a shuffled order, generated ones (a fresh seed each), or
 * Mix, which alternates the two and starts with either.
 */
function pickLayouts(o: MazeOptions, playerCount: number, rng: Rng): MazeRef[] {
  const size = resolveSize(o, playerCount);
  const order = rng.shuffle(layoutsOf(size).map((m) => MAZE_LAYOUTS.indexOf(m)));
  const count = o.mazes;
  const set = o.mazeSet ?? 'Mix';
  const genFirst = set === 'Mix' && rng.int(2) === 1;
  let made = 0;
  return Array.from({ length: count }, (_, i): MazeRef => {
    const gen = set === 'Random' || (set === 'Mix' && i % 2 === (genFirst ? 0 : 1));
    return gen ? { gen: rng.int(100_000), size } : order[made++ % order.length]!;
  });
}

export function placeAt(s: MazeState, id: string, maze: number): [number, number, Dir | null] {
  const m = layoutOf(s, maze);
  // Shared: a corner each. Solo and Race: everyone has their own copy, so the first start.
  const seat = s.options.mode === 'Shared' ? s.ids.indexOf(id) % m.starts.length : 0;
  const st = m.starts[seat] ?? m.starts[0]!;
  return [st[0], st[1], st[2]];
}

const fmtTime = (ms: number): string => {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Players best first: score, then the earlier finish, then seat. */
export function orderOf(s: MazeState): string[] {
  return [...s.ids].sort((a, b) => {
    const pa = s.players[a]!;
    const pb = s.players[b]!;
    return (
      pb.score - pa.score ||
      (pa.finishMs ?? Infinity) - (pb.finishMs ?? Infinity) ||
      s.ids.indexOf(a) - s.ids.indexOf(b)
    );
  });
}

/** Ends the round: the Race finish bonus, the winner line, then the results after SHOW_MS. */
export function endRound(s: MazeState, now: number): MazeState {
  if (s.phase !== 'play' && s.phase !== 'countdown') return s;
  let out = s;
  if (s.options.mode === 'Race') {
    const first = s.ids
      .filter((id) => s.players[id]!.finishMs !== null)
      .sort((a, b) => s.players[a]!.finishMs! - s.players[b]!.finishMs!)[0];
    if (first) {
      const p = out.players[first]!;
      out = rescore(
        {
          ...out,
          players: { ...out.players, [first]: { ...p, adjust: p.adjust + POINTS.raceFinish } },
        },
        first,
      );
      out = {
        ...out,
        log: [
          ...out.log,
          {
            round: out.round,
            actor: first,
            text: `{${first}} finished first, in ${fmtTime(p.finishMs!)}.`,
            tag: `+${POINTS.raceFinish}`,
            tone: 'good',
            key: true,
          },
        ],
      };
    }
  }
  const players = { ...out.players };
  for (const id of out.ids) players[id] = { ...players[id]!, done: true, power: null };
  out = { ...out, players };
  const winners = topScorers(out);
  const best = winners[0] ? out.players[winners[0]]!.score : 0;
  const text =
    winners.length === 1
      ? out.ids.length === 1
        ? `{${winners[0]}} scored ${best}.`
        : `{${winners[0]}} wins with ${best}.`
      : `${winners.map((id) => `{${id}}`).join(' and ')} tie on ${best}.`;
  return {
    ...out,
    phase: 'between',
    showBy: now + SHOW_MS,
    log: [
      ...out.log,
      {
        round: out.round,
        ...(winners.length === 1 ? { actor: winners[0] } : {}),
        text,
        tag: 'Winner',
        tone: 'good',
        key: true,
      },
    ],
  };
}

function topScorers(s: MazeState): string[] {
  if (!s.ids.length) return [];
  const best = Math.max(...s.ids.map((id) => s.players[id]!.score));
  return s.ids.filter((id) => s.players[id]!.score === best);
}

// ---------------------------------------------------------------------------------------------
// Ticks

function mergeTurns(prev: Turn[], add: Turn[]): Turn[] {
  const last = prev[prev.length - 1]?.[0] ?? -1;
  return [...prev, ...add.filter((t) => t[0] > last)].slice(-TURNS_KEPT);
}

/**
 * Checks shared by every mode and the bookkeeping every tick gets (seq, position, turns).
 * Returns null when the tick must be ignored.
 */
function admit(s: MazeState, id: string, a: MazeTick, now: number): MazeState | null {
  if (s.phase !== 'play' || a.round !== s.round) return null;
  const p = s.players[id];
  if (!p || p.done) return null;
  if (a.seq <= p.seq || a.maze !== p.maze) return null;
  if (a.t > now - s.startAt + FUTURE_MS) return null;

  // Plausibility: pellets can't come in faster than the fastest chomper reaches them.
  const m = layoutOf(s, p.maze);
  const n = pelletIndex(m).size;
  const before = popcount(decodeBits(p.eaten, n));
  const claimed = decodeBits(a.eaten, n);
  const had = decodeBits(p.eaten, n);
  for (let i = 0; i < n; i++) claimed[i] = claimed[i]! | had[i]!;
  const dt = Math.max(0, a.t - Math.max(p.lastT, p.mazeAt));
  const reach = EAT_SLACK + Math.ceil((2 * speeds(levelOf(p.maze)).dash * dt) / 1000);
  if (popcount(claimed) - before > reach) return null;

  const next: PlayerRec = {
    ...p,
    seq: a.seq,
    pos: [a.pos[0], a.pos[1], a.pos[2]],
    lastT: Math.max(p.lastT, a.t),
    turns: mergeTurns(p.turns, a.turns as Turn[]),
    inbox: pruneInbox(p.inbox, now - s.startAt),
  };
  return { ...s, players: { ...s.players, [id]: next } };
}

/** Facts merged so they only grow; kinds read from the spot, not the phone. */
function mergeFacts(s: MazeState, p: PlayerRec, a: MazeTick): MazeFacts {
  const m = layoutOf(s, p.maze);
  const powers = enabledPowers(s.options);
  const level = levelOf(p.maze);
  const ghostKeys = new Set(p.facts.ghosts.map(([t, g]) => `${t}:${g}`));
  const ghosts = [...p.facts.ghosts];
  for (const [t, g] of a.ghosts) {
    const k = `${t}:${g}`;
    if (!ghostKeys.has(k) && ghosts.length < 64) {
      ghostKeys.add(k);
      ghosts.push([t, g]);
    }
  }
  const spots = new Set(p.facts.powers.map((x) => x[1]));
  const got = [...p.facts.powers];
  for (const [t, spot] of a.powers) {
    const kind = spotKind(m, powers, spot, level);
    if (!kind || spots.has(spot)) continue;
    spots.add(spot);
    got.push([t, spot, kind]);
  }
  const fruit = a.fruit.length > p.facts.fruit.length ? [...a.fruit] : p.facts.fruit;
  return { ghosts, fruit, powers: got, caughtAt: mergeCaught(p.facts, a) };
}

/** Catch times merged so they only grow (at most 64 kept). */
export function mergeCaught(facts: MazeFacts, a: MazeTick): number[] {
  const had = facts.caughtAt ?? [];
  const add = (a.caughtAt ?? []).filter((t) => !had.includes(t));
  return add.length ? [...had, ...add].sort((x, y) => x - y).slice(-64) : had;
}

/** The power running at round ms `t`, from the latest non-attack pickup. */
export function powerAt(facts: MazeFacts, level: number, t: number): PlayerRec['power'] {
  let last: [number, number, PowerKind] | null = null;
  for (const x of facts.powers)
    if (!ATTACK_POWERS.includes(x[2]) && (!last || x[0] >= last[0])) last = x;
  if (!last) return null;
  const untilMs = last[0] + powerMs(last[2], level);
  return untilMs > t ? { kind: last[2], untilMs } : null;
}

/** Solo and Race: the phone's own pellets are trusted; score, mazes and attacks follow. */
function settleOwn(
  s: MazeState,
  id: string,
  a: MazeTick,
  now: number,
  /** Round ms of this player's previous tick: the maze wasn't cleared yet then. */
  since: number,
): MazeState {
  const prev = s.players[id]!;
  const m = layoutOf(s, prev.maze);
  const n = pelletIndex(m).size;
  const bits = decodeBits(prev.eaten, n);
  const add = decodeBits(a.eaten, n);
  for (let i = 0; i < n; i++) bits[i] = bits[i]! | add[i]!;
  const spots = powerIndexes(m);
  const pelletsBefore = [...decodeBits(prev.eaten, n)].filter((b, i) => b && !spots.has(i)).length;
  const pelletsNow = [...bits].filter((b, i) => b && !spots.has(i)).length;
  const facts = mergeFacts(s, prev, a);
  const solo = s.options.mode === 'Solo';
  const caught = Math.max(prev.caught, a.caught);
  let p: PlayerRec = {
    ...prev,
    eaten: encodeBits(bits),
    facts,
    caught,
    lives: solo ? Math.min(prev.lives, a.lives) : prev.lives,
    ghostsEaten: prev.ghostsEaten + facts.ghosts.length - prev.facts.ghosts.length,
    fruit: prev.fruit + facts.fruit.length - prev.facts.fruit.length,
    pellets: prev.pellets + pelletsNow - pelletsBefore,
    power: powerAt(facts, levelOf(prev.maze), a.t),
  };
  p = chargeCatches(s, prev, p);
  let out: MazeState = rescore({ ...s, players: { ...s.players, [id]: p } }, id);

  if (!solo) {
    // Race: each new ghost sends a jinx; each attack pickup does its thing.
    for (let i = prev.facts.ghosts.length; i < facts.ghosts.length; i++) {
      const to = leaderOther(out, id);
      if (to) out = sendAttack(out, to, 'jinx', id, now);
    }
    for (let i = prev.facts.powers.length; i < facts.powers.length; i++) {
      const kind = facts.powers[i]![2];
      if (ATTACK_POWERS.includes(kind)) out = attackOnPickup(out, id, kind, now);
    }
  }

  if (solo && out.players[id]!.lives === 0) return endRound(out, now);

  if (popcount(bits) < n) return out;

  // Maze cleared.
  p = out.players[id]!;
  const last = p.maze >= out.layouts.length - 1;
  const banked = p.banked + mazePoints(m, p.eaten, p.facts) + POINTS.mazeClear;
  const mazeNo = p.maze + 1;
  out = {
    ...out,
    log: [
      ...out.log,
      {
        round: out.round,
        actor: id,
        text: `{${id}} cleared maze ${mazeNo}.`,
        tag: `+${POINTS.mazeClear}`,
        tone: 'good',
        ...(last ? { key: true } : {}),
      },
    ],
  };
  if (!solo)
    for (const other of out.ids)
      if (other !== id && !out.players[other]!.done) out = sendAttack(out, other, 'fog', id, now);
  p = out.players[id]!;
  if (last) {
    p = {
      ...p,
      banked,
      eaten: '',
      facts: { ghosts: [], fruit: [], powers: [], caughtAt: [] },
      cleared: p.cleared + 1,
      power: null,
      done: true,
      // A finish can't be before this maze started, before the previous tick (which hadn't
      // finished) or after the tick reporting it.
      finishMs: Math.min(Math.max(a.finishMs ?? a.t, p.mazeAt, since), a.t),
    };
    out = rescore({ ...out, players: { ...out.players, [id]: p } }, id);
    if (solo) return endRound(out, now);
    // The first finish ends the race; the grace lets a close finish with an earlier time in.
    out = { ...out, endAt: Math.min(out.endAt ?? now, now) };
    return out.ids.every((x) => out.players[x]!.done) ? endRound(out, now) : out;
  }
  p = {
    ...p,
    banked,
    maze: p.maze + 1,
    mazeAt: a.t + COUNTDOWN_MS,
    eaten: '',
    facts: { ghosts: [], fruit: [], powers: [], caughtAt: [] },
    cleared: p.cleared + 1,
    power: null,
    turns: [],
    pos: placeAt(out, id, p.maze + 1),
  };
  return rescore({ ...out, players: { ...out.players, [id]: p } }, id);
}

/** One tick, without the safety net applyAction adds (exported for tests). */
export function tick(s: MazeState, id: string, a: MazeTick, now: number): MazeState {
  const admitted = admit(s, id, a, now);
  if (!admitted) return s;
  return s.options.mode === 'Shared'
    ? settleShared(admitted, id, a, now)
    : settleOwn(admitted, id, a, now, s.players[id]!.lastT);
}

// ---------------------------------------------------------------------------------------------
// Views and results

function table(s: MazeState): MazeTableView {
  return {
    mode: s.options.mode,
    phase: s.phase,
    round: s.round,
    seed: s.seed,
    options: s.options,
    powers: enabledPowers(s.options),
    layouts: s.layouts,
    startAt: s.startAt,
    endAt: s.endAt,
    showBy: s.showBy,
    players: s.ids.map((id) => {
      const p = s.players[id]!;
      return {
        id,
        maze: p.maze,
        mazeAt: p.mazeAt,
        // Only Race's TV draws other players' mazes from their pellets.
        eaten: s.options.mode === 'Race' ? p.eaten : '',
        score: p.score,
        lives: p.lives,
        pos: p.pos,
        lastT: p.lastT,
        turns: p.turns.slice(-TABLE_TURNS),
        ghostsEaten: p.ghostsEaten,
        caught: p.caught,
        pellets: p.pellets,
        cleared: p.cleared,
        finishMs: p.finishMs,
        power: p.power,
        done: p.done,
      };
    }),
    shared: s.shared,
    log: s.log,
  };
}

function resultOf(s: MazeState, winners: string[], summary: string): GameResult {
  const order = orderOf(s);
  const solo = s.options.mode === 'Solo';
  const stats: RecapStats = {
    columns: solo
      ? ['Score', 'Mazes', 'Pellets', 'Ghosts', 'Lives left']
      : ['Score', 'Mazes', 'Pellets', 'Ghosts', 'Caught'],
    rows: order.map((id) => {
      const p = s.players[id]!;
      return {
        playerId: id,
        values: [p.score, p.cleared, p.pellets, p.ghostsEaten, solo ? p.lives : p.caught],
      };
    }),
  };
  const standings: Standing[] = s.ids.map((id) => ({
    playerId: id,
    outcome: winners.includes(id) ? 'win' : 'loss',
  }));
  return {
    winners,
    summary,
    reveal: {
      order,
      mode: s.options.mode,
      scores: Object.fromEntries(order.map((id) => [id, s.players[id]!.score])),
    },
    recap: s.log,
    roundName: 'Round',
    standings,
    stats,
  };
}

export const maze: GameModule<MazeState, MazeAction, MazePlayerView, MazeTableView, MazeOptions> = {
  meta,
  optionsSchema,
  actionSchema,
  defaultOptions,
  validateOptions,

  setup({ playerIds, options, rng, now }) {
    const base: MazeState = {
      phase: 'countdown',
      options,
      seed: rng.int(2 ** 31),
      round: 1,
      ids: [...playerIds],
      layouts: pickLayouts(options, playerIds.length, rng),
      startAt: now + COUNTDOWN_MS,
      endAt:
        now + COUNTDOWN_MS + (options.mode === 'Solo' ? SOLO_BELL_MS : options.minutes * 60_000),
      showBy: null,
      players: {},
      shared: null,
      attackId: 0,
      log: [],
    };
    const players: Record<string, PlayerRec> = {};
    for (const id of playerIds) players[id] = { ...freshPlayer(), pos: placeAt(base, id, 0) };
    const out = { ...base, players };
    if (options.mode !== 'Shared') return out;
    return { ...out, shared: initShared(out) };
  },

  getPlayerView(s, playerId) {
    const p = s.players[playerId];
    const own = p ?? freshPlayer();
    return {
      me: playerId,
      inbox: own.inbox,
      seq: own.seq,
      lastT: own.lastT,
      eaten: own.eaten,
      caught: own.caught,
      lives: own.lives,
      facts: own.facts,
      turns: own.turns,
    };
  },

  getTableView: table,

  applyAction(s, playerId, action, _rng, now) {
    try {
      return tick(s, playerId, action, now);
    } catch {
      // A tick never refuses; anything unexpected leaves the game as it was.
      return s;
    }
  },

  getResult(s) {
    if (s.phase !== 'over') return null;
    const winners = topScorers(s);
    return resultOf(s, winners, s.log[s.log.length - 1]?.text ?? 'Round over.');
  },

  partialResult(s) {
    if (s.ids.every((id) => s.players[id]!.score === 0)) return null;
    const winners = topScorers(s);
    const best = s.players[winners[0]!]!.score;
    return resultOf(
      s,
      winners,
      winners.length === 1 ? `{${winners[0]}} led with ${best}.` : `Level at ${best}.`,
    );
  },

  waitingOn() {
    return [];
  },

  announce(prev, next) {
    const lines: Announcement[] = [];
    if (!prev) {
      const o = next.options;
      lines.push(
        o.mode === 'Solo'
          ? `Solo: ${o.mazes} ${o.mazes === 1 ? 'maze' : 'mazes'}, three lives.`
          : o.mode === 'Race'
            ? `Race: ${o.mazes} ${o.mazes === 1 ? 'maze' : 'mazes'}, first to finish gets a bonus.`
            : o.mazes > 1
              ? `Shared maze: ${o.mazes} mazes, ${o.minutes} minutes. Chomp fast.`
              : `Shared maze: ${o.minutes} minutes. Chomp fast.`,
      );
      return lines;
    }
    for (const e of next.log.slice(prev.log.length)) if (e.key) lines.push(e.text);
    return lines;
  },

  nextTimer(s) {
    if (s.phase === 'countdown') return { id: 'countdown', at: s.startAt };
    if (s.phase === 'play' && s.endAt !== null) return { id: 'bell', at: s.endAt + BELL_GRACE_MS };
    if (s.phase === 'between' && s.showBy !== null) return { id: 'show', at: s.showBy };
    return null;
  },

  onTimer(s, id, _rng, now) {
    if (id === 'countdown' && s.phase === 'countdown') return { ...s, phase: 'play' };
    if (id === 'bell' && s.phase === 'play') return endRound(s, now);
    if (id === 'show' && s.phase === 'between') return { ...s, phase: 'over', showBy: null };
    return s;
  },

  bot: (ctx) => mazeBot(ctx),
  botDelayMs: (s) => (s.phase === 'play' ? 900 : 2_000),
  realTime: true,
};
