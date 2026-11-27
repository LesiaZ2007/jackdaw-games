import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions, validateOptions, enabledPowers } from './options';
import { maze, type MazeState } from './rules';

const IDS = ['wren', 'rook', 'robin'];
const NOW = 1_000_000;
const opts = { ...defaultOptions(3), mode: 'Contact' as const, minutes: 2 };

function start(): MazeState {
  return maze.setup({ playerIds: IDS, options: opts, rng: createRng(7), now: NOW });
}

const result = (
  seq: number,
  scores: Record<string, number>,
  o: { final?: boolean; round?: number } = {},
) => ({
  type: 'liveResult' as const,
  round: o.round ?? 1,
  seq,
  final: o.final ?? false,
  players: Object.fromEntries(
    Object.entries(scores).map(([id, score]) => [
      id,
      {
        score,
        pellets: Math.floor(score / 10),
        ghosts: 1,
        caught: 0,
        fruit: 0,
        powers: 1,
        bumps: 2,
        eats: 1,
      },
    ]),
  ),
  log: [{ actor: 'wren', text: '{wren} ate {rook}.', tag: '+400', tone: 'good' as const }],
});

const apply = (s: MazeState, a: unknown, now = NOW + 60_000) => {
  const parsed = maze.serverActionSchema!.parse(a);
  return maze.applyServerAction!(s, parsed, now) as MazeState;
};

describe('Contact mode rules', () => {
  it('needs two or more players, and has no Jinx', () => {
    expect(validateOptions(opts, 1)).toMatch(/2 or more/);
    expect(validateOptions(opts, 8)).toBeNull();
    expect(enabledPowers(opts)).not.toContain('jinx');
    expect(enabledPowers(opts)).toContain('steal');
  });

  it('sets up like the Shared maze without its polling bookkeeping', () => {
    const s = start();
    expect(s.options.mode).toBe('Contact');
    expect(s.shared).toBeNull();
    expect(s.layouts.length).toBe(opts.mazes);
    expect(s.endAt! - s.startAt).toBe(2 * 60_000);
    expect(maze.getTableView(s).mode).toBe('Contact');
  });

  it('ignores phone ticks: the live room keeps the score', () => {
    const s = { ...start(), phase: 'play' as const };
    const tick = {
      type: 'tick' as const,
      round: 1,
      seq: 1,
      t: 1000,
      maze: 0,
      pos: [1, 1, null] as [number, number, null],
      turns: [],
      eaten: 'AAAA',
      ghosts: [],
      caught: 0,
      fruit: [],
      powers: [],
      lives: 3,
    };
    expect(maze.applyAction(s, 'wren', tick, createRng(1), NOW + 5000)).toBe(s);
  });

  it('takes checkpoints in order and ignores old or other-round ones', () => {
    let s: MazeState = { ...start(), phase: 'play' };
    s = apply(s, result(2, { wren: 300, rook: 100, robin: 0 }));
    expect(s.players.wren!.score).toBe(300);
    expect(s.players.rook!.bumps).toBe(2);
    expect(s.log.some((e) => e.text === '{wren} ate {rook}.')).toBe(true);
    expect(apply(s, result(1, { wren: 5, rook: 5, robin: 5 }))).toBe(s);
    expect(apply(s, result(3, { wren: 5, rook: 5, robin: 5 }, { round: 2 }))).toBe(s);
    expect(maze.partialResult!(s)?.winners).toEqual(['wren']);
    expect(maze.getResult(s)).toBeNull();
  });

  it('a final result ends the round, with Bumps and Eaten in the stats', () => {
    let s: MazeState = { ...start(), phase: 'play' };
    s = apply(s, result(5, { wren: 100, rook: 700, robin: 50 }, { final: true }));
    expect(s.phase).toBe('between');
    s = maze.onTimer!(s, 'show', createRng(1), s.showBy!) as MazeState;
    const r = maze.getResult(s)!;
    expect(r.winners).toEqual(['rook']);
    expect(r.stats!.columns).toEqual(['Score', 'Pellets', 'Ghosts', 'Caught', 'Bumps', 'Ate']);
    expect(r.stats!.rows[0]).toEqual({ playerId: 'rook', values: [700, 70, 1, 0, 2, 1] });
  });

  it('ends on its own well after the bell if the live room never reports', () => {
    const s = { ...start(), phase: 'play' as const };
    const timer = maze.nextTimer!(s)!;
    expect(timer.id).toBe('bell');
    expect(timer.at).toBe(s.endAt! + 90_000);
    const over = maze.onTimer!(s, 'bell', createRng(1), timer.at) as MazeState;
    expect(over.phase).toBe('between');
  });

  it('bots are played by the live room, not the platform', () => {
    const s = { ...start(), phase: 'play' as const };
    const view = maze.getPlayerView(s, 'wren');
    const tv = maze.getTableView(s);
    expect(
      maze.bot!({
        playerId: 'wren',
        playerIds: IDS,
        view,
        tableView: tv,
        rng: createRng(1),
        now: NOW + 5000,
        level: 'normal',
      }),
    ).toBeNull();
  });
});
