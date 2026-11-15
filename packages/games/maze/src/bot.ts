import { botSlips } from '@jackdaw/engine';
import type { BotContext, BotLevel } from '@jackdaw/engine';
import type { MazeAction, MazePlayerView, MazeTableView } from './rules';
import { AIM_MS, spotPellets, takenBits } from './shared';
import { ChomperSim, DYING_MS } from './sim/chomper';
import type { Turn } from './sim/chomper';
import { GhostSim, ghostSeed } from './sim/ghosts';
import type { GhostCheckpoint, GhostEvent, GhostInput, GhostView } from './sim/ghosts';
import { DIRS, DIR_ORDER, MAZE_LAYOUTS, opposite, wrapX } from './sim/layouts';
import type { MazeLayout } from './sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from './sim/pellets';
import { powerMs } from './sim/powers';
import type { PowerKind } from './sim/powers';
import { canEnter } from './sim/walker';
import type { Dir, Vec, Walker } from './sim/walker';

/**
 * The server's computer player. Each call rebuilds the bot's chomper from its last report
 * (position from the table; turns, facts and pellets from its player view), runs it forward to
 * the server's clock with the same chomper and ghost sims the phones use, and returns the next
 * cumulative tick with the turns it made.
 *
 * In the Shared maze the bot restores the server's ghost base from the table view (the newest
 * one at or before its last report) and steps on with the kept aims and events, exactly as a
 * phone does, so its ghosts are the phones' (later aims and other players' unreported eats can't
 * be known yet, by the bot or by a phone). In Solo and Race the ghosts chase the bot's own
 * chomper and nobody else runs them: they are rebuilt from the maze start each call, with
 * earlier aims taken from the last 40 turns it reported (the last turn point before each beat),
 * so a long maze's early aims are only approximate. A small cache (`ghostCache`) saves replaying
 * the whole maze each call; it never changes the result.
 */

/** Fixed bot step, in ms (the chomper and ghosts are stepped at about 60 Hz). */
const DT = 50 / 3;
/** Longest stretch one call simulates, in round ms (a bot that has been idle catches up). */
const MAX_SPAN_MS = 20_000;
/** How close (in steps) a ghost must be before a bot of each level steers away from it. */
const DANGER: Record<BotLevel, number> = { easy: 2, normal: 3, hard: 4 };
const FREEZE_MS = 2500;
const JINX_MS = 8000;

export { ghostSeed };

const key = (m: MazeLayout, x: number, y: number) => y * m.w + x;

/** Steps from the nearest source tile (multi-source BFS); -1 where unreachable. */
function bfs(m: MazeLayout, sources: Vec[], ghost: boolean): Int16Array {
  const dist = new Int16Array(m.w * m.h).fill(-1);
  const q: number[] = [];
  for (const [x, y] of sources) {
    if (y < 0 || y >= m.h) continue;
    const k = key(m, wrapX(m, x), y);
    if (dist[k]! < 0) {
      dist[k] = 0;
      q.push(k);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    const x = k % m.w;
    const y = (k - x) / m.w;
    for (const d of DIR_ORDER) {
      if (!canEnter(m, [x, y], d, ghost)) continue;
      const nk = key(m, wrapX(m, x + DIRS[d][0]), y + DIRS[d][1]);
      if (dist[nk]! < 0) {
        dist[nk] = dist[k]! + 1;
        q.push(nk);
      }
    }
  }
  return dist;
}

/**
 * How many tiles (up to 40) we could reach from `first` before a ghost can: a small number means
 * a dead end or a pocket the ghosts will close. `from` is the tile we're leaving.
 */
function safeRoom(
  m: MazeLayout,
  ghostDist: Int16Array,
  from: [number, number],
  first: number,
): number {
  const seen = new Set<number>([key(m, from[0], from[1]), first]);
  const q: [number, number][] = [[first, 1]];
  let count = 0;
  for (let h = 0; h < q.length && count < 40; h++) {
    const [k, steps] = q[h]!;
    const gd = ghostDist[k]!;
    if (gd >= 0 && steps >= gd) continue;
    count++;
    const x = k % m.w;
    const y = (k - x) / m.w;
    for (const d of DIR_ORDER) {
      if (!canEnter(m, [x, y], d, false)) continue;
      const nk = key(m, wrapX(m, x + DIRS[d][0]), y + DIRS[d][1]);
      if (seen.has(nk)) continue;
      seen.add(nk);
      q.push([nk, steps + 1]);
    }
  }
  return count;
}

/** A reported position as a walker: on a tile, or part way along its heading. */
export function walkerAt(m: MazeLayout, pos: [number, number, Dir | null]): Walker {
  const [x, y, d] = pos;
  const near = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
  if (!d || (near(x) && near(y))) {
    return { tile: [wrapX(m, Math.round(x)), Math.round(y)], dir: d, next: null, prog: 0 };
  }
  const [dx, dy] = DIRS[d];
  const tile: [number, number] =
    dx > 0 || dy > 0
      ? [wrapX(m, Math.floor(x + 1e-9)), Math.floor(y + 1e-9)]
      : [wrapX(m, Math.ceil(x - 1e-9)), Math.ceil(y - 1e-9)];
  const prog = dx ? Math.abs(x - tile[0]) : Math.abs(y - tile[1]);
  return { tile, dir: d, next: null, prog: Math.min(Math.max(prog, 0), 0.999) };
}

/**
 * Solo and Race: where the last rebuild of each bot's ghosts got to, so the next call (about
 * 900 ms later) can carry on from there instead of replaying the whole maze. Only a shortcut: an
 * entry is used only when every aim and event up to its time is exactly what it was built from,
 * and the ghosts then come out the same as a replay from the start (tested).
 */
const ghostCache = new Map<string, { tMs: number; sig: string; c: GhostCheckpoint }>();
const GHOST_CACHE_MAX = 64;

/** Empties the ghost cache (tests compare runs with and without it). */
export function clearGhostCache(): void {
  ghostCache.clear();
}

const inputSig = (input: GhostInput, tMs: number): string =>
  JSON.stringify([
    input.aims.filter((a) => a.atMs <= tMs),
    input.events.filter((e) => e.atMs <= tMs),
  ]);

/** Steps a fresh GhostSim to `tMs`, from a cached checkpoint when one still fits. */
function catchUp(sim: GhostSim, key: string, input: GhostInput, tMs: number): void {
  const hit = ghostCache.get(key);
  if (hit && hit.tMs <= tMs && inputSig(input, hit.tMs) === hit.sig) sim.restore(hit.c);
  sim.stepTo(tMs, input);
  ghostCache.delete(key);
  ghostCache.set(key, { tMs, sig: inputSig(input, tMs), c: sim.checkpoint() });
  if (ghostCache.size > GHOST_CACHE_MAX) ghostCache.delete(ghostCache.keys().next().value!);
}

/** What a bot call saw, for tests: its ghosts at the start, and each ghost it ate. */
export interface BotTrace {
  start?(fromMs: number, ghosts: GhostView[]): void;
  eat?(tMs: number, ghost: number, pos: [number, number], ghosts: GhostView[]): void;
}

export function mazeBot(
  ctx: BotContext<MazePlayerView, MazeTableView>,
  trace?: BotTrace,
): MazeAction | null {
  const { playerId: me, tableView: tv, view, rng, now, level } = ctx;
  if (tv.phase !== 'play') return null;
  const rec = tv.players.find((p) => p.id === me);
  if (!rec || rec.done) return null;
  const shared = tv.mode === 'Shared';
  const solo = tv.mode === 'Solo';
  const m = MAZE_LAYOUTS[tv.layouts[rec.maze] ?? tv.layouts[0] ?? 0]!;
  const lvl = rec.maze + 1;
  const idx = pelletIndex(m);
  const n = idx.size;
  const nowMs = now - tv.startAt;
  const from = Math.max(view.lastT, rec.mazeAt);
  let to = Math.min(nowMs, from + MAX_SPAN_MS);
  if (tv.endAt !== null) to = Math.min(to, tv.endAt - tv.startAt);
  if (to - from < DT || view.lives <= 0) return null;

  // Ghosts: from the maze start, on this maze's clock.
  const off = shared ? 0 : rec.mazeAt;
  const ghosts = new GhostSim(m, ghostSeed(tv.seed, rec.maze), lvl);
  const input: GhostInput = { aims: [], events: [], ...(shared ? {} : { frightFor: me }) };
  const fright = (t: number): GhostEvent => ({
    atMs: t - off,
    kind: 'fright',
    untilMs: t - off + powerMs('hunt', lvl),
  });
  const facts = view.facts;
  if (shared) {
    if (tv.shared) {
      input.aims.push(...tv.shared.aims);
      input.events.push(...tv.shared.events);
    }
  } else {
    for (const [t, , kind] of facts.powers) if (kind === 'hunt') input.events.push(fright(t));
    for (const a of view.inbox) {
      if (a.kind !== 'jinx') continue;
      const at = a.atMs - off;
      input.events.push({ atMs: at, kind: 'jinx', target: me, untilMs: at + JINX_MS });
    }
  }
  // Its own ghost eats, unless the Shared events already hold them (older ones are in the base).
  const known = new Set(
    input.events.map((e) => (e.kind === 'eaten' ? `${e.atMs}:${e.ghost}` : '')),
  );
  for (const [t, g] of facts.ghosts)
    if (!known.has(`${t - off}:${g}`))
      input.events.push({ atMs: t - off, kind: 'eaten', ghost: g });

  // The chomper, from its last report.
  const spotAt = spotPellets(m);
  const seat = tv.players.findIndex((p) => p.id === me);
  const st = m.starts[shared ? Math.max(0, seat) % m.starts.length : 0] ?? m.starts[0]!;
  const had = decodeBits(view.eaten, n);
  const taken = shared && tv.shared ? takenBits(tv.shared, n) : new Uint8Array(n);
  for (let i = 0; i < n; i++) if (had[i]) taken[i] = 1;
  const chomper = new ChomperSim({
    m,
    start: [st[0], st[1], st[2]],
    level: lvl,
    powers: tv.powers,
    ghosts,
    taken,
    fruit: !shared,
    id: me,
    steer: (tile, dir) => (deadUntil === 0 ? decide(tile, dir) : null),
  });
  const lastDead = facts.caughtAt[facts.caughtAt.length - 1];
  chomper.resume({
    walker: walkerAt(m, rec.pos),
    power: rec.power && rec.power.untilMs > from ? rec.power : null,
    dyingUntil: lastDead !== undefined ? lastDead + DYING_MS : 0,
    ate: had.reduce((a, b) => a + b, 0),
    fruitN: facts.fruit.length,
  });
  if (view.turns.length === 0) chomper.respawn(from);
  for (const a of view.inbox)
    if (a.kind === 'freeze' && a.atMs + FREEZE_MS > from) chomper.freeze(a.atMs + FREEZE_MS);

  // Solo and Race aims: the bot's own tile at each beat, from its turns for the past.
  const tileAt = (t: number): Vec => {
    let tile: Vec = [st[0], st[1]];
    for (const [tt, x, y] of view.turns)
      if (tt <= t) tile = [wrapX(m, Math.round(x)), Math.round(y)];
    return tile;
  };
  let lastBeat = -Infinity;
  if (!shared) {
    for (let b = 0; b <= from - off; b += AIM_MS) {
      input.aims.push({ atMs: b, tiles: { [me]: tileAt(b + off) } });
      lastBeat = b;
    }
  }
  if (shared) {
    // The newest server base at or before the last report (the oldest one if none is).
    const bases = tv.shared?.bases ?? [];
    let base = bases[0];
    for (const b of bases) if (b.atMs <= from) base = b;
    if (base) ghosts.restore(base.c);
    ghosts.stepTo(from, input);
  } else
    catchUp(ghosts, `${tv.seed}:${rec.maze}:${tv.layouts[rec.maze] ?? 0}:${me}`, input, from - off);
  trace?.start?.(from, ghosts.ghosts());

  const fruitSeen = tv.shared?.fruitSeen[me] ?? 0;
  const sharedFruit = shared && tv.shared ? tv.shared.fruit : null;
  const powersOut = facts.powers.map((x) => [...x] as [number, number, PowerKind]);
  const ghostsOut = facts.ghosts.map((x) => [...x] as [number, number]);
  const caughtAt = [...facts.caughtAt];
  let fruitOut = [...facts.fruit];
  let caught = view.caught;
  let lives = view.lives;
  let deadUntil = lastDead !== undefined ? lastDead + DYING_MS : 0;
  if (deadUntil <= from) deadUntil = 0;
  let finishMs: number | undefined;
  let tEnd = from;
  let claimedFruit = false;

  const decide = (tile: [number, number], dir: Dir | null): Dir | null => {
    const opts = DIR_ORDER.filter((d) => canEnter(m, tile, d, false));
    if (!opts.length) return null;
    const live = ghosts.ghosts();
    const power = chomper.state().power?.kind;
    const hunting = power === 'hunt';
    const tileOf = (p: [number, number]): Vec => [wrapX(m, Math.round(p[0])), Math.round(p[1])];
    const targets: Vec[] = [];
    for (const g of live)
      if ((hunting || g.mode === 'fright') && g.mode !== 'eyes' && g.mode !== 'house')
        targets.push(tileOf(g.pos));
    if (sharedFruit) {
      if (!claimedFruit && tEnd >= sharedFruit.atMs && tEnd < sharedFruit.untilMs)
        targets.push(m.fruit);
    } else if (chomper.state().fruit) targets.push(m.fruit);
    if (!targets.length || rng.next() < 0.15) {
      for (const [k, i] of idx) {
        if (!chomper.has(i)) continue;
        const [x, y] = k.split(',').map(Number) as [number, number];
        targets.push([x, y]);
      }
    }
    const dist = bfs(m, targets.length ? targets : [m.exit], false);
    const scary =
      !hunting && power !== 'phase'
        ? live
            .filter(
              (g) =>
                (g.mode === 'chase' || g.mode === 'scatter') &&
                (g.jinxTarget === undefined || g.jinxTarget === me),
            )
            .map((g) => tileOf(g.pos))
        : [];
    const dd = scary.length ? bfs(m, scary, true) : null;
    const reach = DANGER[level];
    const near = dd && dd[key(m, tile[0], tile[1])]! >= 0 && dd[key(m, tile[0], tile[1])]! < 10;
    const scored = opts.map((d) => {
      const k = key(m, wrapX(m, tile[0] + DIRS[d][0]), tile[1] + DIRS[d][1]);
      let s = dist[k]!;
      if (s < 0) s = 99;
      if (dd) {
        const gd = dd[k]!;
        if (gd >= 0 && gd < reach) s += (reach - gd) * 25;
        // Don't run into a pocket the ghosts can close before we get out of it.
        if (near && level !== 'easy') {
          const room = safeRoom(m, dd, tile, k);
          if (room < 14) s += (14 - room) * 6;
        }
      }
      if (dir && d === opposite(dir)) s += 1.5;
      s += rng.next() * 0.8;
      return { d, s };
    });
    if (botSlips(level, rng, 0.6)) {
      const free = scored.filter((x) => !dir || x.d !== opposite(dir));
      const pool = free.length ? free : scored;
      return pool[Math.floor(rng.next() * pool.length)]!.d;
    }
    return scored.reduce((a, b) => (b.s < a.s ? b : a)).d;
  };

  for (let k = 1; ; k++) {
    const t = from + Math.round(k * DT);
    if (t > to) break;
    const dt = t - tEnd;
    tEnd = t;
    const g = t - off;
    if (!shared && g - lastBeat >= AIM_MS) {
      const [px, py] = chomper.position();
      input.aims.push({ atMs: g, tiles: { [me]: [wrapX(m, Math.round(px)), Math.round(py)] } });
      lastBeat = g;
    }
    ghosts.stepTo(g, input);
    if (deadUntil > 0 && t >= deadUntil) {
      chomper.respawn(t);
      deadUntil = 0;
    }
    for (const e of chomper.step(dt, t)) {
      if (e.kind === 'power') {
        const spot = spotAt.indexOf(e.i);
        if (spot >= 0 && powersOut.length < 32) powersOut.push([t, spot, e.power]);
        if (e.power === 'hunt' && !shared) input.events.push(fright(t));
      } else if (e.kind === 'fruit') {
        if (fruitOut.length < 16) fruitOut.push(e.fruit);
      } else if (e.kind === 'ghost') {
        if (ghostsOut.length < 64) ghostsOut.push([t, e.ghost]);
        trace?.eat?.(
          t,
          e.ghost,
          chomper.position().slice(0, 2) as [number, number],
          ghosts.ghosts(),
        );
        input.events.push({ atMs: g, kind: 'eaten', ghost: e.ghost });
      } else if (e.kind === 'caught') {
        caught++;
        caughtAt.push(t);
        if (solo) lives--;
        deadUntil = t + DYING_MS;
      } else if (e.kind === 'cleared' && !shared) finishMs = t;
    }
    if (sharedFruit && !claimedFruit && deadUntil === 0) {
      const c = chomper.center();
      if (
        c &&
        c.tile[0] === m.fruit[0] &&
        c.tile[1] === m.fruit[1] &&
        t >= sharedFruit.atMs &&
        t < sharedFruit.untilMs &&
        fruitSeen < 16
      ) {
        claimedFruit = true;
        fruitOut = [...facts.fruit];
        while (fruitOut.length < fruitSeen) fruitOut.push(0);
        fruitOut.push(sharedFruit.fruit);
      }
    }
    if (lives <= 0 || finishMs !== undefined) break;
  }
  if (tEnd === from) return null;

  const state = chomper.state();
  for (let i = 0; i < n; i++) if (had[i]) state.eaten[i] = 1;
  const turns: Turn[] = state.turns.map(([a, x, y, d]) => [Math.round(a), x, y, d]);
  const last = rec.maze >= tv.layouts.length - 1;
  return {
    type: 'tick',
    round: tv.round,
    seq: view.seq + 1,
    t: tEnd,
    maze: rec.maze,
    pos: chomper.position(),
    turns: turns.slice(-40),
    eaten: encodeBits(state.eaten),
    ghosts: ghostsOut.slice(-64),
    caught,
    caughtAt: caughtAt.slice(-16),
    fruit: fruitOut.slice(0, 16),
    powers: powersOut.slice(-32),
    lives: solo ? lives : view.lives,
    ...(finishMs !== undefined && last ? { finishMs } : {}),
  };
}
