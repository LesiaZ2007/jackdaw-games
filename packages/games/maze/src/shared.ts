import { createRng } from '@jackdaw/engine';
import { enabledPowers } from './options';
import {
  attackOnPickup,
  chargeCatches,
  endRound,
  layoutOf,
  levelOf,
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
import { GhostSim, ghostSeed, stepAt } from './sim/ghosts';
import type { Aim, GhostCheckpoint, GhostEvent, GhostInput } from './sim/ghosts';
import { wrapX } from './sim/layouts';
import type { MazeLayout } from './sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from './sim/pellets';
import { ATTACK_POWERS, FRUIT, POWER_MS } from './sim/powers';
import type { Vec } from './sim/walker';

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
 * - Aims: on any tick, once AIM_MS have passed since the last beat, the server records every
 *   player's last reported tile. Silent players keep their last tile and never hold anyone up.
 * - Ghost bases: at each beat the server steps its own GhostSim to the beat and keeps the result
 *   (`bases`, the last BASES_KEPT). Phones, the TV and bots restore the newest base and step on
 *   with the few aims and events kept after it, so no one needs the round's whole history. A
 *   ghost event dated before the newest base re-steps the later bases from an older one; one
 *   dated before the oldest base can't be replayed everywhere and doesn't count.
 * - The round ends at the bell or when every pellet (power spots aside) is owned.
 */

export const AIM_MS = 2_000;
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

/** A fresh GhostSim for the Shared maze of a game. */
const sharedSim = (s: MazeState) => new GhostSim(layoutOf(s, 0), ghostSeed(s.seed, 0), 1);

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
 * Aims a sim restored from a base at `fromMs` still needs: the one in effect then and the one
 * before it (ghosts read the heading from the two), and everything later.
 */
function aimsFrom(aims: Aim[], fromMs: number): Aim[] {
  let last = -1;
  for (let i = 0; i < aims.length; i++) if (aims[i]!.atMs < fromMs) last = i;
  return aims.slice(Math.max(0, last - 1));
}

/** Whether a spot holds a power-up at round ms `t`. */
export const spotUp = (sp: PowerSpot, t: number): boolean => sp.kind !== null && t >= sp.backAt;

const tileOf = (m: MazeLayout, pos: readonly [number, number, unknown]): Vec => [
  wrapX(m, Math.round(pos[0])),
  Math.round(pos[1]),
];

function aimNow(s: MazeState, atMs: number): Aim {
  const m = layoutOf(s, 0);
  const tiles: Record<string, Vec> = {};
  for (const id of s.ids) tiles[id] = tileOf(m, s.players[id]!.pos);
  return { atMs, tiles };
}

/** The Shared record at the start of a round: nothing owned, every spot up, a first aim at 0. */
export function initShared(s: MazeState): SharedRec {
  const m = layoutOf(s, 0);
  const powers = enabledPowers(s.options);
  return {
    owner: encodeOwners(new Uint8Array(pelletIndex(m).size)),
    aims: [aimNow(s, 0)],
    events: [],
    bases: [{ atMs: 0, rev: 0, c: sharedSim(s).checkpoint() }],
    spots: m.powers.map((_, spot) => ({ spot, kind: spotKind(m, powers, spot, 1), backAt: 0 })),
    fruit: null,
    fruitN: 0,
    fruitSeen: {},
    pickups: 0,
  };
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
  // Aims: a beat every AIM_MS, on whichever tick comes along.
  let aims = sh0.aims;
  const last = aims[aims.length - 1];
  const beat = !last || nowMs - last.atMs >= AIM_MS ? aimNow(s, nowMs) : null;
  if (beat) aims = [...aims, beat];
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
  if (tick.fruit.length > lastSeen && fruit && tick.t >= fruit.atMs && tick.t < fruit.untilMs) {
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
    pellets: owned,
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
  const bases = rebase(s, sh0.bases, { aims, events }, added, beat ? beat.atMs : null);
  const base0 = bases[0]!;
  events = events.filter((e) => after(e.atMs, base0));
  aims = aimsFrom(aims, base0.atMs);

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
    },
  };

  return ownedAll >= n - isSpot.size ? endRound(out, now) : out;
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

/** Starts the checkpoint list for a fresh sim. */
export function ghostCheckpoints(sim: GhostSim): GhostCheckpoints {
  return { list: [{ tMs: 0, c: sim.checkpoint() }], seen: new Set() };
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
