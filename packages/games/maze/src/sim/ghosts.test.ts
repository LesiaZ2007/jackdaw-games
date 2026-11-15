import { describe, expect, it } from 'vitest';
import { GhostSim } from './ghosts';
import type { Aim, GhostEvent, GhostInput, GhostView } from './ghosts';
import { MAZE_LAYOUTS, houseTiles, isWall } from './layouts';

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

  it('alternates scatter and chase on a 6 s / 21 s cycle', () => {
    const sim = new GhostSim(m, 1, 1);
    const input: GhostInput = { aims, events: [] };
    sim.stepTo(5000, input);
    expect(sim.ghosts()[0]!.mode).toBe('scatter');
    sim.stepTo(7000, input);
    expect(sim.ghosts()[0]!.mode).toBe('chase');
    sim.stepTo(27_000 + 1000, input);
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
