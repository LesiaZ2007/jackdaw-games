import { describe, expect, it } from 'vitest';
import { ChomperSim, DYING_MS, SPAWN_SHIELD_MS } from '../sim/chomper';
import type { MazeLayout } from '../sim/layouts';
import { BUMP_SHIELD_MS } from './contact';
import { LiveRound, STEP_MS } from './round';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;

/** One long corridor on row 1 (x = 1..25). Seats 0 and 1 face each other; 2 and 3 sit below. */
function corridor(inner: string): MazeLayout {
  const rows = [WALL, row(inner), row('.'), row('.'), row('.')];
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
      [1, 3, 'down'],
      [1, 4, 'up'],
    ],
    house: [13, 12],
    exit: [13, 7],
    fruit: [10, 1],
    powers: [],
  };
}

const plain = corridor('.'.repeat(25));
/** A Hunt spot right in front of seat 0. */
const hunt = corridor('..o' + '.'.repeat(22));

/** Advances in small slices until `pred` holds or `limitMs` passes; returns the round ms. */
function until(r: LiveRound, from: number, limitMs: number, pred: () => boolean): number {
  for (let t = from; t <= from + limitMs; t += 10) {
    r.advance(t);
    if (pred()) return t;
  }
  throw new Error('condition never held');
}

const byId = (r: LiveRound, id: string) => r.snapshot(0).chompers.find((c) => c.id === id)!;

describe('LiveRound', () => {
  it('join seats up to four, then refuses', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const ids = ['Wren', 'Rook', 'Robin', 'Finch'].map((n) => r.join(n));
    expect(new Set(ids).size).toBe(4);
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
    expect(r.join('Heron')).toBeNull();
  });

  it('rejoin by name keeps the chomper', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const id = r.join('Wren')!;
    r.advance(1000);
    const score = byId(r, id).score;
    expect(score).toBeGreaterThan(0);
    expect(r.join('wren')).toBe(id);
    r.advance(1001);
    expect(byId(r, id).score).toBeGreaterThanOrEqual(score);
  });

  it('a chomper moves at the sim speed', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const id = r.join('Wren')!;
    r.advance(1000);
    const lone = new ChomperSim({
      m: plain,
      start: plain.starts[0]!,
      level: 1,
      powers: ['hunt'],
      ghosts: { ghosts: () => [] },
      fruit: false,
    });
    let t = 0;
    while (t + STEP_MS <= 1000) {
      t += STEP_MS;
      lone.step(STEP_MS, t);
    }
    expect(byId(r, id).x).toBeCloseTo(lone.position()[0], 5);
    expect(byId(r, id).x).toBeGreaterThan(8);
  });

  it('pellets are owned by whoever reaches them first', () => {
    const m = corridor('.'.repeat(25));
    m.starts[1] = [6, 1, 'right'];
    const r = new LiveRound({ layout: m, startedAt: 0 });
    r.join('Wren');
    r.join('Rook');
    r.advance(2500);
    const s = r.snapshot(0);
    expect(new Set(s.taken).size).toBe(s.taken.length);
    const total = s.chompers.reduce((n, c) => n + c.score, 0);
    expect(total).toBe(s.taken.length * 10);
  });

  it('bump costs both and reverses them', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const a = r.join('Wren')!;
    const b = r.join('Rook')!;
    let bump = null as ReturnType<LiveRound['snapshot']>['events'][number] | null;
    let before = { a: 0, b: 0 };
    const t = until(r, 0, 4000, () => {
      const s = r.snapshot(0);
      bump = s.events.find((e) => e.kind === 'bump') ?? null;
      if (!bump) before = { a: byId(r, a).score, b: byId(r, b).score };
      return !!bump;
    });
    expect(bump).toMatchObject({ kind: 'bump', a, b });
    // The reverse is queued at the bump and taken on the next sim step.
    r.advance(t + 2 * STEP_MS);
    const ca = byId(r, a);
    const cb = byId(r, b);
    expect(ca.score).toBeLessThanOrEqual(Math.max(0, before.a + 30 - 50));
    expect(cb.score).toBeLessThanOrEqual(Math.max(0, before.b + 30 - 50));
    expect(ca.dir).toBe('left');
    expect(cb.dir).toBe('right');
    expect(ca.shieldUntil).toBeGreaterThanOrEqual(t - 10 + BUMP_SHIELD_MS - STEP_MS);
    expect(cb.shieldUntil).toBeGreaterThanOrEqual(t - 10 + BUMP_SHIELD_MS - STEP_MS);
  });

  it('bump shield stops a repeat bump', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    r.join('Wren');
    r.join('Rook');
    const t = until(r, 0, 4000, () => r.snapshot(0).events.some((e) => e.kind === 'bump'));
    r.advance(t + 500);
    expect(r.snapshot(0).events.filter((e) => e.kind === 'bump')).toHaveLength(0);
  });

  it('hunter eats and the eaten respawns', () => {
    const r = new LiveRound({ layout: hunt, startedAt: 0 });
    const a = r.join('Wren')!;
    const b = r.join('Rook')!;
    let preA = 0;
    let preB = 0;
    let at: ReturnType<LiveRound['snapshot']> | null = null;
    const t = until(r, 0, 4000, () => {
      const s = r.snapshot(0);
      if (!s.events.some((e) => e.kind === 'eat')) {
        preA = s.chompers.find((c) => c.id === a)!.score;
        preB = s.chompers.find((c) => c.id === b)!.score;
        return false;
      }
      at = s;
      return true;
    });
    const snap = at!;
    expect(snap.events).toContainEqual({ kind: 'eat', by: a, eaten: b, cost: 200, gain: 400 });
    const eater = snap.chompers.find((c) => c.id === a)!;
    const eaten = snap.chompers.find((c) => c.id === b)!;
    expect(eater.score).toBeGreaterThanOrEqual(preA + 400);
    // Rook had about 110 when eaten: 200 is more, so it stops at 0.
    expect(preB).toBeLessThan(200);
    expect(eaten.score).toBe(0);
    expect(eaten.dyingUntil).toBeGreaterThan(t - 10);
    expect(eaten.dyingUntil).toBeLessThanOrEqual(t + DYING_MS);
    const respawned = until(r, t, DYING_MS + 200, () => byId(r, b).dyingUntil === 0);
    const back = byId(r, b);
    // Back at its start (it moves on within the same step).
    expect(Math.abs(back.x - 24)).toBeLessThan(0.5);
    expect(back.y).toBe(1);
    expect(back.shieldUntil).toBeGreaterThanOrEqual(respawned - 10 + SPAWN_SHIELD_MS - STEP_MS);
  });

  it('eat cost never takes score below zero', () => {
    const r = new LiveRound({ layout: hunt, startedAt: 0 });
    r.join('Wren');
    const b = r.join('Rook')!;
    until(r, 0, 4000, () => r.snapshot(0).events.some((e) => e.kind === 'eat'));
    // Rook ate about ten pellets (well under 200) before being eaten.
    expect(byId(r, b).score).toBe(0);
  });

  it('acknowledges the last turn applied and carries each walker', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const id = r.join('Wren')!;
    r.advance(300);
    r.input(id, 'left', 7);
    r.advance(400);
    const s = r.snapshot(0);
    expect(s.acks[id]).toBe(7);
    const c = s.chompers[0]!;
    expect(c.walker.dir).toBe('left');
    expect(c.walker.tile[1]).toBe(1);
  });

  it('rejoin starts the turn count again', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const id = r.join('Wren', 'dev-1')!;
    r.input(id, 'left', 57);
    expect(r.join('Wren', 'dev-1')).toBe(id);
    expect(r.snapshot(0).acks[id]).toBe(0);
  });

  it('seats are keyed by device, so two phones both called Wren get two chompers', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const a = r.join('Wren', 'dev-1');
    const b = r.join('Wren', 'dev-2');
    expect(a).not.toBe(b);
    expect(r.join('Wren (2)', 'dev-1')).toBe(a);
  });

  it('board() lists every pellet taken without draining events', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    const a = r.join('Wren', 'dev-1')!;
    r.join('Rook', 'dev-2');
    until(r, 0, 4000, () => r.board().length > 0 && r.peek(a).score > 0);
    const all = r.board();
    expect(all.length).toBeGreaterThan(0);
    r.advance(4000);
    expect(r.board().length).toBeGreaterThanOrEqual(all.length);
    const s = r.snapshot(0);
    expect(s.events.some((e) => e.kind === 'bump')).toBe(true);
    expect(new Set(s.taken)).toEqual(new Set(r.board()));
  });

  describe('a turn tagged with the junction the phone turned at', () => {
    /** Row 1 corridor, a branch down at x = 10 to a second corridor on row 3. */
    const branch = (() => {
      const m = corridor('.'.repeat(25));
      m.rows[2] = row('.........'.replace(/./g, '#') + '.');
      return m;
    })();
    const reach = (r: LiveRound, id: string, x: number) =>
      until(r, 0, 3000, () => r.peek(id).x >= x);

    it('is taken at that junction when the server is just past it', () => {
      const r = new LiveRound({ layout: branch, startedAt: 0 });
      const id = r.join('Wren')!;
      const t = reach(r, id, 10.3);
      r.input(id, 'down', 1, [10, 1]);
      r.advance(t + 1);
      const c = r.peek(id);
      expect(c.dir).toBe('down');
      expect(c.x).toBe(10);
      expect(c.y).toBeGreaterThan(1.2);
      expect(r.snapshot(0).acks[id]).toBe(1);
    });

    it('is queued when the server has not reached it yet', () => {
      const r = new LiveRound({ layout: branch, startedAt: 0 });
      const id = r.join('Wren')!;
      const t = reach(r, id, 9.2);
      r.input(id, 'down', 1, [10, 1]);
      until(r, t, 1000, () => r.peek(id).y > 1.5);
      expect(r.peek(id).x).toBe(10);
    });

    it('is treated as a normal (late) turn when the server is well past it', () => {
      const r = new LiveRound({ layout: branch, startedAt: 0 });
      const id = r.join('Wren')!;
      const t = reach(r, id, 11.2);
      r.input(id, 'down', 1, [10, 1]);
      r.advance(t + 300);
      const c = r.peek(id);
      expect(c.dir).toBe('right');
      expect(c.y).toBe(1);
    });
  });

  it('snapshots list pellets taken since a time, and events once', () => {
    const r = new LiveRound({ layout: plain, startedAt: 0 });
    r.join('Wren');
    r.advance(500);
    const first = r.snapshot(0);
    r.advance(1000);
    const later = r.snapshot(first.t);
    expect(later.taken.every((i) => !first.taken.includes(i))).toBe(true);
    expect(later.taken.length).toBeGreaterThan(0);
    expect(later.layoutId).toBe('test-corridor');
  });
});
