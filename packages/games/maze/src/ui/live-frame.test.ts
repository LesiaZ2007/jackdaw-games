import { describe, expect, it } from 'vitest';
import type { LiveChomper } from '../live';
import type { MazeTableView } from '../rules';
import type { MazeLayout } from '../sim/layouts';
import type { LiveFrame } from './live-client';
import { LiveFramer } from './live-frame';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;
function layout(): MazeLayout {
  const rows = [WALL, row(`o${'.'.repeat(24)}`), row('.'), row('.')];
  while (rows.length < 24) rows.push(WALL);
  return {
    id: 'test',
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
    powers: [[1, 1]],
  };
}

const table = (over: Partial<MazeTableView> = {}): MazeTableView =>
  ({
    mode: 'Contact',
    phase: 'play',
    round: 1,
    seed: 1,
    options: { look: 'Printed', mazes: 2 },
    powers: ['hunt'],
    layouts: [],
    startAt: 10_000,
    endAt: 70_000,
    showBy: null,
    players: [{ id: 'wren' }, { id: 'rook' }],
    shared: null,
    log: [],
    ...over,
  }) as unknown as MazeTableView;

const chomper = (id: string, seat: number, x: number, extra: Partial<LiveChomper> = {}) =>
  ({
    id,
    name: id === 'p1' ? 'Wren' : 'Rook',
    seat,
    x,
    y: 1,
    dir: 'right',
    score: 0,
    power: null,
    dyingUntil: 0,
    shieldUntil: 0,
    walker: { tile: [Math.round(x), 1], dir: 'right', next: null, prog: 0 },
    ...extra,
  }) as LiveChomper;

const frame = (over: Partial<LiveFrame> = {}): LiveFrame => ({
  t: 5_000,
  maze: 0,
  chompers: [chomper('p1', 0, 3), chomper('p2', 1, 20)],
  ghosts: [],
  taken: new Set(),
  spots: [],
  fruit: null,
  events: [],
  notices: [],
  pauseUntil: 0,
  over: false,
  ...over,
});

const framer = (me: string | null = 'p1') =>
  new LiveFramer({ me, layouts: [layout(), layout()], table: table() });

describe('LiveFramer', () => {
  it('draws the maze with what is left on it, you on top, and the clock to the bell', () => {
    const m = framer().build(frame({ taken: new Set([1, 2]) }));
    expect(m.mode).toBe('Contact');
    expect(m.phase).toBe('play');
    expect(m.board!.pellets).toHaveLength(24);
    expect(m.board!.powerSpots).toEqual([{ spot: 0, x: 1, y: 1, kind: 'hunt', up: true }]);
    expect(m.board!.chompers.map((c) => c.id)).toEqual(['p2', 'p1']);
    expect(m.board!.chompers[1]!.isYou).toBe(true);
    expect(m.timerMs).toBe(70_000 - 15_000);
    expect(m.sharedMaze).toEqual({ maze: 0, mazes: 2 });
    expect(m.scores.map((s) => s.name)).toEqual(['Wren', 'Rook']);
  });

  it('counts down before the start and between mazes', () => {
    const f = framer();
    expect(f.build(frame({ t: -2_500 })).countdown).toEqual({ msLeft: 2_500, n: 3 });
    const m = f.build(frame({ t: 9_000, pauseUntil: 10_000 }));
    expect(m.phase).toBe('countdown');
    expect(m.countdown?.n).toBe(1);
  });

  it('a bump you were in gives a banner; one between others does not', () => {
    const f = framer();
    const m = f.build(frame({ events: [{ kind: 'bump', a: 'p1', b: 'p2', cost: 50 }] }));
    expect(m.banner?.text).toBe('BUMP −50');
    const other = framer('p3').build(
      frame({ events: [{ kind: 'bump', a: 'p1', b: 'p2', cost: 50 }] }),
    );
    expect(other.banner).toBeNull();
  });

  it('being eaten names who ate you; eating someone says so', () => {
    const ev = { kind: 'eat' as const, by: 'p2', eaten: 'p1', cost: 200, gain: 400 };
    const eaten = framer('p1').build(frame({ events: [ev] }));
    expect(eaten.banner).toMatchObject({ text: 'ROOK ATE YOU −200', tone: 'bad' });
    expect(eaten.effects.some((e) => e.kind === 'caught' && e.mine)).toBe(true);
    expect(framer('p2').build(frame({ events: [ev] })).banner?.text).toBe('YOU ATE WREN +400');
  });

  it('an attack on you is a banner and an effect; a cleared maze cheers', () => {
    const f = framer();
    const m = f.build(
      frame({ notices: [{ kind: 'attack', by: 'p2', attack: 'freeze', targets: ['p1'] }] }),
    );
    expect(m.banner?.text).toBe('FROZEN BY ROOK');
    expect(m.effects.some((e) => e.kind === 'attackReceived')).toBe(true);
    const c = f.build(frame({ notices: [{ kind: 'cleared', maze: 0 }] }));
    expect(c.effects.some((e) => e.kind === 'mazeCleared')).toBe(true);
  });

  it('a pellet you take sounds as yours, a score change bumps the card', () => {
    const f = framer();
    f.build(frame());
    const m = f.build(
      frame({
        taken: new Set([2]),
        chompers: [chomper('p1', 0, 3, { score: 10 }), chomper('p2', 1, 20)],
      }),
    );
    expect(m.effects).toContainEqual(expect.objectContaining({ kind: 'pellet', mine: true }));
    expect(m.effects).toContainEqual(
      expect.objectContaining({ kind: 'score', id: 'p1', delta: 10 }),
    );
  });

  it('the TV draws everyone at full strength and is nobody', () => {
    const m = framer(null).build(frame());
    expect(m.me).toBeNull();
    expect(m.board!.chompers.every((c) => c.alpha === 1 && !c.isYou)).toBe(true);
  });

  it('is over when the server says so or the table has moved on', () => {
    expect(framer().build(frame({ over: true })).phase).toBe('over');
    const f = framer();
    f.setTable(table({ phase: 'between' }));
    expect(f.build(frame()).phase).toBe('over');
  });
});
