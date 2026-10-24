import { createRng, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { riskBot } from './bot';
import { risk as game, type RiskAction, type RiskOptions, type RiskState } from './rules';

const PLAYERS = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron'];

/** What the platform does for a bot seat: its own view, the table view, then applyAction. */
function botMove(s: RiskState, pid: string, rng: Rng, now: number): RiskAction | null {
  return riskBot({
    playerId: pid,
    playerIds: s.seats,
    view: game.getPlayerView(s, pid),
    tableView: game.getTableView(s),
    rng,
    now,
  });
}

/** Plays an all-bot game from setup; returns the final state and how many moves it took. */
function playOut(n: number, o: Partial<RiskOptions>, seed: number, cap = 6000) {
  const options = { ...game.defaultOptions(n), ...o };
  const rng = createRng(seed);
  let s = game.setup({ playerIds: PLAYERS.slice(0, n), options, rng, now: 0 });
  let moves = 0;
  for (; moves < cap && !game.getResult(s); moves++) {
    const now = moves * 1000;
    const movers = game.waitingOn!(s);
    expect(movers.length, `waiting on nobody in ${s.phase}`).toBeGreaterThan(0);
    const pid = movers[0]!;
    const move = botMove(s, pid, rng, now);
    expect(move, `${pid} had nothing to do in ${s.phase}`).not.toBeNull();
    const next = game.applyAction(s, pid, move!, rng, now);
    expect(next, `${JSON.stringify(move)} changed nothing`).not.toEqual(s);
    s = next;
  }
  return { s, moves };
}

describe('the bot', () => {
  const configs: [number, Partial<RiskOptions>, number][] = [];
  let seed = 1;
  for (const n of [2, 3, 6])
    for (const map of ['World', 'Realm'] as const)
      for (const fog of [false, true])
        for (const goal of ['Secret missions', 'World domination'] as const)
          configs.push([
            n,
            {
              map,
              fog,
              goal,
              setup: seed % 2 ? 'Draft' : 'Quick',
              cardSets: n === 3 ? 'Fixed' : 'Rising',
            },
            seed++,
          ]);

  it.each(configs)(
    'plays %i players (%j, seed %i) to the end',
    (n, o, s0) => {
      for (const seed of [s0, s0 + 100]) {
        const { s, moves } = playOut(n, o, seed);
        expect(
          game.getResult(s),
          `unfinished after ${moves} moves (round ${s.round})`,
        ).not.toBeNull();
      }
    },
    60_000,
  );

  it('does nothing when it isn’t its turn', () => {
    const s = game.setup({
      playerIds: PLAYERS.slice(0, 3),
      options: game.defaultOptions(3),
      rng: createRng(4),
      now: 0,
    });
    for (const p of s.seats.filter((x) => x !== s.turn))
      expect(botMove(s, p, createRng(1), 0)).toBeNull();
    expect(botMove(s, s.turn, createRng(1), 0)).not.toBeNull();
  });

  it('places its draft once, then waits', () => {
    let s = game.setup({
      playerIds: PLAYERS.slice(0, 3),
      options: { ...game.defaultOptions(3), setup: 'Draft', fog: true },
      rng: createRng(5),
      now: 0,
    });
    const move = botMove(s, 'rook', createRng(1), 0)!;
    expect(move.type).toBe('draft');
    s = game.applyAction(s, 'rook', move, createRng(1), 0);
    expect(botMove(s, 'rook', createRng(1), 0)).toBeNull();
  });

  it('plays on with the turn timer firing now and then', () => {
    const options: RiskOptions = { ...game.defaultOptions(3), turnTimer: '1 minute', fog: true };
    const rng = createRng(77);
    let s = game.setup({ playerIds: PLAYERS.slice(0, 3), options, rng, now: 0 });
    let now = 0;
    for (let i = 0; i < 4000 && !game.getResult(s); i++) {
      now += 1000;
      if (i % 9 === 4) {
        // Someone's clock runs out instead of a move.
        const timer = game.nextTimer!(s)!;
        expect(timer).not.toBeNull();
        now = Math.max(now, timer.at);
        s = game.onTimer!(s, timer.id, rng, now);
        continue;
      }
      const pid = game.waitingOn!(s)[0]!;
      const move = botMove(s, pid, rng, now)!;
      s = game.applyAction(s, pid, move, rng, now);
    }
    expect(game.getResult(s)).not.toBeNull();
  });
});
