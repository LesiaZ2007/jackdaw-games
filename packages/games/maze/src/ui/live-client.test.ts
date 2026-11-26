import { describe, expect, it } from 'vitest';
import type { MazeLayout } from '../sim/layouts';
import { LiveRound, type LiveChomper, type LiveSnapshot } from '../live';
import { INTERP_MS, LiveClient, SNAP_TILES } from './live-client';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;
function corridor(): MazeLayout {
  const rows = [WALL, row('.'.repeat(25)), row('.'), row('.'), row('.')];
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
const client = (m: MazeLayout, me = 'p1') =>
  new LiveClient({ me, layout: m, startedAt: 0, offsetMs: 0 });
const mine = (c: LiveClient, now: number, id = 'p1') =>
  c.frame(now).chompers.find((x) => x.id === id)!;

describe('LiveClient', () => {
  it('own turn moves the predicted chomper before any snapshot', () => {
    const c = client(corridor());
    c.frame(0);
    const start = mine(c, 300).x;
    expect(start).toBeGreaterThan(3);
    expect(c.turn('left')).toBe(1);
    expect(c.turn('left')).toBe(2);
    expect(mine(c, 800).x).toBeLessThan(start);
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
    // Two tiles off: snap at once.
    const far = structuredClone(server.snapshot(0));
    far.t = 700;
    far.chompers[0]!.walker.tile = [far.chompers[0]!.walker.tile[0] + 3, 1];
    c.onSnapshot(far);
    expect(Math.abs(mine(c, 700).x - (later + 3))).toBeLessThan(SNAP_TILES);
    expect(mine(c, 700).x).toBeGreaterThan(later + 2);
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
    c.onSnapshot(snap(1050, 6));
    expect(INTERP_MS).toBe(100);
    expect(mine(c, 1125, 'p2').x).toBeCloseTo(5.5, 5);
    expect(mine(c, 1300, 'p2').x).toBeCloseTo(6, 5);
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
});
