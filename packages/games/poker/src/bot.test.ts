import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { FULL_DECK, bestHand, compareScore } from './cards';
import { botMove, choices, poker as game, type PokerOptions, type PokerState } from './rules';
import { equity, quickScore } from './strength';

const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'owl', 'crow', 'jay', 'kite'];

/**
 * An all-bot table, run the way the platform runs it: each bot in seat order is asked for a move
 * from its own view, the first one with a move plays it, and when none has one the next timer
 * (the next deal) fires.
 */
function playOut(count: number, options: Partial<PokerOptions>, seed: number, cap = 20_000) {
  const playerIds = birds.slice(0, count);
  const rng = createRng(seed);
  let now = 0;
  let s: PokerState = game.setup({
    playerIds,
    options: { ...game.defaultOptions(count), ...options },
    rng,
    now,
  });
  let moves = 0;
  while (!game.getResult(s)) {
    if (++moves > cap) throw new Error(`No result after ${cap} moves (hand ${s.hand})`);
    now += 1_100;
    const tableView = game.getTableView(s);
    let acted = false;
    for (const id of playerIds) {
      const action = game.bot!({
        playerId: id,
        playerIds,
        view: game.getPlayerView(s, id),
        tableView,
        rng,
        now,
      });
      if (!action) continue;
      game.actionSchema.parse(action);
      const next = game.applyAction(s, id, action, rng, now);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (acted) continue;
    const timer = game.nextTimer!(s);
    if (!timer) throw new Error(`Stuck at hand ${s.hand}, phase ${s.phase}`);
    now = Math.max(now, timer.at);
    s = game.onTimer!(s, timer.id, rng, now);
  }
  return { s, moves, result: game.getResult(s)! };
}

describe('the quick hand score', () => {
  it('ranks seven-card hands exactly as bestHand does', () => {
    const rng = createRng(11);
    for (let i = 0; i < 3000; i++) {
      const cards = rng.shuffle(FULL_DECK).slice(0, 9);
      const board = cards.slice(4);
      const a = [...cards.slice(0, 2), ...board];
      const b = [...cards.slice(2, 4), ...board];
      const slow = Math.sign(compareScore(bestHand(a).score, bestHand(b).score));
      expect(Math.sign(quickScore(a) - quickScore(b))).toBe(slow);
    }
  });

  it('gives aces more of the pot than seven-deuce', () => {
    const rng = createRng(1);
    expect(equity(['Ac', 'Ad'], [], 1, rng, 400)).toBeGreaterThan(0.75);
    expect(equity(['7c', '2d'], [], 1, rng, 400)).toBeLessThan(0.42);
  });
});

describe('the computer players', () => {
  const variants: Partial<PokerOptions>[] = [
    {},
    { length: '15 hands', blinds: '25/50', stack: '500', buyBack: 'Once each' },
    { length: 'Last one standing', blindsDouble: 'Every 5 hands', turnTimer: '30 seconds' },
    { length: 'Last one standing', blindsDouble: 'Never', buyBack: 'Any time', stack: '2000' },
  ];
  for (const count of [2, 5, 10]) {
    for (const [v, options] of variants.entries()) {
      it(`play a ${count}-player game to the end (variant ${v + 1})`, () => {
        for (const seed of [1, 2, 3]) {
          const { s, result } = playOut(count, options, seed * 97 + count);
          expect(s.phase).toBe('over');
          expect(result.winners.length).toBeGreaterThan(0);
          // No chips made or lost along the way.
          const chips = Object.values(s.stacks).reduce((a, b) => a + b, 0);
          const bought = Object.values(s.buyIns ?? {}).reduce((a, b) => a + b, 0);
          expect(chips).toBe((s.startStack ?? 0) * (count + bought));
        }
      });
    }
  }

  it('wait their turn, and leave the dealing to the table', () => {
    const s = game.setup({
      playerIds: ['wren', 'rook', 'magpie'],
      options: game.defaultOptions(3),
      rng: createRng(5),
      now: 0,
    });
    const waiting = ['wren', 'rook', 'magpie'].find((id) => id !== s.toAct)!;
    expect(botMove(game.getPlayerView(s, waiting), createRng(1))).toBeNull();
    let done = s;
    while (done.toAct) done = game.applyAction(done, done.toAct, { type: 'fold' }, createRng(1), 0);
    expect(done.phase).toBe('done');
    for (const id of done.players)
      expect(botMove(game.getPlayerView(done, id), createRng(1))).toBeNull();
  });

  it('fold junk to a big bet and raise aces', () => {
    const base = game.setup({
      playerIds: ['wren', 'rook'],
      options: game.defaultOptions(2),
      rng: createRng(8),
      now: 0,
    });
    const me = base.toAct!;
    const other = base.players.find((id) => id !== me)!;
    // Facing a shove with seven-deuce: fold every time.
    const shove: PokerState = {
      ...base,
      hole: { ...base.hole, [me]: ['7c', '2d'] },
      bets: { [me]: 10, [other]: 1000 },
      committed: { [me]: 10, [other]: 1000 },
      stacks: { [me]: 990, [other]: 0 },
      allIn: [other],
      currentBet: 1000,
      minRaise: 980,
      acted: [other],
    };
    for (let seed = 1; seed <= 20; seed++)
      expect(botMove(game.getPlayerView(shove, me), createRng(seed))).toEqual({ type: 'fold' });
    // Pocket aces before the flop: never fold, nearly always raise.
    const aces: PokerState = { ...base, hole: { ...base.hole, [me]: ['Ac', 'Ad'] } };
    let raises = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = botMove(game.getPlayerView(aces, me), createRng(seed))!;
      expect(a.type).not.toBe('fold');
      if (a.type === 'raise' || a.type === 'allIn') raises++;
    }
    expect(raises).toBeGreaterThan(14);
  });

  it('only ever bet a legal size', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = game.setup({
        playerIds: birds.slice(0, 6),
        options: game.defaultOptions(6),
        rng: createRng(seed),
        now: 0,
      });
      const v = game.getPlayerView(s, s.toAct!);
      const a = botMove(v, createRng(seed))!;
      const c = choices(v, v.me);
      if (a.type === 'raise') {
        expect(a.to).toBeGreaterThanOrEqual(c.minTo);
        expect(a.to).toBeLessThan(c.max);
      }
      expect(() => game.applyAction(s, v.me, a, createRng(1), 0)).not.toThrow();
    }
  });

  it('buy back in when they can', () => {
    const s = game.setup({
      playerIds: ['wren', 'rook', 'magpie'],
      options: { ...game.defaultOptions(3), buyBack: 'Once each' },
      rng: createRng(3),
      now: 0,
    });
    const busted: PokerState = {
      ...s,
      phase: 'done',
      toAct: null,
      stacks: { wren: 0, rook: 1500, magpie: 1500 },
    };
    expect(botMove(game.getPlayerView(busted, 'wren'), createRng(1))).toEqual({ type: 'buyBack' });
    expect(botMove(game.getPlayerView(busted, 'rook'), createRng(1))).toBeNull();
  });
});

describe('ending a game early', () => {
  const start = () =>
    game.setup({
      playerIds: ['wren', 'rook', 'magpie'],
      options: game.defaultOptions(3),
      rng: createRng(4),
      now: 0,
    });

  it('decides nothing before the first hand is over', () => {
    expect(game.partialResult!(start())).toBeNull();
  });

  it('gives it to the chip leader once a hand is done', () => {
    let s = start();
    // Everyone folds to the big blind, who wins the blinds.
    while (s.toAct) s = game.applyAction(s, s.toAct, { type: 'fold' }, createRng(1), 0);
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual([s.bbSeat]);
    expect(r.summary).toBe('Led 1,010 to 1,000 chips after 1 hand');
    expect(r.standings?.find((x) => x.playerId === s.bbSeat)?.outcome).toBe('win');
  });

  it('counts chips in the pot of a hand in progress as their owners’', () => {
    let s = start();
    while (s.toAct) s = game.applyAction(s, s.toAct, { type: 'fold' }, createRng(1), 0);
    const leader = s.bbSeat;
    s = game.onTimer!(s, 'deal', createRng(2), 10_000);
    expect(s.phase).toBe('preflop');
    // Someone shoves, nobody has called yet: the leader is still the leader.
    s = game.applyAction(s, s.toAct!, { type: 'allIn' }, createRng(1), 0);
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual([leader]);
    expect(r.summary).toMatch(/after 1 hand$/);
  });

  it('shares the win when the leaders are level', () => {
    const s: PokerState = {
      ...start(),
      phase: 'done',
      toAct: null,
      stacks: { wren: 1200, rook: 1200, magpie: 600 },
    };
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual(['wren', 'rook']);
    expect(r.summary).toBe('Level at 1,200 chips after 1 hand');
    expect(r.standings?.map((x) => x.outcome)).toEqual(['draw', 'draw', 'loss']);
  });
});
