import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { PICKS, rps, scoreRound, type Pick, type RpsState } from './rules';

const ids = ['a', 'b', 'c'];
const fresh = (rounds = 3, players = ids) =>
  rps.setup({ playerIds: players, options: { rounds }, rng: createRng(1) });
const pick = (s: RpsState, id: string, p: Pick) =>
  rps.applyAction(s, id, { type: 'pick', pick: p }, createRng(1));
const playRound = (s: RpsState, picks: Record<string, Pick>) =>
  Object.entries(picks).reduce((st, [id, p]) => pick(st, id, p), s);

describe('scoring', () => {
  it('scores one point per opponent beaten', () => {
    expect(scoreRound({ a: 'rock', b: 'scissors', c: 'scissors' })).toEqual({ a: 2, b: 0, c: 0 });
    expect(scoreRound({ a: 'rock', b: 'paper', c: 'scissors' })).toEqual({ a: 1, b: 1, c: 1 });
    expect(scoreRound({ a: 'rock', b: 'rock' })).toEqual({ a: 0, b: 0 });
  });
});

describe('rounds', () => {
  it('waits for every pick, then resolves the round together', () => {
    let s = fresh();
    s = pick(s, 'a', 'rock');
    s = pick(s, 'b', 'scissors');
    expect(s.round).toBe(1);
    expect(s.history).toHaveLength(0);
    s = pick(s, 'c', 'scissors');
    expect(s.round).toBe(2);
    expect(s.picks).toEqual({});
    expect(s.scores).toEqual({ a: 2, b: 0, c: 0 });
    expect(s.recap).toHaveLength(1);
  });

  it('lets a player change their pick before the round resolves', () => {
    let s = pick(fresh(), 'a', 'rock');
    s = pick(s, 'a', 'paper');
    expect(s.picks.a).toBe('paper');
  });

  it('ends after the last round with the top scorer winning, ties sharing', () => {
    let s = fresh(2);
    s = playRound(s, { a: 'rock', b: 'scissors', c: 'paper' }); // 1 each
    expect(rps.getResult(s)).toBeNull();
    s = playRound(s, { a: 'rock', b: 'scissors', c: 'scissors' }); // a +2
    const result = rps.getResult(s)!;
    expect(result.winners).toEqual(['a']);
    expect(result.recap).toHaveLength(2);

    let tie = fresh(1, ['a', 'b']);
    tie = playRound(tie, { a: 'rock', b: 'rock' });
    expect(rps.getResult(tie)?.winners).toEqual(['a', 'b']);
    expect(() => pick(tie, 'a', 'rock')).toThrow(/over/);
  });

  it('reports standings: shared wins, losses, and a draw when everyone ties', () => {
    const outcomes = (s: RpsState) =>
      Object.fromEntries(rps.getResult(s)!.standings!.map((x) => [x.playerId, x.outcome]));
    const shared = playRound(fresh(1), { a: 'rock', b: 'rock', c: 'scissors' });
    expect(outcomes(shared)).toEqual({ a: 'win', b: 'win', c: 'loss' });
    const allTied = playRound(fresh(1), { a: 'rock', b: 'paper', c: 'scissors' });
    expect(outcomes(allTied)).toEqual({ a: 'draw', b: 'draw', c: 'draw' });
  });

  it('rejects bad actions and players outside the game', () => {
    expect(rps.actionSchema.safeParse({ type: 'pick', pick: 'lizard' }).success).toBe(false);
    expect(() => pick(fresh(), 'zed', 'rock')).toThrow(/not in this game/);
  });

  it('validates options', () => {
    expect(rps.optionsSchema.safeParse({ rounds: 0 }).success).toBe(false);
    expect(rps.optionsSchema.safeParse({ rounds: 10 }).success).toBe(false);
    expect(rps.optionsSchema.parse(rps.defaultOptions(4))).toEqual({ rounds: 3 });
  });

  it('is deterministic: same seed and actions give the same state', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      let s = rps.setup({ playerIds: ids, options: { rounds: 3 }, rng });
      while (!rps.getResult(s)) {
        for (const id of ids)
          s = rps.applyAction(s, id, { type: 'pick', pick: rng.pick(PICKS) }, rng);
      }
      return s;
    };
    expect(run(7)).toEqual(run(7));
  });
});

describe('hidden information', () => {
  /**
   * Indistinguishability: if two states differ only in player X's unrevealed pick, every other
   * player's view and the table view must be identical. Checked at every step of random games.
   */
  it('no view reveals another player’s unrevealed pick', () => {
    const rng = createRng(2024);
    const players = ['a', 'b', 'c', 'd'];
    for (let game = 0; game < 20; game++) {
      let s = rps.setup({ playerIds: players, options: { rounds: 3 }, rng });
      while (!rps.getResult(s)) {
        for (const x of Object.keys(s.picks)) {
          for (const alt of PICKS) {
            const twin: RpsState = { ...s, picks: { ...s.picks, [x]: alt } };
            expect(rps.getTableView(twin)).toEqual(rps.getTableView(s));
            for (const viewer of players.filter((p) => p !== x)) {
              expect(rps.getPlayerView(twin, viewer)).toEqual(rps.getPlayerView(s, viewer));
            }
          }
        }
        const who = rng.pick(players.filter((p) => !(p in s.picks)));
        s = rps.applyAction(s, who, { type: 'pick', pick: rng.pick(PICKS) }, rng);
      }
    }
  });

  it('shows a player their own pick and only who has picked otherwise', () => {
    const s = pick(pick(fresh(), 'a', 'rock'), 'b', 'paper');
    const view = rps.getPlayerView(s, 'a');
    expect(view.myPick).toBe('rock');
    expect(view.picked).toEqual(['a', 'b']);
    expect(JSON.stringify(rps.getTableView(s))).not.toMatch(/rock|paper/);
  });
});
