import { describe, expect, it } from 'vitest';
import type { MazeLayout } from '../sim/layouts';
import { layoutsOf } from '../sim/layouts';
import { POWER_KINDS } from '../sim/powers';
import { LiveRound, MAZE_PAUSE_MS } from './round';

const WALL = '#'.repeat(27);
const row = (inner: string) => `#${inner.padEnd(25, '#')}#`;
function corridor(inner: string, starts: MazeLayout['starts']): MazeLayout {
  const rows = [WALL, row(inner), row('.'), row('.'), row('.')];
  while (rows.length < 24) rows.push(WALL);
  return {
    id: `c-${inner}`,
    size: 'Medium',
    w: 27,
    h: 24,
    rows,
    starts,
    house: [13, 12],
    exit: [13, 7],
    fruit: [10, 1],
    powers: [],
  };
}

describe('LiveRound, the full round', () => {
  it('plays a two-minute all-bot round on real mazes to the bell', () => {
    const layouts = layoutsOf('Medium').slice(0, 2);
    const r = new LiveRound({
      layouts,
      startedAt: 0,
      seed: 42,
      powers: POWER_KINDS.filter((k) => k !== 'jinx'),
      mixed: true,
      ghosts: true,
      fruit: true,
      endMs: 120_000,
    });
    const ids = ['Wren', 'Rook', 'Robin', 'Finch'].map((n) =>
      r.join(`Bot ${n}`, n, { bot: true })!,
    );
    for (let t = 0; t <= 121_000 && !r.isOver(); t += 50) r.advance(t);
    expect(r.isOver()).toBe(true);
    const s = r.snapshot(0);
    expect(s.over).toBe(true);
    expect(s.ghosts!.length).toBe(4);
    const cp = r.checkpoint(1, (seat) => (ids.includes(seat) ? `player-${seat}` : undefined));
    expect(cp.final).toBe(true);
    const players = Object.values(cp.players);
    expect(players).toHaveLength(4);
    expect(players.every((p) => p.score >= 0)).toBe(true);
    // The bots actually play: plenty of pellets, and the ghosts get someone.
    expect(players.reduce((n, p) => n + p.pellets, 0)).toBeGreaterThan(150);
    expect(players.reduce((n, p) => n + p.caught, 0)).toBeGreaterThan(0);
  });

  it('a later checkpoint has a higher sequence number and only the new recap lines', () => {
    const m = corridor('..o' + '.'.repeat(22), [
      [2, 1, 'right'],
      [24, 1, 'left'],
    ]);
    const r = new LiveRound({ layout: m, startedAt: 0 });
    r.join('Wren');
    r.join('Rook');
    for (let t = 0; t < 3000; t += 20) r.advance(t);
    const map = (seat: string) => ({ p1: 'wren', p2: 'rook' })[seat];
    const first = r.checkpoint(1, map);
    expect(first.log.some((e) => e.text === '{wren} ate {rook}.' && e.actor === 'wren')).toBe(true);
    expect(first.players.wren!.eats).toBe(1);
    const second = r.checkpoint(1, map);
    expect(second.seq).toBe(first.seq + 1);
    expect(second.log).toEqual([]);
  });

  it('two chompers that stay together bump once, not every step', () => {
    const m = corridor('.'.repeat(25), [
      [2, 1, 'right'],
      [2, 1, 'right'],
    ]);
    const r = new LiveRound({ layout: m, startedAt: 0 });
    r.join('Wren');
    r.join('Rook');
    let bumps = 0;
    for (let t = 0; t < 4000; t += 20) {
      r.advance(t);
      bumps += r.snapshot(0).events.filter((e) => e.kind === 'bump').length;
    }
    expect(bumps).toBe(1);
  });

  it('Steal takes 15% of the leader for whoever grabs it', () => {
    const m = corridor('.'.repeat(11) + 'o' + '.'.repeat(13), [
      [2, 1, 'right'],
      [24, 1, 'left'],
    ]);
    const r = new LiveRound({ layout: m, startedAt: 0, powers: ['steal'] });
    r.join('Wren');
    r.join('Rook');
    let steal: { amount?: number; targets: string[] } | null = null;
    let rookBefore = 0;
    for (let t = 0; t < 3000 && !steal; t += 10) {
      rookBefore = r.peek('p2').score;
      r.advance(t);
      const n = r.snapshot(0).notices!.find((x) => x.kind === 'attack');
      if (n && n.kind === 'attack') steal = n;
    }
    expect(steal).not.toBeNull();
    expect(steal!.targets).toEqual(['p2']);
    expect(steal!.amount).toBe(Math.floor(rookBefore * 0.15));
  });

  it('clearing a maze pauses, then starts the next one with everyone back at their start', () => {
    const tiny = corridor('....', [[1, 1, 'right']]);
    // Only row 1: nothing else to eat.
    tiny.rows[2] = tiny.rows[3] = tiny.rows[4] = WALL;
    const next = corridor('.'.repeat(25), [[3, 1, 'right']]);
    const r = new LiveRound({ layouts: [tiny, next], startedAt: 0 });
    r.join('Wren');
    let cleared = -1;
    for (let t = 0; t < 2000 && cleared < 0; t += 10) {
      r.advance(t);
      if (r.snapshot(0).notices!.some((n) => n.kind === 'cleared')) cleared = t;
    }
    expect(cleared).toBeGreaterThan(0);
    r.advance(cleared + MAZE_PAUSE_MS - 100);
    expect(r.snapshot(0).maze).toBe(0);
    r.advance(cleared + MAZE_PAUSE_MS + 50);
    const s = r.snapshot(0);
    expect(s.maze).toBe(1);
    expect(s.layoutId).toBe(next.id);
    expect(Math.abs(s.chompers[0]!.x - 3)).toBeLessThan(1);
    expect(r.isOver()).toBe(false);
  });

  it('the bell ends the round', () => {
    const r = new LiveRound({ layout: layoutsOf('Medium')[0]!, startedAt: 0, endMs: 1000 });
    r.join('Wren');
    r.advance(900);
    expect(r.isOver()).toBe(false);
    r.advance(1100);
    expect(r.isOver()).toBe(true);
    expect(r.checkpoint(1, () => 'wren').final).toBe(true);
  });
});
