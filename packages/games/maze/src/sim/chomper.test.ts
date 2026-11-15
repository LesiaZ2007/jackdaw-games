import { describe, expect, it } from 'vitest';
import {
  ChomperSim,
  DYING_MS,
  FRUIT_EVERY,
  FRUIT_MS,
  FRUIT_REACH,
  SPAWN_SHIELD_MS,
  spawnShield,
} from './chomper';
import type { ChomperEvent } from './chomper';
import type { GhostView } from './ghosts';
import type { MazeLayout } from './layouts';
import { POINTS, powerMs } from './powers';
import type { PowerKind } from './powers';
import { posOf } from './walker';
import type { Dir } from './walker';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;

/** A test maze: a long corridor on row 1 with power spots at x = 6 and 20, and a dead end at x = 1. */
function layout(rows: string[], fruit: [number, number] = [10, 1]): MazeLayout {
  const all = [WALL, ...rows];
  while (all.length < 24) all.push(WALL);
  return {
    id: 'test',
    size: 'Medium',
    w: 27,
    h: 24,
    rows: all,
    starts: [[1, 1, 'right']],
    house: [13, 12],
    exit: [13, 7],
    fruit,
    powers: [],
  };
}

const corridor = layout([row('.....o.............o.....'), row('.'), row('.'), row('.')]);
// Pellet indexes: row 1 x → x - 1 (0..24), then (1,2) = 25, (1,3) = 26, (1,4) = 27.

class Ghosts {
  list: GhostView[] = [];
  ghosts(): GhostView[] {
    return this.list;
  }
}

const ghost = (
  id: number,
  pos: [number, number],
  mode: GhostView['mode'] = 'chase',
): GhostView => ({
  id,
  pos,
  dir: 'left',
  mode,
});

interface Setup {
  m?: MazeLayout;
  start: [number, number, Dir];
  powers?: PowerKind[];
  taken?: Uint8Array;
  fruit?: boolean;
  id?: string;
}

function setup(s: Setup) {
  const g = new Ghosts();
  const sim = new ChomperSim({
    m: s.m ?? corridor,
    start: s.start,
    level: 1,
    powers: s.powers ?? ['hunt'],
    ghosts: g,
    ...(s.taken ? { taken: s.taken } : {}),
    ...(s.fruit === undefined ? {} : { fruit: s.fruit }),
    ...(s.id ? { id: s.id } : {}),
  });
  let t = 0;
  const events: ChomperEvent[] = [];
  const step = (dt = 16) => {
    t += dt;
    const ev = sim.step(dt, t);
    events.push(...ev);
    return ev;
  };
  const until = (pred: () => boolean, max = 2000) => {
    for (let i = 0; i < max && !pred(); i++) step();
    expect(pred()).toBe(true);
  };
  const at = (x: number, y: number) => () => {
    const w = sim.state().walker;
    return w.tile[0] === x && w.tile[1] === y;
  };
  return { sim, g, step, until, at, events, now: () => t };
}

describe('ChomperSim', () => {
  it('eats pellets in the order a scripted path reaches them', () => {
    const { sim, until, at, events } = setup({ start: [1, 3, 'up'] });
    sim.input('right');
    until(at(6, 1));
    expect(events.filter((e) => e.kind === 'pellet').map((e) => (e as { i: number }).i)).toEqual([
      26, 25, 0, 1, 2, 3, 4,
    ]);
    expect(events.at(-1)).toEqual({ kind: 'power', i: 5, power: 'hunt' });
    expect(sim.state().eaten[26]).toBe(1);
    expect(sim.state().eaten[6]).toBe(0);
  });

  it('starts a power-up on a power spot', () => {
    const { sim, step, now } = setup({ start: [5, 1, 'right'], powers: ['dash'] });
    let got: ChomperEvent[] = [];
    while (!got.some((e) => e.kind === 'power')) got = step();
    expect(got).toContainEqual({ kind: 'power', i: 5, power: 'dash' });
    expect(sim.state().power).toEqual({ kind: 'dash', untilMs: now() + powerMs('dash', 1) });
    // It runs out on time.
    step(powerMs('dash', 1));
    expect(sim.state().power).toBeNull();
  });

  it('gives each power spot a kind from the enabled list', () => {
    const { sim } = setup({ start: [1, 1, 'right'], powers: ['dash', 'magnet'] });
    expect(sim.powerAt(5)).toBe('dash');
    expect(sim.powerAt(19)).toBe('magnet');
    expect(sim.powerAt(0)).toBeNull();
  });

  it('leaves attack power-ups to the server: an event, no running power', () => {
    const { sim, until, at, events } = setup({ start: [5, 1, 'right'], powers: ['freeze'] });
    until(at(6, 1));
    expect(events).toContainEqual({ kind: 'power', i: 5, power: 'freeze' });
    expect(sim.state().power).toBeNull();
  });

  it('reports a catch once, then stays dying until the caller respawns it', () => {
    // (1,4) is a dead end, so the chomper sits still with a ghost on top of it.
    const { sim, g, step, now, events } = setup({ start: [1, 4, 'down'] });
    g.list = [ghost(0, [1, 4])];
    step();
    const caughtAt = now();
    for (let i = 0; i < 30; i++) step();
    expect(events.filter((e) => e.kind === 'caught')).toEqual([{ kind: 'caught', ghost: 0 }]);
    expect(sim.state().dyingUntil).toBe(caughtAt + DYING_MS);
    sim.respawn(now());
    expect(sim.state().dyingUntil).toBe(0);
    expect(sim.state().walker.tile).toEqual([1, 4]);
  });

  it('ignores ghosts in the house, eyes, and jinx ghosts sent after someone else', () => {
    const { g, step, events } = setup({ start: [1, 4, 'down'], id: 'wren' });
    g.list = [ghost(0, [1, 4], 'house'), ghost(1, [1, 4], 'eyes')];
    g.list.push({ ...ghost(4, [1, 4]), jinxTarget: 'rook' });
    step();
    expect(events).toEqual([{ kind: 'pellet', i: 27 }]);
    for (let i = 0; i < 10; i++) expect(step()).toEqual([]);
    g.list = [{ ...ghost(5, [1, 4]), jinxTarget: 'wren' }];
    expect(step()).toEqual([{ kind: 'caught', ghost: 5 }]);
  });

  it('passes through ghosts with Phase', () => {
    const { sim, g, step, until, at, events } = setup({
      start: [5, 1, 'right'],
      powers: ['phase'],
    });
    until(at(6, 1));
    for (let i = 0; i < 60; i++) {
      step();
      g.list = [ghost(0, posOf(sim.state().walker))];
    }
    expect(sim.state().power?.kind).toBe('phase');
    expect(events.some((e) => e.kind === 'caught')).toBe(false);
  });

  it('eats ghosts during its own Hunt, with a growing combo', () => {
    const { sim, g, step, until, at, events } = setup({ start: [5, 1, 'right'], id: 'wren' });
    until(at(6, 1));
    const p = posOf(sim.state().walker);
    // Shared maze: the ghosts don't flee, but Hunt is personal.
    g.list = [0, 1, 2, 3].map((id) => ghost(id, p));
    const ev = step();
    const eats = ev.filter((e) => e.kind === 'ghost');
    expect(eats).toEqual([0, 1, 2, 3].map((id, combo) => ({ kind: 'ghost', ghost: id, combo })));
    expect(eats.map((e) => POINTS.ghost[(e as { combo: number }).combo])).toEqual([
      200, 400, 800, 1600,
    ]);
    // The ghosts haven't turned to eyes yet (the caller sends that event); no double eat.
    for (const x of g.list) x.pos = posOf(sim.state().walker);
    step();
    expect(events.filter((e) => e.kind === 'ghost')).toHaveLength(4);
    // A fifth ghost stays at the top combo.
    g.list = [{ ...ghost(4, posOf(sim.state().walker)), jinxTarget: 'wren' }];
    expect(step()).toEqual([{ kind: 'ghost', ghost: 4, combo: 3 }]);
  });

  it('eats a frightened ghost without Hunt (Solo and Race)', () => {
    const { g, step } = setup({ start: [1, 4, 'down'] });
    g.list = [ghost(2, [1, 4], 'fright')];
    expect(step()).toEqual([
      { kind: 'pellet', i: 27 },
      { kind: 'ghost', ghost: 2, combo: 0 },
    ]);
  });

  it('starts the combo again once the fright is over, and after a respawn', () => {
    const { sim, g, step, now } = setup({ start: [1, 4, 'down'] });
    g.list = [0, 1, 2, 3].map((id) => ghost(id, [1, 4], 'fright'));
    const eats = step().filter((e) => e.kind === 'ghost');
    expect(eats.map((e) => POINTS.ghost[(e as { combo: number }).combo])).toEqual([
      200, 400, 800, 1600,
    ]);
    // The fright ends; a later one starts at 200 again.
    g.list = [];
    step();
    g.list = [ghost(4, [1, 4], 'fright')];
    expect(step()).toEqual([{ kind: 'ghost', ghost: 4, combo: 0 }]);
    g.list = [ghost(4, [1, 4], 'fright'), ghost(5, [1, 4], 'fright')];
    expect(step()).toEqual([{ kind: 'ghost', ghost: 5, combo: 1 }]);
    // A respawn starts it again too, even with the fright still on.
    sim.respawn(now());
    g.list = [ghost(4, [1, 4], 'fright'), ghost(5, [1, 4], 'fright'), ghost(6, [1, 4], 'fright')];
    expect(step().filter((e) => e.kind === 'ghost')[0]).toMatchObject({ combo: 0 });
  });

  it('pulls in pellets within 2.8 tiles with Magnet, but not power spots', () => {
    const { sim, step, until, at } = setup({ start: [17, 1, 'left'], powers: ['magnet'] });
    sim.input('right');
    until(at(20, 1));
    step();
    const s = sim.state();
    expect(s.power?.kind).toBe('magnet');
    const [px] = posOf(s.walker);
    for (let x = 1; x <= 25; x++) {
      if (x === 6) continue;
      const near = Math.abs(x - px) < 2.8;
      const passed = x >= 17 && x <= Math.floor(px);
      expect([x, s.eaten[x - 1]]).toEqual([x, near || passed ? 1 : 0]);
    }
  });

  it('crawls while frozen', () => {
    const a = setup({ start: [1, 1, 'right'] });
    const b = setup({ start: [1, 1, 'right'] });
    b.sim.freeze(10_000);
    for (let i = 0; i < 25; i++) {
      a.step(20);
      b.step(20);
    }
    expect(posOf(a.sim.state().walker)[0]).toBeCloseTo(1 + 7.8 * 0.5);
    expect(posOf(b.sim.state().walker)[0]).toBeCloseTo(1 + 7.8 * 0.5 * 0.3);
  });

  it('reports cleared when the last pellet goes', () => {
    const m = layout([row('...')]);
    const { events, step } = setup({ m, start: [1, 1, 'right'] });
    for (let i = 0; i < 60; i++) step();
    expect(events).toEqual([
      { kind: 'pellet', i: 0 },
      { kind: 'pellet', i: 1 },
      { kind: 'pellet', i: 2 },
      { kind: 'cleared' },
    ]);
  });

  it('consumes Shared pellets others took without an event', () => {
    const m = layout([row('....')]);
    const taken = new Uint8Array(4);
    taken[1] = 1;
    const { sim, events, step } = setup({ m, start: [1, 1, 'right'], taken });
    step();
    sim.take(Uint8Array.from([0, 1, 0, 1]));
    for (let i = 0; i < 60; i++) step();
    expect(events).toEqual([
      { kind: 'pellet', i: 0 },
      { kind: 'pellet', i: 2 },
      { kind: 'cleared' },
    ]);
    expect([...sim.state().eaten]).toEqual([1, 0, 1, 0]);
    expect(sim.has(1)).toBe(false);
  });

  it('picks up a power spot again once it is restored, as the kind it now holds', () => {
    const { sim, events, until, at, step } = setup({ start: [4, 1, 'right'], powers: ['hunt'] });
    until(at(6, 1));
    expect(events).toContainEqual({ kind: 'power', i: 5, power: 'hunt' });
    expect(sim.has(5)).toBe(false);
    sim.restoreSpot(5, 'dash');
    expect(sim.has(5)).toBe(true);
    expect(sim.powerAt(5)).toBe('dash');
    sim.input('left');
    step();
    until(at(4, 1));
    sim.input('right');
    step();
    until(at(6, 1));
    expect(events.filter((e) => e.kind === 'power').map((e) => e.power)).toEqual(['hunt', 'dash']);
  });

  it('records exactly one turn per direction change', () => {
    const { sim, step, until, at } = setup({ start: [10, 1, 'right'] });
    step();
    sim.input('right');
    step();
    sim.input('left');
    step();
    sim.input('left');
    step();
    until(at(8, 1));
    sim.input('right');
    step();
    sim.input('right');
    step();
    const turns = sim.state().turns;
    expect(turns.map((t) => t[3])).toEqual(['left', 'right']);
    // A reverse happens mid-tile, so it's recorded where it happened.
    expect(turns[1]![1]).toBeGreaterThan(7);
    expect(turns[1]![1]).toBeLessThan(9);
    expect(turns[1]![2]).toBe(1);
  });

  it('pops fruit after every 60 pellets, at the fruit tile, for 10 s', () => {
    // Three long rows joined at alternate ends: 25 + 1 + 25 + 1 + 25 pellets.
    const full = row('.'.repeat(25));
    const m = layout([full, row('#'.repeat(24) + '.'), full, row('.'), full], [20, 5]);
    const run = (fruit?: boolean) => {
      const s = setup({ m, start: [1, 1, 'right'], ...(fruit === undefined ? {} : { fruit }) });
      const dir = () => s.sim.state().walker.dir;
      s.sim.input('down');
      s.until(() => dir() === 'down');
      s.sim.input('left');
      s.until(() => dir() === 'left');
      s.sim.input('down');
      s.until(() => dir() === 'down');
      s.sim.input('right');
      s.until(s.at(8, 5));
      return s;
    };
    const s = run();
    expect(s.events.filter((e) => e.kind === 'pellet')).toHaveLength(FRUIT_EVERY);
    expect(s.sim.state().fruit).toEqual({ fruit: 0, untilMs: s.now() + FRUIT_MS });
    s.until(s.at(20, 5));
    expect(s.events).toContainEqual({ kind: 'fruit', fruit: 0 });
    expect(s.sim.state().fruit).toBeNull();

    const off = run(false);
    expect(off.sim.state().fruit).toBeNull();
    off.until(off.at(20, 5));
    expect(off.events.some((e) => e.kind === 'fruit')).toBe(false);
  });

  it('claims the server’s fruit (Shared) within 0.6 tiles of the fruit tile', () => {
    // The corridor's fruit tile is (10, 1).
    const s = setup({ start: [7, 1, 'right'], fruit: false });
    s.sim.offerFruit({ fruit: 2, untilMs: 60_000 });
    let x = 0;
    while (!s.events.some((e) => e.kind === 'fruit') && s.now() < 2000) {
      s.step();
      x = s.sim.position()[0];
    }
    expect(s.events.filter((e) => e.kind === 'fruit')).toEqual([{ kind: 'fruit', fruit: 2 }]);
    // Picked up as it came within reach, not only on the tile center.
    expect(x).toBeGreaterThan(10 - FRUIT_REACH);
    expect(x).toBeLessThan(10);
    expect(s.sim.state().fruit).toBeNull();
    // Withdrawn by the caller (someone else got it): nothing to pick up.
    const t = setup({ start: [7, 1, 'right'], fruit: false });
    t.sim.offerFruit({ fruit: 0, untilMs: 60_000 });
    t.sim.offerFruit(null);
    for (let i = 0; i < 60; i++) t.step();
    expect(t.events.some((e) => e.kind === 'fruit')).toBe(false);
    // A chomper with its own fruit ignores offers.
    const own = setup({ start: [7, 1, 'right'] });
    own.sim.offerFruit({ fruit: 0, untilMs: 60_000 });
    expect(own.sim.state().fruit).toBeNull();
  });

  it('picks up fruit when it turns back just short of the fruit tile', () => {
    const s = setup({ start: [7, 1, 'right'], fruit: false });
    s.sim.offerFruit({ fruit: 1, untilMs: 60_000 });
    s.until(() => s.sim.position()[0] >= 9.5);
    // Reached within reach even if it reverses before the center.
    expect(s.events).toContainEqual({ kind: 'fruit', fruit: 1 });
  });

  it('is shielded from ghosts for 2 s after a spawn or respawn', () => {
    const { sim, g, step, now, events } = setup({ start: [1, 4, 'down'] });
    sim.respawn(0);
    g.list = [ghost(0, [1, 4])];
    while (now() < SPAWN_SHIELD_MS - 20) step();
    expect(events.some((e) => e.kind === 'caught')).toBe(false);
    expect(sim.state().shieldUntil).toBe(SPAWN_SHIELD_MS);
    // It can still eat a frightened ghost meanwhile.
    g.list = [ghost(1, [1, 4], 'fright')];
    expect(step()).toContainEqual({ kind: 'ghost', ghost: 1, combo: 0 });
    g.list = [ghost(0, [1, 4])];
    while (now() < SPAWN_SHIELD_MS + 20) step();
    expect(events.filter((e) => e.kind === 'caught')).toEqual([{ kind: 'caught', ghost: 0 }]);
    // Respawning shields it again, from then.
    sim.respawn(now());
    expect(step()).toEqual([]);
    expect(sim.state().shieldUntil).toBe(now() - 16 + SPAWN_SHIELD_MS);
  });

  it('a resumed chomper keeps the shield of its last spawn', () => {
    expect(spawnShield(0, [])).toBe(SPAWN_SHIELD_MS);
    expect(spawnShield(33_000, [])).toBe(33_000 + SPAWN_SHIELD_MS);
    expect(spawnShield(0, [5_000, 9_000])).toBe(9_000 + DYING_MS + SPAWN_SHIELD_MS);
    // A catch on an earlier maze doesn't count.
    expect(spawnShield(33_000, [30_000])).toBe(33_000 + SPAWN_SHIELD_MS);
    const { sim, g, step } = setup({ start: [1, 4, 'down'] });
    sim.resume({ walker: sim.state().walker, shieldUntil: 1_000 });
    g.list = [ghost(0, [1, 4])];
    expect(step().some((e) => e.kind === 'caught')).toBe(false);
  });

  it('is deterministic for the same inputs and steps', () => {
    const go = () => {
      const s = setup({ start: [1, 3, 'up'], powers: ['dash'] });
      s.sim.input('right');
      for (let i = 0; i < 90; i++) s.step(i % 2 ? 16 : 17);
      s.sim.input('left');
      for (let i = 0; i < 30; i++) s.step(33);
      return [s.sim.state(), s.events];
    };
    expect(go()).toEqual(go());
  });
});
