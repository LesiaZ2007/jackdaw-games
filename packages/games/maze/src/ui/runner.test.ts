import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../options';
import type { MazeOptions } from '../options';
import { actionSchema, layoutOf, maze as game, sendAttack } from '../rules';
import type { MazeAction, MazeState, MazeTick } from '../rules';
import {
  decodeOwners,
  encodeOwners,
  ghostCheckpoints,
  sharedGhosts,
  spotPellets,
  syncSharedGhosts,
} from '../shared';
import { walkerAt } from '../bot';
import { DIRS, DIR_ORDER, opposite, wrapX } from '../sim/layouts';
import type { MazeLayout } from '../sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from '../sim/pellets';
import { POINTS } from '../sim/powers';
import { advance, canEnter, posOf } from '../sim/walker';
import type { Dir } from '../sim/walker';
import { DYING_MS, SPAWN_SHIELD_MS } from '../sim/chomper';
import type { Turn } from '../sim/chomper';
import type { FrameModel } from './frame';
import { PREDICT_MAX_MS, Runner, SEND_GAP_MS, SEND_TIMEOUT_MS, predictAlong } from './runner';
import type { Track } from './runner';

const WREN = 'wren';
const ROOK = 'rook';
const T0 = 10_000;
const NAMES = { wren: 'Wren', rook: 'Rook' };

/** The real rules, driven by a test clock. */
class Server {
  s: MazeState;
  clock = T0;
  private rng = createRng(5);
  constructor(ids: string[], options: Partial<MazeOptions>, seed = 1) {
    this.s = game.setup({
      playerIds: ids,
      options: { ...defaultOptions(ids.length), ...options },
      rng: createRng(seed),
      now: T0,
    });
  }
  /** Round ms now. */
  get t(): number {
    return this.clock - this.s.startAt;
  }
  table() {
    return game.getTableView(this.s);
  }
  view(id: string) {
    return game.getPlayerView(this.s, id);
  }
  timers(): void {
    for (let timer = game.nextTimer!(this.s); timer && timer.at <= this.clock;) {
      const next = game.onTimer!(this.s, timer.id, this.rng, this.clock);
      if (next === this.s) break;
      this.s = next;
      timer = game.nextTimer!(this.s);
    }
  }
  apply(id: string, a: MazeAction): void {
    this.s = game.applyAction(this.s, id, a, this.rng, this.clock);
  }
  /** Moves the round clock to round ms `t` (play starts at 0). */
  goTo(t: number): void {
    this.clock = this.s.startAt + t;
    this.timers();
  }
}

interface Sent {
  at: number;
  a: MazeTick;
}

interface Phone {
  runner: Runner;
  sent: Sent[];
  last: FrameModel | null;
  /** Steps `ms` of frames (and live polls every 800 ms). */
  run(ms: number, each?: (f: FrameModel) => void): Promise<void>;
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

function phone(
  server: Server,
  me: string | null,
  o: {
    drop?: (a: MazeTick, n: number) => boolean;
    steer?: (f: () => FrameModel | null) => (tile: [number, number], dir: Dir | null) => Dir | null;
  } = {},
): Phone {
  const sent: Sent[] = [];
  let poll = server.clock;
  const p: Phone = {
    runner: null as unknown as Runner,
    sent,
    last: null,
    async run(ms, each) {
      const end = server.clock + ms;
      while (server.clock < end) {
        server.clock += 20;
        server.timers();
        if (server.clock - poll >= 800) {
          poll = server.clock;
          p.runner.update(server.table(), me ? server.view(me) : null);
        }
        p.last = p.runner.frame(20);
        each?.(p.last);
        await flush();
      }
    },
  };
  p.runner = new Runner({
    me,
    table: server.table(),
    view: me ? server.view(me) : null,
    names: NAMES,
    now: () => server.clock,
    send: async (a) => {
      const parsed = actionSchema.safeParse(a);
      expect(parsed.success).toBe(true);
      const tick = a as MazeTick;
      sent.push({ at: server.clock, a: tick });
      if (o.drop?.(tick, sent.length)) return false;
      server.apply(me!, a);
      p.runner.update(server.table(), server.view(me!));
      return true;
    },
    ...(o.steer ? { steer: o.steer(() => p.last) } : {}),
  });
  return p;
}

/** Pellet indexes straight ahead of a start tile, up to the first wall. */
function ahead(m: MazeLayout, start: [number, number, Dir]): number[] {
  const idx = pelletIndex(m);
  const out: number[] = [];
  let [x, y] = start;
  while (canEnter(m, [x, y], start[2], false)) {
    x = wrapX(m, x + DIRS[start[2]][0]);
    y += DIRS[start[2]][1];
    const i = idx.get(`${x},${y}`);
    if (i !== undefined) out.push(i);
  }
  return out;
}

/** Steps from the nearest of `sources` to every tile (-1 where unreachable). */
function bfs(m: MazeLayout, sources: [number, number][]): Int16Array {
  const dist = new Int16Array(m.w * m.h).fill(-1);
  const q: number[] = [];
  for (const [x, y] of sources) {
    const k = y * m.w + wrapX(m, Math.round(x));
    if (y >= 0 && y < m.h && dist[k]! < 0) {
      dist[k] = 0;
      q.push(k);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const k = q[h]!;
    const x = k % m.w;
    const y = (k - x) / m.w;
    for (const d of DIR_ORDER) {
      if (!canEnter(m, [x, y], d, false)) continue;
      const nk = (y + DIRS[d][1]) * m.w + wrapX(m, x + DIRS[d][0]);
      if (dist[nk]! < 0) {
        dist[nk] = dist[k]! + 1;
        q.push(nk);
      }
    }
  }
  return dist;
}

/** A simple autopilot: the nearest pellet, away from ghosts. */
const autopilot =
  (get: () => FrameModel | null) =>
  (tile: [number, number], dir: Dir | null): Dir | null => {
    const b = get()?.board;
    if (!b) return null;
    const m = b.layout;
    const targets: [number, number][] = [
      ...b.pellets,
      ...b.powerSpots.filter((s) => s.up).map((s) => [s.x, s.y] as [number, number]),
    ];
    if (!targets.length) return null;
    const dist = bfs(m, targets);
    const danger = b.ghosts
      .filter((g) => g.mode === 'chase' || g.mode === 'scatter')
      .map((g) => [Math.round(g.x), Math.round(g.y)] as [number, number]);
    const gd = danger.length ? bfs(m, danger) : null;
    let best: Dir | null = null;
    let score = Infinity;
    for (const d of DIR_ORDER) {
      if (!canEnter(m, tile, d, false)) continue;
      const k = (tile[1] + DIRS[d][1]) * m.w + wrapX(m, tile[0] + DIRS[d][0]);
      let s = dist[k]! < 0 ? 99 : dist[k]!;
      const g = gd?.[k] ?? -1;
      if (g >= 0 && g < 7) s += (7 - g) * 40;
      if (dir && DIRS[d][0] === -DIRS[dir][0] && DIRS[d][1] === -DIRS[dir][1]) s += 1;
      if (s < score) {
        score = s;
        best = d;
      }
    }
    return best;
  };

/**
 * The way others used to be drawn, kept as the yardstick for the prediction: OLD_DELAY_MS behind
 * real time, along their reported turns, carried straight on past the last report for a while.
 */
const OLD_DELAY_MS = 450;
function delayedPath(m: MazeLayout, tr: Track, tt: number): { x: number; y: number } {
  const perMs = 7.8 / 1000;
  const pts = tr.turns.map(([t, x, y, dir]) => ({ t, x, y, dir: dir as Dir | null }));
  const last = pts[pts.length - 1];
  if (!last || tr.lastT > last.t)
    pts.push({ t: tr.lastT, x: tr.pos[0], y: tr.pos[1], dir: tr.pos[2] ?? last?.dir ?? null });
  const carry = (p: (typeof pts)[number], dist: number) => {
    if (!p.dir || dist <= 0) return { x: p.x, y: p.y };
    const w = walkerAt(m, [p.x, p.y, p.dir]);
    advance(w, dist, m, { ghost: false });
    const [x, y] = posOf(w);
    return { x, y };
  };
  const first = pts[0]!;
  if (tt <= first.t) return { x: first.x, y: first.y };
  let i = pts.length - 1;
  while (i > 0 && pts[i]!.t > tt) i--;
  const a = pts[i]!;
  const b = pts[i + 1];
  if (!b) return carry(a, perMs * Math.min(tt - a.t, 1_500));
  if (!a.dir) return { x: a.x, y: a.y };
  const [dx, dy] = DIRS[a.dir];
  let len: number | null = null;
  if (dx && Math.abs(a.y - b.y) < 1e-6) {
    len = dx > 0 ? b.x - a.x : a.x - b.x;
    if (len < -1e-6) len += m.w;
  } else if (dy && Math.abs(a.x - b.x) < 1e-6) {
    len = dy > 0 ? b.y - a.y : a.y - b.y;
    if (len < -1e-6) len = null;
  }
  if (len === null) return carry(a, perMs * (tt - a.t));
  len = Math.max(0, len);
  const v = Math.max(perMs, len / Math.max(1, b.t - a.t));
  const d = Math.min(len, v * (tt - a.t));
  return { x: a.x + dx * d, y: a.y + dy * d };
}

/** Turns merged so they only grow (as the runner keeps them). */
const mergeTurns = (prev: Turn[], add: Turn[]): Turn[] => {
  const last = prev[prev.length - 1]?.[0] ?? -Infinity;
  return [...prev, ...add.filter((t) => t[0] > last)].slice(-40);
};

/** Distance between two points, through a tunnel if that is shorter. */
const gap = (m: MazeLayout, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = Math.abs(a.x - b.x);
  return Math.hypot(Math.min(dx, m.w - dx), a.y - b.y);
};

/** A fork: a tile that straight on (along `d`) is blocked, with two ways on that aren't back. */
function findFork(m: MazeLayout): { tile: [number, number]; d: Dir; ways: Dir[] } {
  for (let y = 1; y < m.h - 1; y++)
    for (let x = 2; x < m.w - 2; x++)
      for (const d of DIR_ORDER) {
        const back = opposite(d);
        const [bx, by] = DIRS[back];
        const t: [number, number] = [x, y];
        if (canEnter(m, t, d, false) || !canEnter(m, t, back, false)) continue;
        if (!canEnter(m, [x + bx, y + by], back, false)) continue;
        const ways = DIR_ORDER.filter((e) => e !== back && canEnter(m, t, e, false));
        if (ways.length >= 2) return { tile: t, d, ways };
      }
  throw new Error('no fork in this maze');
}

describe('predictAlong', () => {
  const server = new Server([WREN, ROOK], { mode: 'Shared' });
  const m = layoutOf(server.s, 0);

  it('keeps its heading down a corridor and holds at a wall', () => {
    const [sx, sy, d] = m.starts[0]!;
    const n = ahead(m, m.starts[0]!).length;
    const half = predictAlong(m, [sx, sy, d], 3.9);
    expect(Math.abs(half.x - sx) + Math.abs(half.y - sy)).toBeCloseTo(Math.min(n, 3.9), 5);
    const far = predictAlong(m, [sx, sy, d], 200);
    expect(far.held).toBe(true);
    expect(Number.isInteger(far.x) && Number.isInteger(far.y)).toBe(true);
  });

  it('turns a corner (the only way on) but holds at a fork', () => {
    const { tile, d, ways } = findFork(m);
    const [bx, by] = DIRS[opposite(d)];
    const from: [number, number, Dir] = [tile[0] + bx * 2, tile[1] + by * 2, d];
    const at = predictAlong(m, from, 6);
    expect(at).toMatchObject({ x: tile[0], y: tile[1], held: true });
    expect(ways.length).toBeGreaterThanOrEqual(2);
    // A corner: find a tile where straight on is blocked and exactly one way isn't back.
    let corner: { tile: [number, number]; d: Dir; out: Dir } | null = null;
    for (let y = 1; y < m.h - 1 && !corner; y++)
      for (let x = 2; x < m.w - 2 && !corner; x++)
        for (const e of DIR_ORDER) {
          const t: [number, number] = [x, y];
          const back = opposite(e);
          if (canEnter(m, t, e, false) || !canEnter(m, t, back, false)) continue;
          const outs = DIR_ORDER.filter((f) => f !== back && canEnter(m, t, f, false));
          if (outs.length === 1) {
            corner = { tile: t, d: e, out: outs[0]! };
            break;
          }
        }
    expect(corner).not.toBeNull();
    const [cx, cy] = DIRS[opposite(corner!.d)];
    const p = predictAlong(m, [corner!.tile[0] + cx, corner!.tile[1] + cy, corner!.d], 1.5);
    const [ox, oy] = DIRS[corner!.out];
    expect(p.x).toBeCloseTo(wrapX(m, corner!.tile[0] + ox * 0.5), 5);
    expect(p.y).toBeCloseTo(corner!.tile[1] + oy * 0.5, 5);
    expect(p.dir).toBe(corner!.out);
  });
});

describe('Runner reports', () => {
  it('Shared: reports only on change, at least 450 ms apart, and not while idle', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const p = phone(server, WREN);
    await p.run(3000);
    expect(server.s.phase).toBe('play');
    expect(p.sent).toHaveLength(0);
    // Turn now and then for a while.
    const dirs: Dir[] = ['left', 'up', 'right', 'down'];
    for (let i = 0; i < 16; i++) {
      p.runner.input(dirs[i % 4]!);
      await p.run(700);
    }
    expect(p.sent.length).toBeGreaterThan(8);
    for (let i = 1; i < p.sent.length; i++)
      expect(p.sent[i]!.at - p.sent[i - 1]!.at).toBeGreaterThanOrEqual(SEND_GAP_MS);
    // Ticks only grow and keep their maze and round.
    for (let i = 1; i < p.sent.length; i++)
      expect(p.sent[i]!.a.seq).toBeGreaterThan(p.sent[i - 1]!.a.seq);
    expect(server.s.players[WREN]!.seq).toBe(p.sent.at(-1)!.a.seq);
    expect(server.s.players[WREN]!.score).toBeGreaterThan(0);
  });

  it('Shared: an idle phone (dying, nothing new) sends nothing', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const p = phone(server, WREN);
    await p.run(3000 + 4000);
    // Wait until a report has gone and nothing changes for a stretch: stuck at a wall.
    let still = 0;
    let lastPos = '';
    let quietFrom = -1;
    for (let i = 0; i < 400 && quietFrom < 0; i++) {
      await p.run(20);
      const me = p.last!.board!.chompers.find((c) => c.isYou)!;
      const pos = `${me.x},${me.y}`;
      still = pos === lastPos ? still + 1 : 0;
      lastPos = pos;
      if (still > 30) quietFrom = p.sent.length;
    }
    expect(quietFrom).toBeGreaterThanOrEqual(0);
    const caught = server.s.players[WREN]!.caught;
    await p.run(600);
    const settled = p.sent.length;
    await p.run(2000);
    const me = p.last!.board!.chompers.find((c) => c.isYou)!;
    // Unless a ghost came by, nothing more was sent.
    if (me.dying === null && server.s.players[WREN]!.caught === caught)
      expect(p.sent.length).toBe(settled);
  });

  it('Solo: no reports while clearing a maze, then the clear (at most 3 in all)', async () => {
    const server = new Server([WREN], { mode: 'Solo', mazes: 2, powerUps: 'Classic' }, 4);
    const p = phone(server, WREN, { steer: autopilot });
    await p.run(3000);
    let midMaze = -1;
    for (let i = 0; i < 300 && server.s.players[WREN]!.maze === 0; i++) {
      await p.run(1000, (f) => {
        if (f.phase === 'play' && midMaze < 0 && f.board!.pellets.length < 20)
          midMaze = p.sent.length;
      });
      expect(server.s.phase).toBe('play');
    }
    expect(midMaze).toBe(0);
    expect(server.s.players[WREN]!.maze).toBe(1);
    expect(p.sent.length).toBeGreaterThanOrEqual(1);
    expect(p.sent.length).toBeLessThanOrEqual(3);
    await p.run(4000);
    expect(p.last!.board!.maze).toBe(1);
    expect(p.last!.phase).toBe('play');
    expect(p.sent.length).toBeLessThanOrEqual(3);
  }, 60_000);

  it('Solo: a clear tick that does not get through is sent again', async () => {
    const server = new Server([WREN], { mode: 'Solo', mazes: 2 }, 4);
    server.goTo(0);
    const m = layoutOf(server.s, 0);
    const n = pelletIndex(m).size;
    const left = ahead(m, m.starts[0]!).slice(0, 3);
    const bits = new Uint8Array(n).fill(1);
    for (const i of left) bits[i] = 0;
    // The server already has everything but three pellets straight ahead (as after a refresh).
    server.goTo(30_000);
    server.apply(WREN, {
      type: 'tick',
      round: 1,
      seq: 1,
      t: 30_000,
      maze: 0,
      pos: [...m.starts[0]!],
      turns: [],
      eaten: encodeBits(bits),
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    let drops = 0;
    const p = phone(server, WREN, { drop: () => drops++ === 0 });
    await p.run(3000);
    expect(p.sent.length).toBeGreaterThanOrEqual(2);
    expect(decodeBits(p.sent[0]!.a.eaten, n).every((b) => b === 1)).toBe(true);
    expect(p.sent[1]!.a.seq).toBeGreaterThan(p.sent[0]!.a.seq);
    expect(server.s.players[WREN]!.maze).toBe(1);
    await p.run(4000);
    expect(p.last!.board!.maze).toBe(1);
    expect(p.sent.length).toBe(2);
  });
});

describe('Runner attacks and pellets', () => {
  async function racePair(seed = 2) {
    const server = new Server([WREN, ROOK], { mode: 'Race', mazes: 1 }, seed);
    const p = phone(server, WREN);
    await p.run(3200);
    return { server, p };
  }

  /** How far Wren's chomper moves in `ms`. */
  async function travel(p: Phone, ms: number): Promise<number> {
    let d = 0;
    let last: [number, number] | null = null;
    await p.run(ms, (f) => {
      const me = f.board!.chompers.find((c) => c.isYou)!;
      if (last && Math.hypot(me.x - last[0], me.y - last[1]) < 2)
        d += Math.hypot(me.x - last[0], me.y - last[1]);
      last = [me.x, me.y];
    });
    return d;
  }

  it('an inbox Freeze slows the chomper, with a banner, once', async () => {
    const a = await racePair();
    const b = await racePair();
    a.server.s = sendAttack(a.server.s, WREN, 'freeze', ROOK, a.server.clock);
    a.p.runner.update(a.server.table(), a.server.view(WREN));
    const f = a.p.runner.frame(0);
    expect(f.banner?.text).toBe('FROZEN BY ROOK');
    expect(f.effects.filter((e) => e.kind === 'attackReceived')).toHaveLength(1);
    const slow = await travel(a.p, 1000);
    const fast = await travel(b.p, 1000);
    expect(slow).toBeLessThan(fast * 0.6);
    // The same inbox again changes nothing.
    a.p.runner.update(a.server.table(), a.server.view(WREN));
    a.p.runner.update(a.server.table(), a.server.view(WREN));
    expect(a.p.runner.frame(0).effects.filter((e) => e.kind === 'attackReceived')).toHaveLength(0);
  });

  it('applies each attack once, by id: fog shows a fog circle', async () => {
    const { server, p } = await racePair();
    server.s = sendAttack(server.s, WREN, 'fog', ROOK, server.clock);
    server.s = sendAttack(server.s, WREN, 'jinx', ROOK, server.clock);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      p.runner.update(server.table(), server.view(WREN));
      const f = p.runner.frame(16);
      for (const e of f.effects) if (e.kind === 'attackReceived') seen.push(e.text);
      if (i === 0) expect(f.board!.fog).not.toBeNull();
    }
    expect(seen).toEqual(['FOGGED BY ROOK', 'ROOK JINXED YOU!']);
    await p.run(300);
    expect(p.last!.board!.ghosts.some((g) => g.jinxIsYou)).toBe(true);
  });

  it('Shared: a pellet another player owns goes without points', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const m = layoutOf(server.s, 0);
    const path = ahead(m, m.starts[0]!);
    const theirs = path.slice(1, 3);
    const p = phone(server, WREN);
    const n = pelletIndex(m).size;
    const bits = new Uint8Array(n);
    for (const i of theirs) bits[i] = 1;
    server.goTo(500);
    server.apply(ROOK, {
      type: 'tick',
      round: 1,
      seq: 1,
      t: 500,
      maze: 0,
      pos: [...m.starts[1]!],
      turns: [],
      eaten: encodeBits(bits),
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    const owners = decodeOwners(server.s.shared!.owner, n);
    for (const i of theirs) expect(owners[i]).toBe(2);
    p.runner.update(server.table(), server.view(WREN));
    const xy = [...pelletIndex(m).entries()].filter(([, i]) => theirs.includes(i)).map(([k]) => k);
    const drawn = (f: FrameModel) =>
      f.board!.pellets.filter(([x, y]) => xy.includes(`${x},${y}`)).length;
    // Rook's drawn chomper is settled on its prediction, which is past what they reported.
    expect(drawn(p.runner.frame(0))).toBe(0);
    const mine: number[] = [];
    await p.run(2500, (f) => {
      for (const e of f.effects) if (e.kind === 'pellet' && e.mine) mine.push(e.x * 100 + e.y);
    });
    // They stay gone and went to Rook, not to Wren.
    expect(drawn(p.last!)).toBe(0);
    for (const k of xy) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      expect(mine).not.toContain(x * 100 + y);
    }
    const last = p.sent.at(-1)!.a;
    const sentBits = decodeBits(last.eaten, n);
    for (const i of theirs) expect(sentBits[i]).toBe(0);
    expect(sentBits[path[0]!]).toBe(1);
    const score = p.last!.scores.find((s) => s.isYou)!.score;
    expect(score).toBe(server.s.players[WREN]!.score);
  });

  it('Shared: a pellet eaten here but owned there first is taken back quietly', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const m = layoutOf(server.s, 0);
    const n = pelletIndex(m).size;
    const first = ahead(m, m.starts[0]!)[0]!;
    // Wren's phone eats the first pellet before it hears that Rook owns it.
    const p = phone(server, WREN, { drop: () => true });
    await p.run(3300);
    expect(p.last!.scores.find((s) => s.isYou)!.score).toBeGreaterThanOrEqual(POINTS.pellet);
    const bits = new Uint8Array(n);
    bits[first] = 1;
    server.apply(ROOK, {
      type: 'tick',
      round: 1,
      seq: 1,
      t: server.t,
      maze: 0,
      pos: [...m.starts[1]!],
      turns: [],
      eaten: encodeBits(bits),
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    const before = p.last!.scores.find((s) => s.isYou)!.score;
    p.runner.update(server.table(), server.view(WREN));
    const after = p.runner.frame(0).scores.find((s) => s.isYou)!.score;
    expect(after).toBe(before - POINTS.pellet);
    expect(encodeOwners(decodeOwners(server.s.shared!.owner, n))).toBe(server.s.shared!.owner);
  });

  it('Shared: two phones agree on every score once caught up (a lost power spot too)', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared', minutes: 1 }, 3);
    let stolen = 0;
    const wren = phone(server, WREN, { steer: autopilot });
    const rook = phone(server, ROOK, { steer: autopilot });
    // Wren's new power spot pickups reach the server just after Rook's claim of the same spot.
    const send = (wren.runner as unknown as { sendFn: (a: MazeAction) => Promise<boolean> }).sendFn;
    (wren.runner as unknown as { sendFn: (a: MazeAction) => Promise<boolean> }).sendFn = (a) => {
      const known = server.s.players[WREN]!.facts.powers.length;
      for (const [t, spot, kind] of (a as MazeTick).powers.slice(known)) {
        const r = server.s.players[ROOK]!;
        server.apply(ROOK, {
          type: 'tick',
          round: 1,
          seq: r.seq + 1,
          t: Math.max(r.lastT, t - 1),
          maze: 0,
          pos: r.pos,
          turns: [],
          eaten: r.eaten,
          ghosts: r.facts.ghosts,
          caught: r.caught,
          fruit: r.facts.fruit,
          powers: [...r.facts.powers, [t - 1, spot, kind]],
          lives: 3,
        });
        stolen++;
      }
      return send(a);
    };
    let poll = server.clock;
    const end = server.s.endAt! + 2_000;
    while (server.clock < end) {
      server.clock += 20;
      server.timers();
      if (server.clock - poll >= 800) {
        poll = server.clock;
        for (const [p, id] of [
          [wren, WREN],
          [rook, ROOK],
        ] as const)
          p.runner.update(server.table(), server.view(id));
      }
      wren.last = wren.runner.frame(20);
      rook.last = rook.runner.frame(20);
      await flush();
    }
    expect(stolen).toBeGreaterThan(0);
    wren.runner.update(server.table(), server.view(WREN));
    rook.runner.update(server.table(), server.view(ROOK));
    const a = wren.runner.frame(20).scores.map((s) => s.score);
    const b = rook.runner.frame(20).scores.map((s) => s.score);
    expect(a).toEqual(b);
    expect(a).toEqual([server.s.players[WREN]!.score, server.s.players[ROOK]!.score]);
  }, 60_000);
});

describe('Runner others and the TV', () => {
  it('draws another player where they probably are now, from their last report', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const m = layoutOf(server.s, 0);
    const p = phone(server, WREN);
    await p.run(3000);
    const [sx, sy, d] = m.starts[1]!;
    const run = ahead(m, m.starts[1]!).length;
    const ms = Math.round((run / 7.8) * 1000);
    server.goTo(ms + 200);
    server.apply(ROOK, {
      type: 'tick',
      round: 1,
      seq: 1,
      t: ms + 100,
      maze: 0,
      pos: [sx + DIRS[d][0] * run, sy + DIRS[d][1] * run, d],
      turns: [[0, sx, sy, d]],
      eaten: '',
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    p.runner.update(server.table(), server.view(WREN));
    await p.run(400);
    const f = p.last!;
    const rook = f.board!.chompers.find((c) => c.id === ROOK)!;
    const rec = server.table().players.find((x) => x.id === ROOK)!;
    const ms2 = Math.min(server.t - rec.lastT, PREDICT_MAX_MS);
    const want = predictAlong(m, rec.pos, (7.8 * ms2) / 1000);
    expect(rook.x).toBeCloseTo(want.x, 6);
    expect(rook.y).toBeCloseTo(want.y, 6);
    expect(rook.alpha).toBe(0.5);
    expect(rook.isYou).toBe(false);
    expect(f.board!.chompers.find((c) => c.isYou)!.id).toBe(WREN);
  });

  it('the TV never sends, draws everyone at full strength, and Race minis', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const tv = phone(server, null);
    await tv.run(5000);
    expect(tv.sent).toHaveLength(0);
    expect(tv.runner.sends).toBe(0);
    tv.runner.input('left');
    const b = tv.last!.board!;
    expect(b.chompers).toHaveLength(2);
    expect(b.chompers.every((c) => c.alpha === 1 && !c.isYou)).toBe(true);
    expect(b.ghosts.length).toBeGreaterThanOrEqual(4);
    expect(tv.last!.you).toBeNull();

    const race = new Server([WREN, ROOK], { mode: 'Race', mazes: 1 }, 3);
    const rtv = phone(race, null);
    await rtv.run(4000);
    expect(rtv.last!.board).toBeNull();
    expect(rtv.last!.minis.map((x) => x.id)).toEqual([WREN, ROOK]);
    const n = pelletIndex(layoutOf(race.s, 0)).size;
    expect(rtv.last!.minis[0]!.pellets).toHaveLength(n);
    expect(rtv.sent).toHaveLength(0);
  });

  it('counts down 3, 2, 1, GO and shows a timer only with a bell', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const p = phone(server, WREN);
    const counts: number[] = [];
    await p.run(3500, (f) => {
      for (const e of f.effects) if (e.kind === 'count') counts.push(e.n);
    });
    expect(counts).toEqual([3, 2, 1, 0]);
    expect(p.last!.timerMs).toBeGreaterThan(0);
    const solo = new Server([WREN], { mode: 'Solo' }, 3);
    const q = phone(solo, WREN);
    await q.run(3500);
    expect(q.last!.timerMs).toBeNull();
  });
});

describe('Runner: several Shared mazes', () => {
  it('moves the phone and the TV on to maze 2 together: a fresh board, ghosts and countdown', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared', mazes: 2, size: 'Small' }, 3);
    const p = phone(server, WREN);
    const tv = phone(server, null);
    await p.run(3000);
    await tv.run(1000);
    expect(p.last!.board!.maze).toBe(0);
    expect(tv.last!.sharedMaze).toEqual({ maze: 0, mazes: 2 });

    // Rook owns every plain pellet but one, then reports eating that one.
    const m0 = layoutOf(server.s, 0);
    const n0 = pelletIndex(m0).size;
    const spots0 = new Set(spotPellets(m0));
    const owners = decodeOwners(server.s.shared!.owner, n0);
    const free = [...owners.keys()].filter((i) => !owners[i] && !spots0.has(i));
    for (const i of free.slice(1)) owners[i] = 2;
    server.s = { ...server.s, shared: { ...server.s.shared!, owner: encodeOwners(owners) } };
    const last = new Uint8Array(n0);
    last[free[0]!] = 1;
    const rook = server.s.players[ROOK]!;
    server.apply(ROOK, {
      type: 'tick',
      round: 1,
      seq: rook.seq + 1,
      t: server.t,
      maze: 0,
      pos: rook.pos,
      turns: [],
      eaten: encodeBits(last),
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    const sh = server.s.shared!;
    expect(sh.maze).toBe(1);
    const mazeAt = sh.mazeAt!;
    expect(mazeAt).toBe(server.t + 3000);

    p.runner.update(server.table(), server.view(WREN));
    tv.runner.update(server.table(), null);
    await p.run(500);
    await tv.run(20);
    const m1 = layoutOf(server.s, 1);
    const plain1 = pelletIndex(m1).size - spotPellets(m1).filter((i) => i >= 0).length;
    for (const f of [p.last!, tv.last!]) {
      expect(f.board!.maze).toBe(1);
      expect(f.board!.level).toBe(2);
      expect(f.board!.layout).toBe(m1);
      // Every pellet is back (but the ones under a chomper standing at its corner).
      expect(f.board!.pellets.length).toBeGreaterThanOrEqual(plain1 - 2);
      expect(f.phase).toBe('countdown');
      expect(f.countdown!.n).toBeGreaterThan(0);
      expect(f.board!.ghosts.every((g) => g.mode === 'house')).toBe(true);
      expect(f.sharedMaze).toEqual({ maze: 1, mazes: 2 });
    }
    // The phone is back at its corner, the other player at theirs.
    const [sx, sy] = m1.starts[0]!;
    const me = p.last!.board!.chompers.find((c) => c.isYou)!;
    expect([me.x, me.y]).toEqual([sx, sy]);
    const other = tv.last!.board!.chompers.find((c) => c.id === ROOK)!;
    expect([other.x, other.y]).toEqual(m1.starts[1]!.slice(0, 2));

    // Play starts at mazeAt: the phone moves on and reports on maze 2.
    const sentBefore = p.sent.length;
    await p.run(mazeAt - server.t + 1500);
    expect(p.last!.phase).toBe('play');
    const after = p.sent.slice(sentBefore);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((x) => x.a.maze === 1)).toBe(true);
    const moved = p.last!.board!.chompers.find((c) => c.isYou)!;
    // (Without steering it runs to the first wall and waits there.)
    expect(Math.hypot(moved.x - sx, moved.y - sy)).toBeGreaterThanOrEqual(1);
    // Its ghosts are the server's: the ones a sim restored from the new base would show.
    tv.runner.update(server.table(), null);
    await tv.run(20);
    const ref = sharedGhosts(m1, server.s.seed, 1, mazeAt);
    syncSharedGhosts(ref, ghostCheckpoints(ref, mazeAt), server.s.shared!, tv.last!.tMs);
    expect(ref.ghosts().length).toBeGreaterThanOrEqual(4);
    expect(tv.last!.board!.ghosts.map((g) => [g.x, g.y])).toEqual(ref.ghosts().map((g) => g.pos));
  });
});

describe('Runner robustness', () => {
  it('gives up on a send that never settles and reports again', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    let calls = 0;
    const runner = new Runner({
      me: WREN,
      table: server.table(),
      view: server.view(WREN),
      names: NAMES,
      now: () => server.clock,
      send: () => {
        calls++;
        return new Promise<boolean>(() => {});
      },
    });
    const run = async (ms: number, input?: Dir[]) => {
      const end = server.clock + ms;
      let i = 0;
      while (server.clock < end) {
        server.clock += 20;
        server.timers();
        if (server.clock % 800 === 0) runner.update(server.table(), server.view(WREN));
        if (input && server.clock % 400 === 0) runner.input(input[i++ % input.length]!);
        runner.frame(20);
        await flush();
      }
    };
    await run(3000);
    const dirs: Dir[] = ['left', 'up', 'right', 'down'];
    await run(2000, dirs);
    expect(calls).toBe(1);
    await run(SEND_TIMEOUT_MS + 1500, dirs);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('draws another player without a jump when a report shows a turn', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const m = layoutOf(server.s, 0);
    // A start run with an open side street at some tile k along it.
    const [sx, sy, d] = m.starts[1]!;
    let k = 0;
    let side: Dir | null = null;
    let x = sx;
    for (let i = 1; i < 30 && !side && canEnter(m, [x, sy], d, false); i++) {
      x = wrapX(m, x + DIRS[d][0]);
      k = i;
      side = DIR_ORDER.find((e) => DIRS[e][0] === 0 && canEnter(m, [x, sy], e, false)) ?? null;
    }
    expect(side).not.toBeNull();
    // (Only vertical streets off a horizontal run are scripted; the starts run horizontally.)
    expect(DIRS[d][1]).toBe(0);
    const p = phone(server, WREN);
    await p.run(3000);
    const tk = Math.round((k / 7.8) * 1000);
    const tick = (
      seq: number,
      t: number,
      turns: [number, number, number, Dir][],
      pos: [number, number, Dir],
    ): MazeTick => ({
      type: 'tick',
      round: 1,
      seq,
      t,
      maze: 0,
      pos,
      turns,
      eaten: '',
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    const jumps: number[] = [];
    let prev: [number, number] | null = null;
    const watch = (f: FrameModel) => {
      const c = f.board!.chompers.find((q) => q.id === ROOK)!;
      if (prev) jumps.push(Math.hypot(c.x - prev[0], c.y - prev[1]));
      prev = [c.x, c.y];
    };
    // Report A: at the side street, still heading along the run, at round ms tk.
    server.goTo(tk + 100);
    server.apply(ROOK, tick(1, tk, [[0, sx, sy, d]], [x, sy, d]));
    p.runner.update(server.table(), server.view(WREN));
    // The drawing runs on straight past the side street; then a report shows the turn.
    await p.run(100, watch);
    const turned = tick(
      2,
      tk + 180,
      [
        [0, sx, sy, d],
        [tk, x, sy, side!],
      ],
      [x, sy + DIRS[side!][1] * 1.4, side!],
    );
    server.goTo(server.t + 20);
    server.apply(ROOK, turned);
    p.runner.update(server.table(), server.view(WREN));
    await p.run(1500, watch);
    expect(jumps.length).toBeGreaterThan(30);
    expect(Math.max(...jumps)).toBeLessThanOrEqual(0.5);
  });
});

describe('Runner fruit', () => {
  /** Steers to the fruit tile and back and forth over it. */
  const toFruit =
    (get: () => FrameModel | null) =>
    (tile: [number, number], dir: Dir | null): Dir | null => {
      const b = get()?.board;
      if (!b) return null;
      const m = b.layout;
      const dist = bfs(m, [[m.fruit[0], m.fruit[1]]]);
      let best: Dir | null = null;
      let score = Infinity;
      for (const d of DIR_ORDER) {
        if (!canEnter(m, tile, d, false)) continue;
        const k = (tile[1] + DIRS[d][1]) * m.w + wrapX(m, tile[0] + DIRS[d][0]);
        const s = (dist[k]! < 0 ? 99 : dist[k]!) + (dir && d === dir ? 0 : 0.5);
        if (s < score) {
          score = s;
          best = d;
        }
      }
      return best;
    };

  it('Shared: reaching the server’s fruit claims it, and the server awards it', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared', powerUps: 'Classic' }, 3);
    server.goTo(0);
    server.s = {
      ...server.s,
      shared: { ...server.s.shared!, fruit: { fruit: 1, atMs: 0, untilMs: 60_000 } },
    };
    const p = phone(server, WREN, { steer: toFruit });
    let eaten = 0;
    for (let i = 0; i < 40 && server.s.players[WREN]!.fruit === 0; i++)
      await p.run(500, (f) => {
        eaten += f.effects.filter((e) => e.kind === 'fruitEaten').length;
      });
    expect(server.s.players[WREN]!.fruit).toBe(1);
    expect(eaten).toBe(1);
    expect(server.s.shared!.fruit).toBeNull();
    await p.run(1000);
    expect(p.last!.board!.fruit).toBeNull();
    expect(p.last!.scores.find((s) => s.isYou)!.score).toBe(server.s.players[WREN]!.score);
  });

  it('Solo: the fruit is drawn on the tile where it is picked up', async () => {
    const server = new Server([WREN], { mode: 'Solo', powerUps: 'Classic' }, 3);
    const p = phone(server, WREN, { steer: autopilot });
    let shown: [number, number] | null = null;
    let got = false;
    for (let i = 0; i < 120 && !got; i++)
      await p.run(500, (f) => {
        const fr = f.board?.fruit;
        if (fr) shown = [fr.x, fr.y];
        if (f.effects.some((e) => e.kind === 'fruitEaten')) {
          got = true;
          const e = f.effects.find((x) => x.kind === 'fruitEaten') as { x: number; y: number };
          const me = f.board!.chompers.find((c) => c.isYou)!;
          // Picked up within 0.6 tiles of where it was drawn.
          expect(Math.hypot(me.x - e.x, me.y - e.y)).toBeLessThan(0.6 + 0.2);
        }
      });
    const m = layoutOf(server.s, 0);
    expect(got).toBe(true);
    expect(shown).toEqual([m.fruit[0], m.fruit[1]]);
  }, 60_000);
});

describe('Runner spawn protection', () => {
  it.each(['Solo', 'Shared'] as const)(
    '%s: shielded for 2 s from the start, and again after a respawn',
    async (mode) => {
      const ids = mode === 'Solo' ? [WREN] : [WREN, ROOK];
      const server = new Server(ids, { mode }, 3);
      const p = phone(server, WREN);
      const mine = () => p.last!.board!.chompers.find((c) => c.isYou)!;
      await p.run(3000 + 100);
      expect(mine().shieldMs).toBeGreaterThan(1700);
      expect(mine().shieldMs).toBeLessThanOrEqual(SPAWN_SHIELD_MS);
      if (mode === 'Shared') {
        const rook = p.last!.board!.chompers.find((c) => !c.isYou)!;
        expect(rook.shieldMs).toBeGreaterThan(0);
      }
      await p.run(2000);
      expect(mine().shieldMs).toBe(0);
      // Caught: shielded again once it's back.
      let respawned = false;
      for (let i = 0; i < 120 && !respawned; i++)
        await p.run(500, (f) => {
          if (f.effects.some((e) => e.kind === 'respawn' && e.mine)) respawned = true;
        });
      expect(respawned).toBe(true);
      expect(mine().shieldMs).toBeGreaterThan(SPAWN_SHIELD_MS - 600);
    },
    60_000,
  );
});

describe('Runner latency', () => {
  it('your own chomper takes input on the very next frame', async () => {
    const server = new Server([WREN], { mode: 'Solo' }, 3);
    const p = phone(server, WREN);
    await p.run(3000 + 150);
    const me = () => p.last!.board!.chompers.find((c) => c.isYou)!;
    const before = me();
    const back = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[before.dir];
    p.runner.input(back);
    server.clock += 17;
    p.last = p.runner.frame(17);
    expect(me().dir).toBe(back);
  });

  it('Shared: a turn is reported as soon as the 450 ms gap allows, never two at once', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    let inFlight = 0;
    let most = 0;
    const p = phone(server, WREN, { steer: autopilot });
    const turnsAt = new Map<number, number>();
    const send = (p.runner as unknown as { sendFn: (a: MazeAction) => Promise<boolean> }).sendFn;
    (p.runner as unknown as { sendFn: (a: MazeAction) => Promise<boolean> }).sendFn = async (a) => {
      inFlight++;
      most = Math.max(most, inFlight);
      await flush();
      const ok = await send(a);
      inFlight--;
      return ok;
    };
    await p.run(20_000, () => {
      const ch = (p.runner as unknown as { chomper: { state(): { turns: [number][] } } }).chomper;
      for (const [t] of ch.state().turns) if (!turnsAt.has(t)) turnsAt.set(t, server.clock);
    });
    expect(most).toBe(1);
    const sends = p.sent.map((s) => s.at);
    for (let i = 1; i < sends.length; i++)
      expect(sends[i]! - sends[i - 1]!).toBeGreaterThanOrEqual(SEND_GAP_MS);
    let checked = 0;
    for (const [t, seenAt] of turnsAt) {
      // (Turns in the last moment of the run may not be out yet.)
      if (t <= 0 || server.clock - seenAt < SEND_GAP_MS + 40) continue;
      const first = p.sent.find((s) => s.a.turns.some((x) => x[0] === Math.round(t)));
      expect(first, `turn at ${t}`).toBeDefined();
      expect(first!.at - seenAt).toBeLessThanOrEqual(SEND_GAP_MS + 40);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  }, 60_000);
});

describe('Runner others: drawn where they probably are now', () => {
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  /**
   * Rook steers a route; Wren's phone hears about Rook only on its live poll, every 600 ms give
   * or take 150 (Rook reports as the real phone does). Records, frame by frame, where Rook really
   * is, where Wren draws Rook, and where the old delayed path would have drawn Rook.
   * - 'script': straight on at forks, but every third fork turned (corners are followed).
   * - 'random': a random way on (never back) at every fork: the worst case for guessing.
   */
  async function chase(
    route: 'script' | 'random',
    seed: number,
    ms: number,
    mazeSet: MazeOptions['mazeSet'] = 'Mix',
  ) {
    // The seed picks the maze too (handmade or generated, as the set says).
    const server = new Server([WREN, ROOK], { mode: 'Shared', mazeSet }, seed);
    const m = layoutOf(server.s, 0);
    const rng = createRng(seed);
    let at = '';
    let pick: Dir | null = null;
    let forks = 0;
    const steer = (tile: [number, number], dir: Dir | null): Dir | null => {
      const k = tile.join(',');
      if (k === at) return pick;
      at = k;
      const back = dir ? opposite(dir) : null;
      const ways = DIR_ORDER.filter((d) => d !== back && canEnter(m, tile, d, false));
      if (!ways.length) pick = back;
      else if (route === 'random') pick = rng.pick(ways);
      else {
        const turn = ways.length > 1 && ++forks % 3 === 0;
        pick = dir && ways.includes(dir) && !turn ? dir : (ways.find((d) => d !== dir) ?? ways[0]!);
      }
      return pick;
    };
    const rook = phone(server, ROOK, { steer: () => steer });
    const wren = phone(server, WREN);
    const jitter = createRng(seed + 100);
    let wrenPoll = server.clock;
    let rookPoll = server.clock;
    let skipUntil = -Infinity;
    let track = null as Track | null;
    const frames: {
      t: number;
      /** Around a catch (Rook goes back to the start, drawn at once): left out. */
      skip: boolean;
      real: { x: number; y: number };
      drawn: { x: number; y: number; dir: Dir };
      old: { x: number; y: number } | null;
      hid: { x: number; y: number }[];
    }[] = [];
    const end = server.clock + 3000 + ms;
    while (server.clock < end) {
      server.clock += 16;
      server.timers();
      if (server.clock >= rookPoll) {
        rookPoll = server.clock + 600;
        rook.runner.update(server.table(), server.view(ROOK));
      }
      rook.last = rook.runner.frame(16);
      await flush();
      if (server.clock >= wrenPoll) {
        wrenPoll = server.clock + 600 + (jitter.next() - 0.5) * 300;
        const tv = server.table();
        wren.runner.update(tv, server.view(WREN));
        const r = tv.players.find((x) => x.id === ROOK)!;
        track = {
          turns: mergeTurns(track?.turns ?? [], r.turns),
          lastT: Math.max(track?.lastT ?? 0, r.lastT),
          pos: r.lastT >= (track?.lastT ?? 0) ? r.pos : track!.pos,
        };
      }
      const f = wren.runner.frame(16);
      wren.last = f;
      await flush();
      if (server.t < 0) continue;
      const real = rook.last.board!.chompers.find((c) => c.isYou)!;
      if (real.dying !== null) skipUntil = server.t + DYING_MS + 2_000;
      const drawn = f.board!.chompers.find((c) => c.id === ROOK)!;
      frames.push({
        t: server.t,
        skip: server.t < skipUntil,
        real: { x: real.x, y: real.y },
        drawn: { x: drawn.x, y: drawn.y, dir: drawn.dir },
        old: track ? delayedPath(m, track, server.t - OLD_DELAY_MS) : null,
        hid: f.effects.flatMap((e) =>
          e.kind === 'pellet' && e.by === ROOK && !e.mine ? [{ x: e.x, y: e.y }] : [],
        ),
      });
    }
    return { server, m, frames, wren };
  }

  /** Mean error against the real position (new and old), and the biggest step between frames. */
  async function measure(
    route: 'script' | 'random',
    seeds: number[],
    mazeSet: MazeOptions['mazeSet'] = 'Mix',
  ) {
    let newSum = 0;
    let oldSum = 0;
    let n = 0;
    let worstStep = 0;
    let worstBack = 0;
    for (const seed of seeds) {
      const { m, frames } = await chase(route, seed, 9_000, mazeSet);
      for (const [i, f] of frames.entries()) {
        if (f.t >= 1_000 && f.old && !f.skip) {
          newSum += gap(m, f.drawn, f.real);
          oldSum += gap(m, f.old, f.real);
          n++;
        }
        const prev = frames[i - 1];
        if (!prev || prev.skip || f.skip) continue;
        // A tunnel wraps from one edge to the other: not a jump.
        if (Math.abs(f.drawn.x - prev.drawn.x) > m.w / 2) continue;
        worstStep = Math.max(worstStep, gap(m, f.drawn, prev.drawn));
        // Stepping back against the way it faces (with no turn in between).
        if (f.drawn.dir === prev.drawn.dir) {
          const [hx, hy] = DIRS[f.drawn.dir];
          const along = (f.drawn.x - prev.drawn.x) * hx + (f.drawn.y - prev.drawn.y) * hy;
          worstBack = Math.max(worstBack, -along);
        }
      }
    }
    const res = { n, meanNew: newSum / n, meanOld: oldSum / n, worstStep, worstBack };
    console.log(
      `others drawn vs real (${route} route, ${mazeSet} mazes), mean tiles off: old delayed path ` +
        `${res.meanOld.toFixed(2)}, predicted ${res.meanNew.toFixed(2)}; ` +
        `biggest step between frames ${worstStep.toFixed(2)}, back ${worstBack.toFixed(2)}`,
    );
    return res;
  }

  it('is far closer to where they are than the old delayed path, and never jumps or backs up', async () => {
    const r = await measure('script', range(1, 20));
    expect(r.n).toBeGreaterThan(1000);
    expect(r.meanNew).toBeLessThanOrEqual(r.meanOld * 0.5);
    expect(r.worstStep).toBeLessThanOrEqual(0.5);
    // Rook never turns round on this route, so the drawing never visibly steps back either.
    expect(r.worstBack).toBeLessThan(0.05);
  }, 120_000);

  it('is still closer with a random turn at every fork, and never jumps', async () => {
    const r = await measure('random', range(21, 30));
    expect(r.n).toBeGreaterThan(1000);
    // Wrong guesses are eased out rather than jumped, which costs some of the gain here.
    expect(r.meanNew).toBeLessThanOrEqual(r.meanOld * 0.75);
    expect(r.worstStep).toBeLessThanOrEqual(0.5);
  }, 120_000);

  it('works the same on generated mazes', async () => {
    const r = await measure('script', range(31, 38), 'Random');
    expect(r.n).toBeGreaterThan(1000);
    expect(r.meanNew).toBeLessThanOrEqual(r.meanOld * 0.6);
    expect(r.worstStep).toBeLessThanOrEqual(0.5);
    expect(r.worstBack).toBeLessThan(0.05);
  }, 120_000);

  it('hides pellets Rook eats no more than about a tile ahead of where Rook is drawn', async () => {
    let checked = 0;
    for (const route of ['script', 'random'] as const) {
      const { m, frames, server, wren } = await chase(route, 21, 9_000);
      // How far along Rook's real route each frame is.
      const arc: number[] = [0];
      for (let i = 1; i < frames.length; i++) {
        const step = gap(m, frames[i]!.real, frames[i - 1]!.real);
        arc.push(arc[i - 1]! + (step < 2 ? step : 0));
      }
      for (const [i, f] of frames.entries())
        for (const p of f.hid) {
          checked++;
          // Gone right under (or next to) the drawn chomper: fine.
          if (gap(m, f.drawn, p) <= 1.2) continue;
          // Otherwise Rook really ate it already, and the drawn chomper is past it on the route.
          let k = -1;
          for (let j = i; j >= 0 && k < 0; j--) if (gap(m, frames[j]!.real, p) < 0.5) k = j;
          expect(k).toBeGreaterThanOrEqual(0);
          let best = Infinity;
          let drawnArc = arc[i]!;
          for (let j = k; j <= i; j++) {
            const d = gap(m, frames[j]!.real, f.drawn);
            if (d < best) [best, drawnArc] = [d, arc[j]!];
          }
          expect(arc[k]! - drawnArc).toBeLessThanOrEqual(1.2);
        }
      // A pellet hidden on a guess that no report backs up comes back.
      await wren.run(3_000);
      const idx = pelletIndex(m);
      const owners = decodeOwners(server.s.shared!.owner, idx.size);
      const shown = new Set(wren.last!.board!.pellets.map(([x, y]) => `${x},${y}`));
      for (const f of frames)
        for (const p of f.hid)
          if (!owners[idx.get(`${p.x},${p.y}`)!]) expect(shown.has(`${p.x},${p.y}`)).toBe(true);
    }
    expect(checked).toBeGreaterThan(20);
  }, 120_000);

  it('holds at a fork until a report says which way they went', async () => {
    const server = new Server([WREN, ROOK], { mode: 'Shared' }, 3);
    const m = layoutOf(server.s, 0);
    const { tile, d, ways } = findFork(m);
    const [bx, by] = DIRS[opposite(d)];
    const p = phone(server, WREN);
    await p.run(3000);
    const tick = (seq: number, t: number, pos: [number, number, Dir]): MazeTick => ({
      type: 'tick',
      round: 1,
      seq,
      t,
      maze: 0,
      pos,
      turns: [[t, pos[0], pos[1], pos[2]]],
      eaten: '',
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    });
    server.apply(ROOK, tick(1, server.t - 50, [tile[0] + bx * 2, tile[1] + by * 2, d]));
    p.runner.update(server.table(), server.view(WREN));
    const drawn = () => p.last!.board!.chompers.find((c) => c.id === ROOK)!;
    const seen: { x: number; y: number }[] = [];
    await p.run(1000, () => seen.push({ x: drawn().x, y: drawn().y }));
    // Two tiles take about 256 ms; from then on it waits at the fork's center.
    for (const s of seen.slice(-30)) expect(s).toMatchObject({ x: tile[0], y: tile[1] });
    // Then a report: they took one of the ways.
    const way = ways[0]!;
    const [wx, wy] = DIRS[way];
    server.apply(ROOK, tick(2, server.t - 100, [tile[0] + wx * 0.5, tile[1] + wy * 0.5, way]));
    p.runner.update(server.table(), server.view(WREN));
    let prev = { x: drawn().x, y: drawn().y };
    let worst = 0;
    await p.run(300, () => {
      worst = Math.max(worst, gap(m, drawn(), prev));
      prev = { x: drawn().x, y: drawn().y };
    });
    const moved = (drawn().x - tile[0]) * wx + (drawn().y - tile[1]) * wy;
    expect(moved).toBeGreaterThan(1.5);
    expect(worst).toBeLessThanOrEqual(0.5);
  });
});
