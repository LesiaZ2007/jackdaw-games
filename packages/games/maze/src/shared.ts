import { createRng } from '@jackdaw/engine';
import { enabledPowers } from './options';
import {
  COUNTDOWN_MS,
  attackOnPickup,
  chargeCatches,
  endRound,
  factPoints,
  layoutOf,
  levelOf,
  placeAt,
  powerAt,
  scoreOf,
  sendAttack,
  leaderOther,
  mergeCaught,
  spotKind,
} from './rules';
import type {
  GhostBase,
  MazeFacts,
  MazeState,
  MazeTick,
  PlayerRec,
  PowerSpot,
  SharedRec,
} from './rules';
import { FRUIT_EVERY, FRUIT_MS } from './sim/chomper';
import type { Turn } from './sim/chomper';
import { GhostSim, aimTile, ghostSeed, stepAt } from './sim/ghosts';
import type { Aim, AimTile, GhostCheckpoint, GhostEvent, GhostInput } from './sim/ghosts';
import type { MazeLayout } from './sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from './sim/pellets';
import { ATTACK_POWERS, FRUIT, POWER_MS, speeds } from './sim/powers';
import { predictAlong, straightOn } from './sim/predict';
import type { Dir } from './sim/walker';

/**
 * The Shared maze: one maze for everyone. Each phone reports what it ate; the server settles it.
 *
 * - Pellets: the first report to reach the server owns a pellet. A later claim scores nothing
 *   (the phone sees the owner in the table view and takes its points back), so the pellet points
 *   across all players are always 10 × the owned pellets.
 * - Power spots: claimed the same way. In Mixed a spot comes back SPOT_BACK_MS later holding a
 *   random enabled power-up (picked from the seed, so the rules stay pure); in Classic it's gone.
 * - Attacks on pickup: Jinx adds a ghost event (an extra ghost after the leader, or second place
 *   if you lead) plus an inbox notice; Freeze and Fog go to everyone else's inbox; Steal moves
 *   points from the leader (or second place).
 * - A ghost eaten by a Hunt chomper becomes an `eaten` ghost event, so every phone sees it.
 * - Fruit is the server's: after every FRUIT_EVERY owned pellets one appears at the layout's
 *   fruit tile for FRUIT_MS; the first claim wins.
 * - Aims: on any tick, once AIM_MS have passed since the last beat, the server records where
 *   every player probably is now (their last report carried on along their heading for the time
 *   since, at most SHARED_PREDICT_MS) and which way they're heading. Beats ride on reports that
 *   arrive anyway, so they cost no extra requests. Silent players stay put after
 *   SHARED_PREDICT_MS and never hold anyone up.
 * - Ghost bases: on the first beat BASE_MS or more after the last base, the server steps its own
 *   GhostSim to the beat and keeps the result (`bases`, the last BASES_KEPT). Phones, the TV and bots restore the newest base and step on
 *   with the few aims and events kept after it, so no one needs the round's whole history. A
 *   ghost event dated before the newest base re-steps the later bases from an older one; one
 *   dated before the oldest base can't be replayed everywhere and doesn't count.
 * - Several mazes: once every pellet (power spots aside) is owned, everyone moves on to the next
 *   maze together after a countdown. The maze starts over (owners, spots, aims, bases, events,
 *   fruit), with its own ghost seed and the next level; scores carry on.
 * - The round ends at the bell or when every pellet of the last maze is owned.
 */

/** The Shared beat: how often the server notes where everyone is for the ghosts. */
export const AIM_MS = 500;
/** How long a Shared aim carries a player on from their last report, at most. */
export const SHARED_PREDICT_MS = 1_200;
/** Solo and Race: how often a phone (or bot) notes where its chomper is for its own ghosts. */
export const LOCAL_AIM_MS = 150;
/** How often the server keeps a Shared ghost base (on the first beat this long after the last). */
export const BASE_MS = 2_000;
/** Ghost bases kept: the newest, plus older ones a late event can re-step from. */
export const BASES_KEPT = 3;
export const SPOT_BACK_MS = 12_000;
/** A pickup reported this much before a spot is back still counts (clocks differ a little). */
export const SPOT_SLACK_MS = 1_000;
/** Two players eating the same ghost this close together: only the first counts. */
export const GHOST_SAME_MS = 1_000;

// ---------------------------------------------------------------------------------------------
// Owners: one base64 digit per pellet, 0 = free, k = seat index + 1.

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeOwners(owners: Uint8Array): string {
  let out = '';
  for (const k of owners) out += DIGITS[k] ?? 'A';
  return out;
}

export function decodeOwners(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.max(0, DIGITS.indexOf(s[i] ?? 'A'));
  return out;
}

/** Pellets anyone owns, as a 0/1 array (what ChomperSim.take wants). */
export function takenBits(shared: Pick<SharedRec, 'owner'>, n: number): Uint8Array {
  return decodeOwners(shared.owner, n).map((k) => (k ? 1 : 0));
}

/** Who owns pellet `i`, by seat order, or null. */
export function ownerOf(shared: Pick<SharedRec, 'owner'>, ids: string[], i: number): string | null {
  const k = Math.max(0, DIGITS.indexOf(shared.owner[i] ?? 'A'));
  return k ? (ids[k - 1] ?? null) : null;
}

/** The pellet index of each power spot (spot k = layout.powers[k]). */
export function spotPellets(m: MazeLayout): number[] {
  const idx = pelletIndex(m);
  return m.powers.map(([x, y]) => idx.get(`${x},${y}`) ?? -1);
}

/**
 * The earliest round ms a ghost event may be dated and still count: the oldest kept base (an
 * event before it is already past for every base the server could re-step from).
 */
export function eventsFrom(shared: Pick<SharedRec, 'bases'>): number {
  return shared.bases[0]?.atMs ?? 0;
}

/** Whether an event at `atMs` lands at or after a base (the base hasn't taken it in). */
const after = (atMs: number, b: GhostBase) => stepAt(atMs) >= b.c.step;

/** The maze everyone is on in the Shared maze, and the round ms its play starts. */
export const sharedMaze = (sh: Pick<SharedRec, 'maze' | 'mazeAt'> | null | undefined) => ({
  maze: sh?.maze ?? 0,
  mazeAt: sh?.mazeAt ?? 0,
});

/**
 * The Shared ghosts of maze `maze` as they stand when its play starts (round ms `atMs`): the
 * maze's own seed and level, with the step count on the round clock, so the ghosts wait in the
 * house through the countdown and every device steps them on from the same place.
 */
export function sharedGhosts(m: MazeLayout, seed: number, maze: number, atMs: number): GhostSim {
  const sim = new GhostSim(m, ghostSeed(seed, maze), levelOf(maze));
  if (atMs > 0) sim.restore({ ...sim.checkpoint(), step: stepAt(atMs) });
  return sim;
}

/** A GhostSim for the current Shared maze of a game (a base is restored into it). */
const sharedSim = (s: MazeState) => {
  const { maze, mazeAt } = sharedMaze(s.shared);
  return sharedGhosts(layoutOf(s, maze), s.seed, maze, mazeAt);
};

/**
 * The bases after a tick: the ones a new event lands before are stepped again from the last base
 * it doesn't touch, and a beat adds one. Only the last BASES_KEPT are kept.
 */
function rebase(
  s: MazeState,
  bases0: GhostBase[],
  input: GhostInput,
  added: GhostEvent[],
  beatAt: number | null,
): GhostBase[] {
  let keep = bases0.length;
  while (keep > 1 && added.some((e) => !after(e.atMs, bases0[keep - 1]!))) keep--;
  const redo = bases0.slice(keep).map((b) => b.atMs);
  if (beatAt !== null) redo.push(beatAt);
  if (!redo.length) return bases0;
  const sim = sharedSim(s);
  sim.restore(bases0[keep - 1]!.c);
  let rev = Math.max(...bases0.map((b) => b.rev));
  const out = bases0.slice(0, keep);
  for (const atMs of redo) {
    sim.stepTo(atMs, input);
    out.push({ atMs, rev: ++rev, c: sim.checkpoint() });
  }
  return out.slice(-BASES_KEPT);
}

/**
 * Aims a sim restored at step `step` (a checkpoint's) still needs: the one in effect there
 * (every aim carries its own headings), and everything later. Aims are oldest first.
 */
export function aimsFrom(aims: Aim[], step: number): Aim[] {
  let last = 0;
  for (let i = 0; i < aims.length; i++) if (stepAt(aims[i]!.atMs) <= step) last = i;
  return last ? aims.slice(last) : aims;
}

/** A fruit claim reported this long after the fruit went still counts (reports come in late). */
export const FRUIT_SLACK_MS = 1_500;

/**
 * The Shared fruit a phone (or bot) can claim at round ms `t`: up, not already claimed by it
 * (`claimedAt` is the atMs of the fruit it last claimed), and room left in its fruit list.
 */
export function sharedFruitAt(
  sh: Pick<SharedRec, 'fruit' | 'fruitSeen'> | null | undefined,
  me: string,
  t: number,
  claimedAt: number,
): SharedRec['fruit'] {
  const f = sh?.fruit;
  if (!f || claimedAt === f.atMs || t < f.atMs || t >= f.untilMs) return null;
  return (sh!.fruitSeen[me] ?? 0) < 16 ? f : null;
}

/**
 * The fruit list a claim reports: one longer than the server last saw from this phone (that's
 * what makes it a claim), ending with the fruit claimed.
 */
export function claimList(list: number[], seen: number, fruit: number): number[] {
  const out = [...list];
  while (out.length < seen) out.push(0);
  out.push(fruit);
  return out.slice(0, 16);
}

/** Whether a spot holds a power-up at round ms `t`. */
export const spotUp = (sp: PowerSpot, t: number): boolean => sp.kind !== null && t >= sp.backAt;

/**
 * Every player at round ms `atMs`: where they probably are (their last report carried on along
 * the maze for the time since, at most SHARED_PREDICT_MS), and their heading. Only report data
 * and `atMs` go in, so it's the same wherever it's worked out.
 */
function aimNow(s: MazeState, atMs: number, maze: number): Aim {
  const m = layoutOf(s, maze);
  const from = s.shared?.mazeAt ?? 0;
  const run = speeds(levelOf(maze)).chomper;
  const tiles: Record<string, AimTile> = {};
  for (const id of s.ids) {
    const p = s.players[id]!;
    const ms = Math.min(SHARED_PREDICT_MS, atMs - Math.max(p.lastT, from));
    const at = predictAlong(m, p.pos, ms > 0 ? (run * ms) / 1000 : 0);
    tiles[id] = aimTile(m, [at.x, at.y, at.dir]);
  }
  return { atMs, tiles };
}

/**
 * Solo and Race: the aims of a chomper's own ghosts, one every LOCAL_AIM_MS on the maze clock
 * from 0 up to `toMs`, rebuilt from its reported turns (each turn point carried straight on for
 * the time since). Phones (after a refresh) and bots rebuild them the same way; while playing,
 * both note the chomper's real position every LOCAL_AIM_MS instead. `off` is the round ms the
 * maze's clock starts at.
 */
export function aimsFromTurns(
  m: MazeLayout,
  id: string,
  turns: readonly Turn[],
  start: readonly [number, number, Dir],
  off: number,
  toMs: number,
  level: number,
): Aim[] {
  const run = speeds(level).chomper;
  const out: Aim[] = [];
  let ti = -1;
  for (let b = 0; b <= toMs; b += LOCAL_AIM_MS) {
    const t = b + off;
    while (ti + 1 < turns.length && turns[ti + 1]![0] <= t) ti++;
    const turn = turns[ti];
    const pos = turn
      ? straightOn(m, [turn[1], turn[2], turn[3]], (run * (t - turn[0])) / 1000)
      : ([start[0], start[1], null] as [number, number, Dir | null]);
    out.push({ atMs: b, tiles: { [id]: aimTile(m, pos) } });
  }
  return out;
}

/**
 * Solo and Race: the phone's own aims cut down to what its checkpoints can still need (the aim in
 * effect at the oldest checkpoint, and everything later), so the list never grows.
 */
export function trimAims(aims: Aim[], cps: GhostCheckpoints): void {
  const step = cps.list[0]?.c.step ?? 0;
  let drop = 0;
  while (drop + 1 < aims.length && stepAt(aims[drop + 1]!.atMs) <= step) drop++;
  if (drop) aims.splice(0, drop);
}

/**
 * The Shared record at the start of a maze (round ms `atMs`; the round's first maze starts at 0):
 * nothing owned, every spot up, a first aim and base when play starts. `prev` is the record of
 * the maze before, if any (base revisions and the pickup count carry on from it).
 */
export function initShared(s: MazeState, maze = 0, atMs = 0, prev?: SharedRec | null): SharedRec {
  const m = layoutOf(s, maze);
  const powers = enabledPowers(s.options);
  const level = levelOf(maze);
  const rev = prev ? Math.max(0, ...prev.bases.map((b) => b.rev)) + 1 : 0;
  return {
    owner: encodeOwners(new Uint8Array(pelletIndex(m).size)),
    aims: [aimNow(s, atMs, maze)],
    events: [],
    bases: [{ atMs, rev, c: sharedGhosts(m, s.seed, maze, atMs).checkpoint() }],
    spots: m.powers.map((_, spot) => ({
      spot,
      kind: spotKind(m, powers, spot, level),
      backAt: atMs,
    })),
    fruit: null,
    fruitN: 0,
    fruitSeen: {},
    pickups: prev?.pickups ?? 0,
    maze,
    mazeAt: atMs,
  };
}

/**
 * Every pellet of the Shared maze is owned: everyone moves on to the next maze together, after a
 * countdown. Points so far are banked (pellets are counted for the round already), each player
 * goes to their corner of the new maze, and the Shared record starts over for it.
 */
function nextSharedMaze(s: MazeState, now: number): MazeState {
  const maze = sharedMaze(s.shared).maze + 1;
  const atMs = now - s.startAt + COUNTDOWN_MS;
  const players = { ...s.players };
  for (const id of s.ids) {
    const p = players[id]!;
    players[id] = {
      ...p,
      banked: p.banked + factPoints(p.facts),
      facts: { ghosts: [], fruit: [], powers: [], caughtAt: [] },
      eaten: '',
      maze,
      mazeAt: atMs,
      pos: placeAt(s, id, maze),
      turns: [],
      power: null,
      cleared: p.cleared + 1,
    };
  }
  let out: MazeState = { ...s, players };
  out = rescoreAll(out);
  out = {
    ...out,
    shared: initShared(out, maze, atMs, s.shared),
    log: [
      ...out.log,
      { round: out.round, text: `Maze ${maze} cleared. On to maze ${maze + 1}.`, tone: 'good' },
    ],
  };
  return out;
}

/** The last Shared maze is all owned: it counts as cleared for everyone, and the round ends. */
function lastSharedMaze(s: MazeState, now: number): MazeState {
  const players = { ...s.players };
  for (const id of s.ids) players[id] = { ...players[id]!, cleared: players[id]!.cleared + 1 };
  return endRound({ ...s, players }, now);
}

/** The kind a spot comes back as: a pick from the enabled power-ups, fixed by seed and count. */
function nextKind(s: MazeState, n: number): PowerSpot['kind'] {
  const powers = enabledPowers(s.options);
  if (s.options.powerUps !== 'Mixed' || !powers.length) return null;
  return createRng((s.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0).pick(powers);
}

/**
 * Settles a Shared-maze tick that already passed the checks every tick gets (round, seq, maze,
 * clock, plausibility) and had its position and turns recorded. Contested pellets, power spots,
 * attacks and ghost aims are settled here.
 */
export function settleShared(
  s: MazeState,
  playerId: string,
  tick: MazeTick,
  now: number,
): MazeState {
  const sh0 = s.shared ?? initShared(s);
  const prev = s.players[playerId]!;
  const seat = s.ids.indexOf(playerId) + 1;
  const m = layoutOf(s, prev.maze);
  const n = pelletIndex(m).size;
  const spotIdx = spotPellets(m);
  const isSpot = new Set(spotIdx.filter((i) => i >= 0));
  const nowMs = now - s.startAt;

  // Pellets: claims only grow; a free one goes to this player.
  const owners = decodeOwners(sh0.owner, n);
  let ownedBefore = 0;
  for (let i = 0; i < n; i++) if (owners[i] === seat && !isSpot.has(i)) ownedBefore++;
  const had = decodeBits(prev.eaten, n);
  const claim = decodeBits(tick.eaten, n);
  let owned = 0;
  let ownedAll = 0;
  for (let i = 0; i < n; i++) {
    had[i] = had[i]! | claim[i]!;
    if (had[i] && !owners[i] && !isSpot.has(i)) owners[i] = seat;
  }

  // Power spots, in pickup order. The kind comes from the spot, not the phone.
  const spots = sh0.spots.map((x) => ({ ...x }));
  const known = new Set(prev.facts.powers.map(([t, sp]) => `${t}:${sp}`));
  const pickups = [...tick.powers]
    .filter(([t, sp]) => !known.has(`${t}:${sp}`))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const facts: MazeFacts = {
    ghosts: [...prev.facts.ghosts],
    fruit: [...prev.facts.fruit],
    powers: [...prev.facts.powers],
    caughtAt: mergeCaught(prev.facts, tick),
  };
  const attacks: MazeFacts['powers'] = [];
  let pickupN = sh0.pickups;
  for (const [t, sp] of pickups) {
    const rec = spots[sp];
    if (!rec || rec.kind === null || t + SPOT_SLACK_MS < rec.backAt || facts.powers.length >= 64)
      continue;
    const got: [number, number, NonNullable<PowerSpot['kind']>] = [t, sp, rec.kind];
    facts.powers.push(got);
    known.add(`${t}:${sp}`);
    if (ATTACK_POWERS.includes(rec.kind)) attacks.push(got);
    const pi = spotIdx[sp] ?? -1;
    if (pi >= 0 && !owners[pi]) owners[pi] = seat;
    rec.kind = nextKind(s, pickupN++);
    rec.backAt = Math.max(t, nowMs) + SPOT_BACK_MS;
  }

  // Ghosts eaten: each new one is an event every phone applies; a ghost two players ate at
  // once counts for the first report only.
  let events = [...sh0.events];
  // Aims: a beat every AIM_MS, on whichever tick comes along (this player's report included).
  let aims = sh0.aims;
  const last = aims[aims.length - 1];
  const beat = !last || nowMs - last.atMs >= AIM_MS ? aimNow(s, nowMs, prev.maze) : null;
  if (beat) aims = [...aims, beat];
  const lastBase = sh0.bases[sh0.bases.length - 1];
  const baseAt = beat && (!lastBase || beat.atMs - lastBase.atMs >= BASE_MS) ? beat.atMs : null;
  // Everything added to the ghosts' inputs this tick (the bases are stepped again for these).
  const added: GhostEvent[] = [];
  // A ghost eaten before the oldest base can't be replayed on every phone, so it doesn't count
  // (the phone's report of it is simply never taken in).
  const oldest = sh0.bases[0]!;
  const seen = new Set(prev.facts.ghosts.map(([t, g]) => `${t}:${g}`));
  for (const [t, g] of [...tick.ghosts].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const k = `${t}:${g}`;
    if (seen.has(k) || facts.ghosts.length >= 64 || !after(t, oldest)) continue;
    seen.add(k);
    const dup = events.some(
      (e) => e.kind === 'eaten' && e.ghost === g && Math.abs(e.atMs - t) < GHOST_SAME_MS,
    );
    if (dup) continue;
    facts.ghosts.push([t, g]);
    const e: GhostEvent = { atMs: t, kind: 'eaten', ghost: g };
    events.push(e);
    added.push(e);
  }

  // Fruit: a claim is a longer fruit list than this phone sent last time.
  let fruit = sh0.fruit;
  const lastSeen = sh0.fruitSeen[playerId] ?? 0;
  const fruitSeen =
    tick.fruit.length > lastSeen
      ? { ...sh0.fruitSeen, [playerId]: tick.fruit.length }
      : sh0.fruitSeen;
  if (
    tick.fruit.length > lastSeen &&
    fruit &&
    tick.t >= fruit.atMs &&
    tick.t < fruit.untilMs + FRUIT_SLACK_MS
  ) {
    facts.fruit.push(fruit.fruit);
    fruit = null;
  }

  // New fruit after every FRUIT_EVERY owned pellets.
  for (let i = 0; i < n; i++) {
    if (isSpot.has(i)) continue;
    if (owners[i]) ownedAll++;
    if (owners[i] === seat) owned++;
  }
  let fruitN = sh0.fruitN;
  if (Math.floor(ownedAll / FRUIT_EVERY) > fruitN) {
    fruitN = Math.floor(ownedAll / FRUIT_EVERY);
    const atMs = Math.max(tick.t, nowMs);
    fruit = { fruit: (fruitN - 1) % FRUIT.length, atMs, untilMs: atMs + FRUIT_MS };
  }

  const gained: PlayerRec = {
    ...prev,
    eaten: encodeBits(had),
    facts,
    caught: Math.max(prev.caught, tick.caught),
    // Round total: what this tick won on this maze, on top of what came before.
    pellets: prev.pellets + owned - ownedBefore,
    ghostsEaten: prev.ghostsEaten + facts.ghosts.length - prev.facts.ghosts.length,
    fruit: prev.fruit + facts.fruit.length - prev.facts.fruit.length,
    power: powerAt(facts, levelOf(prev.maze), tick.t),
  };
  const p = chargeCatches(s, prev, gained);
  let out: MazeState = { ...s, players: { ...s.players, [playerId]: p } };
  out = rescoreAll(out);

  // Attacks, in pickup order, against the scores as they stand now.
  for (const [t, , kind] of attacks) {
    if (kind === 'jinx') {
      const to = leaderOther(out, playerId);
      if (!to) continue;
      // Never before the oldest base, so every phone can replay it.
      const atMs = Math.max(t, oldest.atMs);
      const e: GhostEvent = { atMs, kind: 'jinx', target: to, untilMs: atMs + POWER_MS.jinx };
      events.push(e);
      added.push(e);
      out = sendAttack(out, to, 'jinx', playerId, now);
    } else out = attackOnPickup(out, playerId, kind, now);
  }

  // Ghost bases, then only the aims and events a sim restored from the oldest one still needs.
  const bases = rebase(s, sh0.bases, { aims, events }, added, baseAt);
  const base0 = bases[0]!;
  events = events.filter((e) => after(e.atMs, base0));
  aims = aimsFrom(aims, base0.c.step);

  out = {
    ...out,
    shared: {
      owner: encodeOwners(owners),
      aims,
      events,
      bases,
      spots,
      fruit,
      fruitN,
      fruitSeen,
      pickups: pickupN,
      maze: prev.maze,
      mazeAt: sh0.mazeAt ?? 0,
    },
  };

  if (ownedAll < n - isSpot.size) return out;
  return prev.maze >= s.layouts.length - 1 ? lastSharedMaze(out, now) : nextSharedMaze(out, now);
}

function rescoreAll(s: MazeState): MazeState {
  const players = { ...s.players };
  for (const id of s.ids) players[id] = { ...players[id]!, score: scoreOf(s, players[id]!) };
  return { ...s, players };
}

// ---------------------------------------------------------------------------------------------
// Ghosts on the phone

/** How often syncGhosts saves a checkpoint, in round ms. */
export const CHECKPOINT_MS = 500;
/** Checkpoints older than this (behind the latest step) are dropped. */
export const CHECKPOINT_KEEP_MS = 20_000;

export interface GhostCheckpoints {
  /** Oldest first. */
  list: { tMs: number; c: GhostCheckpoint }[];
  /** Aims and events the sim has already taken in. */
  seen: Set<string>;
  /** The `rev` of the server base last restored (syncSharedGhosts). */
  baseRev?: number;
}

/** Starts the checkpoint list for a fresh sim (one that starts at round ms `tMs`). */
export function ghostCheckpoints(sim: GhostSim, tMs = 0): GhostCheckpoints {
  return { list: [{ tMs, c: sim.checkpoint() }], seen: new Set() };
}

const stepMs = (c: GhostCheckpoint) => (c.step * 50) / 3;
const eventKey = (e: GhostEvent) => `e:${JSON.stringify(e)}`;
const aimKey = (a: Aim) => `a:${JSON.stringify(a)}`;

/**
 * Steps a phone's (or the TV's) GhostSim to round ms `tMs` with the latest aims and events. An
 * aim or event that arrived after the sim had passed its time is taken in by restoring the last
 * checkpoint before it and stepping again, so the result matches a sim that had it all along.
 */
export function syncGhosts(
  sim: GhostSim,
  checkpoints: GhostCheckpoints,
  input: GhostInput,
  tMs: number,
): void {
  const keys = new Map<string, number>();
  for (const e of input.events) keys.set(eventKey(e), e.atMs);
  for (const a of input.aims) keys.set(aimKey(a), a.atMs);
  let earliest = Infinity;
  for (const [k, at] of keys) if (!checkpoints.seen.has(k)) earliest = Math.min(earliest, at);

  const list = checkpoints.list;
  const cur = stepMs(sim.checkpoint());
  if (earliest < cur) {
    // The last checkpoint at or before the late input (its step must not pass the input's step).
    let i = list.length - 1;
    while (i > 0 && list[i]!.c.step > Math.ceil((earliest * 3) / 50)) i--;
    const back = list[i];
    if (back) {
      sim.restore(back.c);
      list.length = i + 1;
    }
  }

  let at = stepMs(sim.checkpoint());
  while (at < tMs) {
    const next = Math.min(tMs, (Math.floor(at / CHECKPOINT_MS) + 1) * CHECKPOINT_MS);
    sim.stepTo(next, input);
    const c = sim.checkpoint();
    const reached = stepMs(c);
    if (reached <= at) break;
    at = reached;
    if (next % CHECKPOINT_MS === 0) list.push({ tMs: next, c });
  }
  while (list.length > 1 && list[1]!.tMs <= at - CHECKPOINT_KEEP_MS) list.shift();
  checkpoints.seen = new Set(keys.keys());
}

/** What the table view holds of the Shared ghosts. */
export type SharedGhosts = Pick<SharedRec, 'bases' | 'aims' | 'events'>;

/**
 * syncGhosts for the Shared maze, from the table view: whenever the server has a new ghost base
 * (and the clock has reached it), the sim restores it and steps on from there, so a phone that
 * joins late, refreshes or guessed wrong ends up with exactly the server's ghosts. `extra` are
 * events this phone knows before the server does (its own ghost eats).
 */
export function syncSharedGhosts(
  sim: GhostSim,
  checkpoints: GhostCheckpoints,
  sh: SharedGhosts,
  tMs: number,
  extra: GhostEvent[] = [],
): void {
  const input: GhostInput = {
    aims: sh.aims,
    events: extra.length ? [...sh.events, ...extra] : sh.events,
  };
  const base = sh.bases[sh.bases.length - 1];
  if (base && base.rev !== checkpoints.baseRev && base.atMs <= tMs) {
    sim.restore(base.c);
    checkpoints.list = [{ tMs: base.atMs, c: base.c }];
    checkpoints.seen = new Set([...input.events.map(eventKey), ...input.aims.map(aimKey)]);
    checkpoints.baseRev = base.rev;
  }
  syncGhosts(sim, checkpoints, input, tMs);
}
