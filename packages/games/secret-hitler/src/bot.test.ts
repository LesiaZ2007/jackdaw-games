import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions, type ShOptions } from './lineup';
import { secretHitler as game, type ShState } from './rules';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Plays an all-bot table to the end, asking every seat in turn as the platform would. */
function playOut(n: number, seed: number, options: ShOptions = defaultOptions()) {
  const playerIds = ids(n);
  const rng = createRng(seed);
  let s: ShState = game.setup({ playerIds, options, rng, now: 0 });
  let moves = 0;
  while (s.phase !== 'over') {
    const waiting = game.waitingOn!(s);
    expect(waiting.length).toBeGreaterThan(0);
    let moved = false;
    for (const id of waiting) {
      const action = game.bot!({
        playerId: id,
        playerIds,
        view: game.getPlayerView(s, id),
        tableView: game.getTableView(s),
        rng,
        now: 0,
        level: 'hard',
      });
      if (!action) continue;
      const next = game.applyAction(s, id, action, rng, 0);
      expect(next).not.toBe(s);
      s = next;
      moves++;
      moved = true;
      if (s.phase === 'over') break;
    }
    expect(moved).toBe(true);
    if (moves > 2000) throw new Error('No end in sight');
  }
  return { s, moves };
}

describe('the bot', () => {
  const tables: [number, ShOptions][] = [
    [5, defaultOptions()],
    [7, defaultOptions()],
    [10, defaultOptions()],
    [12, { fascistTeam: 0, bigDeck: false }],
    [15, defaultOptions()],
    [15, { fascistTeam: 6, bigDeck: true }],
  ];

  it('plays every all-bot table to a finish', () => {
    const reasons = new Set<string>();
    for (const [n, options] of tables)
      for (let seed = 1; seed <= 12; seed++) {
        const { s, moves } = playOut(n, seed * 97 + n, options);
        expect(game.getResult(s)).not.toBe(null);
        expect(moves).toBeLessThan(1000);
        reasons.add(s.reason!);
      }
    // Over this many games, the bots find more than one way to win.
    expect(reasons.size).toBeGreaterThan(1);
  });

  it('only acts when the game waits on it', () => {
    const playerIds = ids(7);
    const rng = createRng(4);
    const s = game.setup({ playerIds, options: defaultOptions(), rng, now: 0 });
    const idle = playerIds.filter((id) => id !== s.president);
    for (const id of idle)
      expect(
        game.bot!({
          playerId: id,
          playerIds,
          view: game.getPlayerView(s, id),
          tableView: game.getTableView(s),
          rng,
          now: 0,
          level: 'hard',
        }),
      ).toBe(null);
  });

  it('gets Hitler elected when it can', () => {
    const playerIds = ids(7);
    const rng = createRng(9);
    const base = game.setup({ playerIds, options: defaultOptions(), rng, now: 0 });
    const roles = Object.fromEntries(
      playerIds.map((id, i) => [
        id,
        i === 0 ? 'fascist' : i === 1 ? 'hitler' : i === 2 ? 'fascist' : 'liberal',
      ]),
    ) as ShState['roles'];
    const s: ShState = { ...base, roles, fascist: 3, president: 'p0', rotation: 'p0' };
    const action = game.bot!({
      playerId: 'p0',
      playerIds,
      view: game.getPlayerView(s, 'p0'),
      tableView: game.getTableView(s),
      rng,
      now: 0,
      level: 'hard',
    });
    expect(action).toEqual({ type: 'nominate', chancellor: 'p1' });
  });
});

describe('partialResult', () => {
  const start = () =>
    game.setup({ playerIds: ids(7), options: defaultOptions(), rng: createRng(2), now: 0 });

  it('is null before any policy is down', () => {
    expect(game.partialResult!(start())).toBe(null);
  });

  it('gives the win to the side further along its track, roles revealed', () => {
    const s = start();
    const lib = game.partialResult!({ ...s, liberal: 2, fascist: 2 })!;
    expect(lib.summary).toBe('The Liberals were ahead: 2 of 5 Liberal policies to 2 of 6 Fascist.');
    const liberals = s.players.filter((id) => s.roles[id] === 'liberal');
    expect(lib.winners.sort()).toEqual(liberals.sort());
    expect(
      lib.standings!.filter((x) => x.outcome === 'win').every((x) => x.team === 'Liberal'),
    ).toBe(true);
    expect(lib.standings!.find((x) => s.roles[x.playerId] === 'hitler')!.role).toBe('Hitler');
    expect((lib.reveal as { roles: unknown; ended: boolean }).roles).toEqual(s.roles);
    expect((lib.reveal as { ended: boolean }).ended).toBe(true);

    const fas = game.partialResult!({ ...s, liberal: 1, fascist: 2 })!;
    expect(fas.winners.every((id) => s.roles[id] !== 'liberal')).toBe(true);
    expect(fas.winners).toHaveLength(3);
  });
});
