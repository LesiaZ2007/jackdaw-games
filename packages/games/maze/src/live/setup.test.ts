import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions } from '../options';
import { maze } from '../rules';
import { liveSetupFrom, roundOptionsFrom } from './setup';

const opts = { ...defaultOptions(3), mode: 'Contact' as const, minutes: 2 };
const s = maze.setup({
  playerIds: ['wren', 'rook', 'robin'],
  options: opts,
  rng: createRng(3),
  now: 1_000,
});
const players = [
  { id: 'wren', name: 'Wren' },
  { id: 'rook', name: 'Bot Rook', bot: true },
  { id: 'robin', name: 'Robin' },
];

describe('live setup', () => {
  it('comes from the public table view, seats in seat order', () => {
    const setup = liveSetupFrom(maze.getTableView(s), players)!;
    expect(setup.seed).toBe(s.seed);
    expect(setup.layouts).toEqual(s.layouts);
    expect(setup.startAt).toBe(s.startAt);
    expect(setup.endAt).toBe(s.endAt);
    expect(setup.seats).toEqual([
      { id: 'wren', name: 'Wren' },
      { id: 'rook', name: 'Bot Rook', bot: true },
      { id: 'robin', name: 'Robin' },
    ]);
    expect(setup.powers).not.toContain('jinx');
    expect(setup.mixed).toBe(true);
  });

  it('is null for any other mode', () => {
    const shared = maze.setup({
      playerIds: ['wren', 'rook'],
      options: { ...opts, mode: 'Shared' },
      rng: createRng(3),
      now: 1_000,
    });
    expect(liveSetupFrom(maze.getTableView(shared), players)).toBeNull();
  });

  it('becomes the live round options: ghosts and fruit on, the bell on the round clock', () => {
    const setup = liveSetupFrom(maze.getTableView(s), players)!;
    const o = roundOptionsFrom(setup);
    expect(o.startedAt).toBe(setup.startAt);
    expect(o.endMs).toBe(setup.endAt - setup.startAt);
    expect(o.layouts!.length).toBe(setup.layouts.length);
    expect(o.ghosts).toBe(true);
    expect(o.fruit).toBe(true);
  });
});
