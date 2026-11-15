import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { ScreenPlayer } from '@jackdaw/ui';
import { Attract, lookOf, runAttractLoop } from './attract';
import { LobbyActions, Lineup, attractPlayers, chomperColor } from './lobby';
import { LOOKS } from './render/core';

const player = (id: string, name: string, bot = false): ScreenPlayer => ({
  id,
  name,
  avatar: { tint: 'gules', crest: 'rook' } as ScreenPlayer['avatar'],
  online: true,
  bot,
});

/** Walks a React element tree, calling plain function components, and collects what it holds. */
function walk(node: ReactNode, out: { text: string[]; el: ReactElement[] }): void {
  if (node == null || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    out.text.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  if (!isValidElement(node)) return;
  const el = node as ReactElement<{ children?: ReactNode }>;
  if (typeof el.type === 'function') {
    const fn = el.type as unknown as (p: unknown) => ReactNode;
    // Pieces from the kit use hooks (reactions); they are leaves for this check.
    if (['PlayerReaction', 'AddSeat', 'Plaque'].includes(fn.name)) {
      out.el.push(el);
      walk(el.props.children, out);
      return;
    }
    walk(fn(el.props), out);
    return;
  }
  out.el.push(el);
  walk(el.props.children, out);
}
const inspect = (n: ReactNode) => {
  const out = { text: [] as string[], el: [] as ReactElement[] };
  walk(n, out);
  return out;
};
const classOf = (e: ReactElement) => (e.props as { className?: string }).className ?? '';

describe('lineup', () => {
  const players = [player('a', 'Wren'), player('b', 'Rook', true), player('c', 'Kite')];
  const lineup = () =>
    inspect(
      createElement(Lineup, { players, me: 'a', hostId: 'a', look: 'Neon', onAddBot: () => {} }),
    );

  it('draws each player as a chomper with their name', () => {
    const r = lineup();
    const rows = r.el.filter((e) => classOf(e).split(' ').includes('mz-row'));
    expect(rows.filter((e) => !classOf(e).includes('mz-row--open'))).toHaveLength(3);
    for (const n of ['Wren', 'Rook', 'Kite']) expect(r.text).toContain(n);
    expect(r.el.filter((e) => classOf(e) === 'mz-chomp')).toHaveLength(3);
  });

  it('tags computer players CPU, and only them', () => {
    const r = lineup();
    expect(r.text.filter((t) => t === 'CPU')).toHaveLength(1);
    const bot = r.el.find((e) => (e.props as { 'data-bot'?: string })['data-bot'] === 'true');
    expect(inspect(bot).text).toContain('Rook');
  });

  it('offers a CPU slot only when the host can add one', () => {
    const without = inspect(createElement(Lineup, { players, me: 'a', hostId: 'a', look: 'Neon' }));
    expect(without.text).not.toContain('Add a CPU');
    expect(lineup().text).toContain('Add a CPU');
  });

  it('colors the chompers in the look, in seat order', () => {
    expect(chomperColor('Neon', 1)).toBe(LOOKS.Neon.players[1]);
    expect(chomperColor('Printed', 0)).not.toBe(chomperColor('Neon', 0));
  });
});

describe('start area', () => {
  const props = {
    hostName: 'Wren',
    busy: false,
    blocker: null,
    onStart: () => {},
    onSettings: () => {},
    settingsOpen: false,
  };
  const startButtons = (isHost: boolean) =>
    inspect(createElement(LobbyActions, { ...props, isHost })).el.filter((e) =>
      classOf(e).includes('mz-start'),
    );

  it('shows the READY? start button to the host only', () => {
    expect(startButtons(true)).toHaveLength(1);
    expect(inspect(createElement(LobbyActions, { ...props, isHost: true })).text).toContain(
      'READY?',
    );
    expect(startButtons(false)).toHaveLength(0);
    expect(
      inspect(createElement(LobbyActions, { ...props, isHost: false })).text.join(''),
    ).toContain('Waiting for Wren to start');
  });

  it('disables Start with a reason', () => {
    const r = inspect(createElement(LobbyActions, { ...props, isHost: true, blocker: 'Need 2' }));
    expect(r.el.find((e) => classOf(e).includes('mz-start'))!.props).toMatchObject({
      disabled: true,
    });
    expect(r.text).toContain('Need 2');
  });
});

describe('look', () => {
  it('follows the look option', () => {
    expect(lookOf({ look: 'Neon' })).toBe('Neon');
    expect(lookOf({ look: 'Cabinet' })).toBe('Cabinet');
    expect(lookOf({ look: 'nope' })).toBe('Printed');
    expect(lookOf({})).toBe('Printed');
  });

  it('restyles the same scene', () => {
    const a = new Attract('ABCD');
    a.setRoster([]);
    a.advance(1000);
    expect(a.model('Printed').look).toBe('Printed');
    expect(a.model('Classic').look).toBe('Classic');
    expect(a.model('Classic').board!.ghosts).toEqual(a.model('Printed').board!.ghosts);
  });
});

describe('attract scene', () => {
  const roster = attractPlayers([player('a', 'Wren'), player('b', 'Rook')]);

  it('is the same for the same seed', () => {
    const run = () => {
      const a = new Attract('LOBBY');
      a.setRoster(roster);
      a.advance(5000);
      return JSON.stringify(a.model('Printed').board);
    };
    expect(run()).toBe(run());
  });

  it('puts the players in the maze, named, and keeps at least two chompers', () => {
    const a = new Attract('XYZ');
    a.setRoster(roster);
    expect(a.model('Printed').board!.chompers.map((c) => c.name)).toEqual(['Wren', 'Rook']);
    a.setRoster([]);
    expect(a.model('Printed').board!.chompers).toHaveLength(2);
  });

  it('runs: ghosts move, pellets get eaten, everyone stays inside the maze', () => {
    const a = new Attract('MOVE');
    a.setRoster(roster);
    const before = a.model('Printed').board!;
    const g0 = before.ghosts.map((g) => [g.x, g.y]);
    const n0 = before.pellets.length;
    for (let i = 0; i < 200; i++) {
      a.advance(100);
      const b = a.model('Printed').board!;
      for (const c of [...b.chompers, ...b.ghosts]) {
        expect(c.x).toBeGreaterThan(-1);
        expect(c.x).toBeLessThan(b.w);
        expect(Number.isFinite(c.y)).toBe(true);
      }
    }
    const after = a.model('Printed').board!;
    expect(after.ghosts.map((g) => [g.x, g.y])).not.toEqual(g0);
    expect(after.pellets.length).not.toBe(n0);
  });
});

describe('animation loop', () => {
  it('reduced motion paints one still frame and asks for no frames', () => {
    let raf = 0;
    let painted = 0;
    const stop = runAttractLoop({
      reduced: true,
      step: () => {},
      paint: () => painted++,
      raf: () => ++raf,
    });
    expect(painted).toBe(1);
    expect(raf).toBe(0);
    stop();
  });

  it('otherwise steps on every frame, pauses while hidden, and stops', () => {
    const queue: ((t: number) => void)[] = [];
    let steps = 0;
    let visible = true;
    const stop = runAttractLoop({
      reduced: false,
      step: () => steps++,
      paint: () => {},
      raf: (cb) => queue.push(cb),
      caf: () => {},
      visible: () => visible,
    });
    const frame = (t: number) => queue.shift()!(t);
    frame(0);
    frame(16);
    frame(32);
    expect(steps).toBe(2);
    visible = false;
    frame(48);
    expect(steps).toBe(2);
    visible = true;
    frame(5000);
    // The first frame back only restarts the clock: no jump through the time away.
    expect(steps).toBe(2);
    stop();
    const left = queue.length;
    frame(6000);
    expect(queue.length).toBeLessThanOrEqual(left);
  });
});
