import { describe, expect, it } from 'vitest';
import { AHEAD_TILES, GhostSim, aimTile } from './ghosts';
import type { Aim, GhostEvent, GhostInput, GhostView } from './ghosts';
import { DIRS, DIR_ORDER, MAZE_LAYOUTS, houseTiles, isWall } from './layouts';
import { speeds } from './powers';
import type { Dir } from './walker';

const m = MAZE_LAYOUTS[0]!;
const house = houseTiles(m);

// Wren and Rook wander around the maze; the server records their tiles every 2 s.
const aims: Aim[] = [
  { atMs: 0, tiles: { wren: [13, 18], rook: [1, 1] } },
  { atMs: 2000, tiles: { wren: [10, 18], rook: [4, 1] } },
  { atMs: 4000, tiles: { wren: [8, 16], rook: [6, 3] } },
  { atMs: 6000, tiles: { wren: [4, 16], rook: [6, 7] } },
  { atMs: 8000, tiles: { wren: [1, 19], rook: [5, 10] } },
  { atMs: 10000, tiles: { wren: [3, 22], rook: [5, 14] } },
  { atMs: 12000, tiles: { wren: [8, 22], rook: [5, 16] } },
  { atMs: 14000, tiles: { wren: [12, 20], rook: [9, 16] } },
  { atMs: 16000, tiles: { wren: [12, 16], rook: [12, 18] } },
  { atMs: 18000, tiles: { wren: [16, 16], rook: [14, 22] } },
  { atMs: 20000, tiles: { wren: [21, 16], rook: [20, 22] } },
  { atMs: 24000, tiles: { wren: [25, 18], rook: [25, 19] } },
  { atMs: 30000, tiles: { wren: [21, 7], rook: [18, 4] } },
  { atMs: 36000, tiles: { wren: [13, 4], rook: [8, 4] } },
];

const events: GhostEvent[] = [
  { atMs: 9001, kind: 'eaten', ghost: 0 },
  { atMs: 12500, kind: 'jinx', target: 'rook', untilMs: 20500 },
  { atMs: 15000, kind: 'fright', untilMs: 21000 },
  { atMs: 25000, kind: 'eaten', ghost: 2 },
];

function run(chunk: number, endMs: number, input: GhostInput, seed = 42): GhostSim {
  const sim = new GhostSim(m, seed, 2);
  for (let t = 0; t < endMs; t += chunk) sim.stepTo(Math.min(t + chunk, endMs), input);
  sim.stepTo(endMs, input);
  return sim;
}

function onOpenTiles(gs: GhostView[]) {
  for (const g of gs) {
    const x = Math.round(g.pos[0]);
    const y = Math.round(g.pos[1]);
    expect(isWall(m, x, y)).toBe(false);
  }
}

describe('GhostSim', () => {
  it('starts with four ghosts in the house', () => {
    const sim = new GhostSim(m, 1, 1);
    const gs = sim.ghosts();
    expect(gs.map((g) => g.id)).toEqual([0, 1, 2, 3]);
    for (const g of gs) {
      expect(g.mode).toBe('house');
      expect(house.has(`${g.pos[0]},${g.pos[1]}`)).toBe(true);
    }
  });

  for (const frightFor of [undefined, 'wren']) {
    it(`gives the same ghosts however time is chunked (frightFor ${frightFor ?? 'none'})`, () => {
      const input: GhostInput = frightFor ? { aims, events, frightFor } : { aims, events };
      const endMs = 45_000;
      const a = run(16, endMs, input);
      const b = run(250, endMs, input);
      const c = run(endMs, endMs, input);
      const d = run(997, endMs, input);
      expect(b.ghosts()).toEqual(a.ghosts());
      expect(c.ghosts()).toEqual(a.ghosts());
      expect(d.ghosts()).toEqual(a.ghosts());
      expect(c.checkpoint()).toEqual(a.checkpoint());
      onOpenTiles(a.ghosts());
    });
  }

  it('matches at every moment, not only at the end', () => {
    const input: GhostInput = { aims, events, frightFor: 'wren' };
    const a = new GhostSim(m, 9, 1);
    const b = new GhostSim(m, 9, 1);
    for (let t = 0; t <= 40_000; t += 100) {
      a.stepTo(t, input);
      if (t % 1300 === 0) b.stepTo(t, input);
      if (t % 1300 === 0) expect(b.ghosts()).toEqual(a.ghosts());
      onOpenTiles(a.ghosts());
    }
  });

  it('differs for a different seed', () => {
    const input: GhostInput = { aims, events };
    const a = run(1000, 40_000, input, 1);
    const b = run(1000, 40_000, input, 2);
    expect(b.ghosts()).not.toEqual(a.ghosts());
  });

  it('re-simulates from a checkpoint when an event arrives late', () => {
    const early: GhostInput = { aims: aims.slice(0, 4), events: [] };
    const late: GhostInput = {
      aims,
      events: [{ atMs: 7000, kind: 'jinx', target: 'wren', untilMs: 15000 }],
    };
    const a = new GhostSim(m, 5, 1);
    a.stepTo(6500, early);
    const cp = a.checkpoint();
    a.stepTo(11_000, early);
    a.restore(JSON.parse(JSON.stringify(cp)));
    a.stepTo(20_000, late);

    const fresh = new GhostSim(m, 5, 1);
    fresh.stepTo(20_000, late);
    expect(a.ghosts()).toEqual(fresh.ghosts());
    expect(a.checkpoint()).toEqual(fresh.checkpoint());
  });

  it('a restored copy keeps going like the original', () => {
    const input: GhostInput = { aims, events };
    const a = new GhostSim(m, 3, 1);
    a.stepTo(13_000, input);
    const b = new GhostSim(m, 999, 4);
    b.restore(a.checkpoint());
    a.stepTo(30_000, input);
    b.stepTo(30_000, input);
    expect(b.ghosts()).toEqual(a.ghosts());
  });

  it('sends an eaten ghost home as eyes, then back out', () => {
    const input: GhostInput = { aims, events: [{ atMs: 9001, kind: 'eaten', ghost: 0 }] };
    const sim = new GhostSim(m, 42, 1);
    sim.stepTo(9000, input);
    expect(['chase', 'scatter']).toContain(sim.ghosts()[0]!.mode);
    sim.stepTo(9100, input);
    expect(sim.ghosts()[0]!.mode).toBe('eyes');
    let home = -1;
    let out = -1;
    for (let t = 9100; t < 30_000 && out < 0; t += 50) {
      sim.stepTo(t, input);
      const g = sim.ghosts()[0]!;
      if (home < 0 && g.mode === 'house') {
        home = t;
        expect(g.pos).toEqual(m.house);
      }
      if (home >= 0 && (g.mode === 'chase' || g.mode === 'scatter')) out = t;
    }
    expect(home).toBeGreaterThan(9100);
    expect(home).toBeLessThan(15_000);
    expect(out).toBeGreaterThan(home);
    const g = sim.ghosts()[0]!;
    expect(house.has(`${Math.round(g.pos[0])},${Math.round(g.pos[1])}`)).toBe(false);
  });

  it('turns ghosts frightened only for a local player', () => {
    const ev: GhostEvent[] = [{ atMs: 12_000, kind: 'fright', untilMs: 16_000 }];
    const local = new GhostSim(m, 42, 1);
    local.stepTo(13_000, { aims, events: ev, frightFor: 'wren' });
    const out = local.ghosts().filter((g) => g.mode !== 'house');
    expect(out.length).toBeGreaterThan(0);
    for (const g of out) expect(g.mode).toBe('fright');
    local.stepTo(16_100, { aims, events: ev, frightFor: 'wren' });
    for (const g of local.ghosts()) expect(g.mode).not.toBe('fright');

    const shared = new GhostSim(m, 42, 1);
    shared.stepTo(13_000, { aims, events: ev });
    for (const g of shared.ghosts()) expect(g.mode).not.toBe('fright');
  });

  it('a jinx ghost steers to its target and vanishes on time', () => {
    // Rook sits still in the bottom-left corner.
    const still: Aim[] = [{ atMs: 0, tiles: { wren: [25, 1], rook: [1, 22] } }];
    const ev: GhostEvent[] = [{ atMs: 3000, kind: 'jinx', target: 'rook', untilMs: 14_000 }];
    const input: GhostInput = { aims: still, events: ev };
    const sim = new GhostSim(m, 8, 1);
    sim.stepTo(2900, input);
    expect(sim.ghosts().find((g) => g.id === 4)).toBeUndefined();
    sim.stepTo(3100, input);
    const j = sim.ghosts().find((g) => g.id === 4);
    expect(j).toMatchObject({ jinxTarget: 'rook' });
    let best = Infinity;
    for (let t = 3100; t < 13_900; t += 50) {
      sim.stepTo(t, input);
      const g = sim.ghosts().find((x) => x.id === 4)!;
      expect(g).toBeDefined();
      best = Math.min(best, Math.abs(g.pos[0] - 1) + Math.abs(g.pos[1] - 22));
    }
    expect(best).toBeLessThan(0.5);
    sim.stepTo(14_100, input);
    expect(sim.ghosts().find((g) => g.id === 4)).toBeUndefined();
    expect(sim.ghosts()).toHaveLength(4);
  });

  it('alternates a short scatter and a long chase: 5 s / 20 s', () => {
    const sim = new GhostSim(m, 1, 1);
    const input: GhostInput = { aims, events: [] };
    sim.stepTo(4000, input);
    expect(sim.ghosts()[0]!.mode).toBe('scatter');
    sim.stepTo(6000, input);
    expect(sim.ghosts()[0]!.mode).toBe('chase');
    sim.stepTo(24_000, input);
    expect(sim.ghosts()[0]!.mode).toBe('chase');
    sim.stepTo(25_000 + 1000, input);
    expect(sim.ghosts()[0]!.mode).toBe('scatter');
  });

  it('runs on every layout', () => {
    for (const layout of MAZE_LAYOUTS) {
      const s = layout.starts;
      const input: GhostInput = {
        aims: [{ atMs: 0, tiles: { a: [s[0]![0], s[0]![1]], b: [s[1]![0], s[1]![1]] } }],
        events: [{ atMs: 2000, kind: 'jinx', target: 'a', untilMs: 30_000 }],
      };
      const sim = new GhostSim(layout, 11, 3);
      for (let t = 0; t <= 30_000; t += 500) {
        sim.stepTo(t, input);
        for (const g of sim.ghosts())
          expect(isWall(layout, Math.round(g.pos[0]), Math.round(g.pos[1]))).toBe(false);
      }
      // By now every ghost has left the house.
      expect(sim.ghosts().filter((g) => g.mode === 'house')).toHaveLength(0);
    }
  });
});

describe('ghosts chase where you are', () => {
  // A chomper does laps of a loop of corridors in the first maze: it runs for 2 s at full
  // speed, then stops for 1 s (as a player does at a wall or a fork), and so on.
  const corners: [number, number][] = [
    [5, 4],
    [21, 4],
    [21, 16],
    [20, 16],
    [20, 22],
    [6, 22],
    [6, 16],
    [5, 16],
  ];
  const path: { x: number; y: number; d: Dir }[] = [];
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % corners.length]!;
    const d: Dir = x1 > x0 ? 'right' : x1 < x0 ? 'left' : y1 > y0 ? 'down' : 'up';
    for (let x = x0, y = y0; x !== x1 || y !== y1; x += DIRS[d][0], y += DIRS[d][1])
      path.push({ x, y, d });
  });
  const RUN_MS = 2000;
  const STOP_MS = 1000;
  const speed = speeds(1).chomper;
  /** Where the chomper is at round ms `t` (x, y, heading). */
  const at = (t: number): [number, number, Dir] => {
    const k = Math.floor(t / (RUN_MS + STOP_MS));
    const ran = k * RUN_MS + Math.min(RUN_MS, t - k * (RUN_MS + STOP_MS));
    const s = ((speed * ran) / 1000) % path.length;
    const a = path[Math.floor(s)]!;
    const f = s - Math.floor(s);
    return [a.x + DIRS[a.d][0] * f, a.y + DIRS[a.d][1] * f, a.d];
  };
  const END = 150_000;

  /**
   * Ghost 0 (the direct chaser) on level 1, fed the chomper's aim every `every` ms, with its
   * heading or without: its average distance to the chomper while chasing, the share of that
   * time it is within 3 tiles, and how long each chase phase takes to reach the chomper (the
   * whole phase if it never does). Also checks the ahead ghost's target as it goes.
   */
  function chase(every: number, heading: boolean) {
    const input: GhostInput = { aims: [], events: [], frightFor: 'me' };
    const sim = new GhostSim(m, 5, 1);
    let sum = 0;
    let n = 0;
    let near = 0;
    let aheadN = 0;
    let ahead = 0;
    const reach: number[] = [];
    let phaseAt = -1;
    let reached = false;
    for (let t = 0; t <= END; t += 50) {
      if (t % every === 0) {
        const tile = aimTile(m, at(t));
        input.aims.push({ atMs: t, tiles: { me: heading ? tile : [tile[0], tile[1]] } });
      }
      sim.stepTo(t, input);
      const [g0, g1] = sim.ghosts();
      if (g0!.mode !== 'chase') {
        if (phaseAt >= 0 && !reached) reach.push(t - phaseAt);
        phaseAt = -1;
        continue;
      }
      if (phaseAt < 0) {
        phaseAt = t;
        reached = false;
      }
      const [x, y, d] = at(t);
      const dist = Math.hypot(g0!.pos[0] - x, g0!.pos[1] - y);
      sum += dist;
      n++;
      if (dist < 3) near++;
      if (dist < 1 && !reached) {
        reached = true;
        reach.push(t - phaseAt);
      }
      if (heading && g1!.mode === 'chase') {
        // The ahead ghost aims up to AHEAD_TILES on along the latest aim's heading (a wall
        // stops it short), so its target is in front of the chomper.
        const aim = input.aims[input.aims.length - 1]!.tiles.me!;
        const target = sim.target(1, input)!;
        const [hx, hy] = DIRS[DIR_ORDER[aim[2]!]!];
        const along = (target[0] - aim[0]) * hx + (target[1] - aim[1]) * hy;
        expect(target).toEqual([aim[0] + hx * along, aim[1] + hy * along]);
        expect(along).toBeLessThanOrEqual(AHEAD_TILES);
        expect(isWall(m, target[0], target[1])).toBe(false);
        aheadN++;
        if ((target[0] - x) * DIRS[d][0] + (target[1] - y) * DIRS[d][1] > 0) ahead++;
      }
    }
    const reachMs = reach.reduce((a, b) => a + b, 0) / reach.length;
    return { avg: sum / n, near: near / n, reachMs, n, ahead: ahead / Math.max(1, aheadN) };
  }

  it('the loop is open all the way round', () => {
    for (const p of path) expect(isWall(m, p.x, p.y)).toBe(false);
    expect(path.length).toBeGreaterThan(40);
  });

  it('the direct chaser closes in with fresh aims; with 2-s-old ones it trails', () => {
    const fresh = chase(150, true);
    const stale = chase(2000, false);
    const fmt = (r: typeof fresh) =>
      `average ${r.avg.toFixed(2)} tiles, within 3 tiles ${(r.near * 100).toFixed(0)}% ` +
      `of the time, reaches you ${(r.reachMs / 1000).toFixed(1)} s into a chase`;
    console.log(`direct chaser in chase: fresh aims ${fmt(fresh)}; 2-s-old aims ${fmt(stale)}`);
    expect(fresh.n).toBeGreaterThan(1000);
    // It gets to you in well under half the time, and stays close far more of it.
    expect(fresh.reachMs).toBeLessThan(stale.reachMs / 2);
    expect(fresh.near).toBeGreaterThan(stale.near * 5);
    expect(fresh.avg).toBeLessThan(stale.avg * 0.75);
    // The ahead ghost's target is in front of the chomper (nearly always: a turn can pass it).
    expect(fresh.ahead).toBeGreaterThan(0.8);
  });
});
