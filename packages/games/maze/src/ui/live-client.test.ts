import { describe, expect, it } from 'vitest';
import type { MazeLayout } from '../sim/layouts';
import { LiveRound, type LiveChomper, type LiveSnapshot } from '../live';
import { INTERP_MS, LiveClient, SNAP_TILES } from './live-client';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;
function corridor(branch = false): MazeLayout {
  const rows = [WALL, row('.'.repeat(25)), row(branch ? '#########.' : '.'), row('.'), row('.')];
  while (rows.length < 24) rows.push(WALL);
  return {
    id: 'test-corridor',
    size: 'Medium',
    w: 27,
    h: 24,
    rows,
    starts: [
      [2, 1, 'right'],
      [24, 1, 'left'],
    ],
    house: [13, 12],
    exit: [13, 7],
    fruit: [10, 1],
    powers: [],
  };
}

/** Local clock = round clock (offset 0, started at 0), so local ms are round ms. */
const client = (m: MazeLayout, me = 'p1', taken: number[] = []) =>
  new LiveClient({ me, layout: m, startedAt: 0, offsetMs: 0, taken });
const mine = (c: LiveClient, now: number, id = 'p1') =>
  c.frame(now).chompers.find((x) => x.id === id)!;
/** Frames every 16 ms from `from` until `pred` holds; returns that time. */
function play(c: LiveClient, from: number, limit: number, pred: (me: LiveChomper) => boolean) {
  for (let t = from; t <= from + limit; t += 16) if (pred(mine(c, t))) return t;
  throw new Error('condition never held');
}

describe('LiveClient', () => {
  it('own turn moves the predicted chomper before any snapshot, and is sent once taken', () => {
    const c = client(corridor());
    const start = mine(c, 300).x;
    expect(start).toBeGreaterThan(3);
    c.turn('left');
    expect(mine(c, 800).x).toBeLessThan(start);
    const sent = c.takeOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ n: 1, d: 'left' });
    expect(c.takeOutbox()).toEqual([]);
  });

  it('sends the junction where its own chomper turned', () => {
    const c = client(corridor(true));
    mine(c, 100);
    c.turn('down');
    expect(c.takeOutbox()).toEqual([]);
    play(c, 116, 2000, (me) => me.y > 1.2);
    expect(c.takeOutbox()).toEqual([{ n: 1, d: 'down', at: [10, 1] }]);
    expect(mine(c, 2100).x).toBe(10);
  });

  it('a swipe still waiting for its junction survives a snapshot', () => {
    const m = corridor(true);
    const server = new LiveRound({ layout: m, startedAt: 0 });
    server.join('Wren');
    const c = client(m);
    mine(c, 100);
    c.turn('down');
    server.advance(300);
    c.onSnapshot(server.snapshot(0));
    play(c, 300, 2000, (me) => me.y > 1.2);
    expect(mine(c, 2100).x).toBe(10);
  });

  it('a turn the server has not applied yet is replayed after a snapshot', () => {
    const m = corridor(true);
    const server = new LiveRound({ layout: m, startedAt: 0 });
    server.join('Wren');
    const c = client(m);
    mine(c, 0);
    c.turn('down');
    const t = play(c, 16, 2000, (me) => me.y > 1.3);
    // The server hasn't heard (no ack): it is still heading right on row 1.
    server.advance(t - 60);
    c.onSnapshot(server.snapshot(0));
    const me = mine(c, t + 16);
    expect(me.x).toBeCloseTo(10, 5);
    expect(me.dir).toBe('down');
  });

  it('follows the server: small differences are blended, big ones snap', () => {
    const m = corridor();
    const server = new LiveRound({ layout: m, startedAt: 0 });
    server.join('Wren');
    const c = client(m);
    c.frame(0);
    server.advance(500);
    const s = server.snapshot(0);
    const before = mine(c, 500).x;
    // Pretend the server has us 0.3 tiles further on.
    const off = structuredClone(s);
    off.chompers[0]!.walker.prog = Math.min(0.99, off.chompers[0]!.walker.prog + 0.3);
    c.onSnapshot(off);
    const just = mine(c, 500).x;
    expect(just).toBeCloseTo(before, 1);
    const later = mine(c, 700).x;
    server.advance(700);
    const truth = server.snapshot(0).chompers[0]!.x + 0.3;
    // Within one sim step of travel (7.8 tiles/s × STEP_MS): client and server slice time apart.
    expect(Math.abs(later - truth)).toBeLessThan(0.14);
    // Three tiles off: snap at once.
    const far = structuredClone(server.snapshot(0));
    far.t = 700;
    far.chompers[0]!.walker.tile = [far.chompers[0]!.walker.tile[0] + 3, 1];
    c.onSnapshot(far);
    expect(Math.abs(mine(c, 700).x - (later + 3))).toBeLessThan(SNAP_TILES);
    expect(mine(c, 700).x).toBeGreaterThan(later + 2);
  });

  it('refines the clock offset from later snapshots (keeps the largest)', () => {
    const m = corridor();
    const c = client(m);
    const empty = (t: number): LiveSnapshot => ({
      t,
      layoutId: m.id,
      chompers: [],
      taken: [],
      events: [],
      acks: {},
    });
    expect(c.frame(1000).t).toBe(1000);
    c.onSnapshot(empty(1000), 40);
    expect(c.frame(1000).t).toBe(1040);
    c.onSnapshot(empty(1050), 10);
    expect(c.frame(1000).t).toBe(1040);
  });

  it('a phone joining mid-round starts with every pellet already taken', () => {
    const c = client(corridor(), 'p1', [5, 6, 7]);
    const f = c.frame(0);
    expect([5, 6, 7].every((i) => f.taken.has(i))).toBe(true);
  });

  it('others are drawn between snapshots, INTERP_MS behind', () => {
    const m = corridor();
    const c = client(m);
    const other = (x: number): LiveChomper => ({
      id: 'p2',
      name: 'Rook',
      seat: 1,
      x,
      y: 1,
      dir: 'right',
      score: 0,
      power: null,
      dyingUntil: 0,
      shieldUntil: 0,
      walker: { tile: [Math.floor(x), 1], dir: 'right', next: null, prog: x % 1 },
    });
    const snap = (t: number, x: number): LiveSnapshot => ({
      t,
      layoutId: m.id,
      chompers: [other(x)],
      taken: [],
      events: [],
      acks: {},
    });
    c.onSnapshot(snap(1000, 5));
    c.onSnapshot(snap(1050, 5.4));
    expect(INTERP_MS).toBe(100);
    expect(mine(c, 1125, 'p2').x).toBeCloseTo(5.2, 5);
    expect(mine(c, 1300, 'p2').x).toBeCloseTo(5.4, 5);
  });

  it('a jump of more than a tile between snapshots is drawn as a teleport', () => {
    const m = corridor();
    const c = client(m);
    const at = (t: number, x: number): LiveSnapshot => ({
      t,
      layoutId: m.id,
      chompers: [
        {
          id: 'p2',
          name: 'Rook',
          seat: 1,
          x,
          y: 1,
          dir: 'left',
          score: 0,
          power: null,
          dyingUntil: 0,
          shieldUntil: 0,
          walker: { tile: [x, 1], dir: 'left', next: null, prog: 0 },
        },
      ],
      taken: [],
      events: [],
      acks: {},
    });
    c.onSnapshot(at(1000, 12));
    c.onSnapshot(at(1050, 24));
    expect(mine(c, 1125, 'p2').x).toBe(24);
  });

  it('contact events come out once', () => {
    const m = corridor();
    const c = client(m);
    c.onSnapshot({
      t: 100,
      layoutId: m.id,
      chompers: [],
      taken: [3],
      events: [{ kind: 'eat', by: 'p2', eaten: 'p1', cost: 200, gain: 400 }],
      acks: {},
    });
    const f = c.frame(150);
    expect(f.events).toHaveLength(1);
    expect(f.taken.has(3)).toBe(true);
    expect(c.frame(160).events).toHaveLength(0);
  });

  it('on the TV (nobody) every chomper is drawn from the snapshots', () => {
    const m = corridor();
    const c = new LiveClient({ me: null, layout: m, startedAt: 0, offsetMs: 0 });
    c.onSnapshot({
      t: 1000,
      layoutId: m.id,
      chompers: [own(4, 0)],
      taken: [],
      events: [],
      acks: {},
    });
    const f = c.frame(1000 + INTERP_MS);
    expect(f.chompers.map((x) => x.id)).toEqual(['p1']);
    expect(f.chompers[0]!.x).toBe(4);
  });

  it('moves to the next maze when the server does', () => {
    const a = corridor();
    const b = { ...corridor(true), id: 'test-branch' };
    const c = new LiveClient({
      me: 'p1',
      layouts: [a, b],
      maze: 0,
      startedAt: 0,
      offsetMs: 0,
      taken: [3],
    });
    expect(c.frame(0).maze).toBe(0);
    c.onSnapshot({
      t: 1000,
      layoutId: b.id,
      maze: 1,
      chompers: [own(2, 1)],
      taken: [],
      events: [],
      acks: {},
    });
    const f = c.frame(1000);
    expect(f.maze).toBe(1);
    expect(f.taken.has(3)).toBe(false);
    expect(f.chompers[0]!.x).toBeCloseTo(2, 5);
  });

  it('a power spot the server puts back is drawn again, holding what the server says', () => {
    const m = withSpot();
    const c = client(m);
    const i = 0;
    c.onSnapshot({ t: 100, layoutId: m.id, chompers: [], taken: [i], events: [], acks: {} });
    expect(c.frame(100).taken.has(i)).toBe(true);
    c.onSnapshot({
      t: 200,
      layoutId: m.id,
      chompers: [],
      taken: [],
      events: [],
      acks: {},
      spots: [{ i, kind: 'dash', up: true }],
    });
    const f = c.frame(200);
    expect(f.taken.has(i)).toBe(false);
    expect(f.spots).toEqual([{ i, kind: 'dash', up: true }]);
  });

  it('ghosts are drawn between snapshots, INTERP_MS behind', () => {
    const m = corridor();
    const c = client(m);
    const g = (x: number) => [
      { id: 0, pos: [x, 1] as [number, number], dir: 'right' as const, mode: 'chase' as const },
    ];
    c.onSnapshot({
      t: 1000,
      layoutId: m.id,
      chompers: [],
      taken: [],
      events: [],
      acks: {},
      ghosts: g(5),
    });
    c.onSnapshot({
      t: 1100,
      layoutId: m.id,
      chompers: [],
      taken: [],
      events: [],
      acks: {},
      ghosts: g(6),
    });
    expect(c.frame(1100 + INTERP_MS / 2).ghosts[0]!.pos[0]).toBeCloseTo(5.5, 5);
  });

  it('a freeze from the server slows the predicted chomper', () => {
    const m = corridor();
    const free = client(m);
    const cold = client(m);
    free.onSnapshot({
      t: 0,
      layoutId: m.id,
      chompers: [own(2, 0)],
      taken: [],
      events: [],
      acks: {},
    });
    cold.onSnapshot({
      t: 0,
      layoutId: m.id,
      chompers: [{ ...own(2, 0), frozenUntil: 5000 }],
      taken: [],
      events: [],
      acks: {},
    });
    expect(mine(cold, 1000).x - 2).toBeLessThan((mine(free, 1000).x - 2) * 0.8);
  });

  it('notices come out once', () => {
    const m = corridor();
    const c = client(m);
    c.onSnapshot({
      t: 100,
      layoutId: m.id,
      chompers: [],
      taken: [],
      events: [],
      acks: {},
      notices: [{ kind: 'cleared', maze: 0 }],
    });
    expect(c.frame(100).notices).toHaveLength(1);
    expect(c.frame(110).notices).toHaveLength(0);
  });
});

/** Your own chomper (p1) as the server sends it, standing on (x, 1) heading right. */
function own(x: number, t: number): LiveChomper {
  return {
    id: 'p1',
    name: 'Wren',
    seat: 0,
    x,
    y: 1,
    dir: 'right',
    score: 0,
    power: null,
    dyingUntil: 0,
    shieldUntil: t,
    walker: { tile: [x, 1], dir: 'right', next: null, prog: 0 },
  };
}

/** The corridor with one power spot, at the left end of the top row (pellet index 0). */
function withSpot(): MazeLayout {
  const m = corridor();
  const rows = [...m.rows];
  rows[1] = `#o${rows[1]!.slice(2)}`;
  return { ...m, id: 'test-spot', rows, powers: [[1, 1]] };
}
