import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../options';
import type { MazeOptions } from '../options';
import { actionSchema, layoutOf, maze as game, sendAttack } from '../rules';
import type { MazeAction, MazeState, MazeTick } from '../rules';
import { decodeOwners, encodeOwners } from '../shared';
import { DIRS, DIR_ORDER, wrapX } from '../sim/layouts';
import type { MazeLayout } from '../sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from '../sim/pellets';
import { POINTS } from '../sim/powers';
import { canEnter } from '../sim/walker';
import type { Dir } from '../sim/walker';
import type { FrameModel } from './frame';
import { OTHERS_DELAY_MS, Runner, SEND_GAP_MS, SEND_TIMEOUT_MS, samplePath } from './runner';
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

describe('samplePath', () => {
  const server = new Server([WREN, ROOK], { mode: 'Shared' });
  const m = layoutOf(server.s, 0);

  it('moves straight between turns and arrives at each turn on time', () => {
    // A straight run along a row of the maze from one pellet to another.
    const row = ahead(m, m.starts[0]!);
    expect(row.length).toBeGreaterThan(2);
    const [sx, sy, d] = m.starts[0]!;
    const n = row.length;
    const end = [sx + DIRS[d][0] * n, sy + DIRS[d][1] * n] as const;
    const tr: Track = {
      turns: [[1000, sx, sy, d]],
      lastT: 1000 + (n / 7.8) * 1000,
      pos: [end[0], end[1], d],
    };
    const mid = samplePath(m, tr, 1000 + (n / 7.8) * 500);
    expect(mid.x).toBeCloseTo(sx + (DIRS[d][0] * n) / 2, 5);
    expect(mid.y).toBeCloseTo(sy + (DIRS[d][1] * n) / 2, 5);
    expect(samplePath(m, tr, tr.lastT)).toMatchObject({ x: end[0], y: end[1] });
    expect(samplePath(m, tr, 500)).toMatchObject({ x: sx, y: sy });
  });

  it('jumps at a respawn instead of gliding across walls', () => {
    const [sx, sy, d] = m.starts[0]!;
    const tr: Track = {
      turns: [
        [0, sx, sy, d],
        [2000, m.starts[1]![0], m.starts[1]![1], m.starts[1]![2]],
      ],
      lastT: 2000,
      pos: [m.starts[1]![0], m.starts[1]![1], m.starts[1]![2]],
    };
    const before = samplePath(m, tr, 1999);
    const at = samplePath(m, tr, 2000);
    expect(at).toMatchObject({ x: m.starts[1]![0], y: m.starts[1]![1] });
    expect(Math.hypot(before.x - at.x, before.y - at.y)).toBeGreaterThan(2);
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

  it('Shared: a pellet another player owns goes without points, and stays drawn a moment', async () => {
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
    expect(drawn(p.runner.frame(0))).toBe(2);
    const mine: number[] = [];
    await p.run(2500, (f) => {
      for (const e of f.effects) if (e.kind === 'pellet' && e.mine) mine.push(e.x * 100 + e.y);
    });
    // Rook's chomper never came by, so they went on the timeout, not to Wren.
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
});

describe('Runner others and the TV', () => {
  it('draws another player along their path, OTHERS_DELAY_MS behind', async () => {
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
    const f = p.runner.frame(16);
    const rook = f.board!.chompers.find((c) => c.id === ROOK)!;
    const rec = server.table().players.find((x) => x.id === ROOK)!;
    const want = samplePath(
      m,
      { turns: rec.turns, lastT: rec.lastT, pos: rec.pos },
      server.t - OTHERS_DELAY_MS,
    );
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
    server.goTo(tk + OTHERS_DELAY_MS - 250);
    server.apply(ROOK, tick(1, tk, [[0, sx, sy, d]], [x, sy, d]));
    p.runner.update(server.table(), server.view(WREN));
    // The delayed drawing runs on past the last point; then the real report shows the turn.
    await p.run(500, watch);
    const turned = tick(
      2,
      tk + 900,
      [
        [0, sx, sy, d],
        [tk, x, sy, side!],
      ],
      [x, sy + DIRS[side!][1] * 6, side!],
    );
    server.goTo(server.t + 20);
    server.apply(ROOK, turned);
    p.runner.update(server.table(), server.view(WREN));
    await p.run(1500, watch);
    expect(jumps.length).toBeGreaterThan(30);
    expect(Math.max(...jumps)).toBeLessThanOrEqual(0.5);
  });
});
