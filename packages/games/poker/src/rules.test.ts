import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { bestHand, compareScore, handName, scoreFive, startingHandName } from './cards';
import {
  DEAL_AFTER_MS,
  choices,
  lastHandPlayed,
  poker as game,
  type PokerAction,
  type PokerOptions,
  type PokerState,
} from './rules';

const ids = ['a', 'b', 'c'];
const opts = (o: Partial<PokerOptions> = {}): PokerOptions => ({
  ...game.defaultOptions(3),
  ...o,
});
const deal = (players = ids, o: Partial<PokerOptions> = {}, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: PokerState, who: string, a: PokerAction, seed = 2) =>
  game.applyAction(s, who, a, createRng(seed), 0);
const total = (s: PokerState) =>
  Object.values(s.stacks).reduce((x, y) => x + y, 0) +
  Object.values(s.committed).reduce((x, y) => x + y, 0) *
    (s.phase === 'done' || s.phase === 'over' ? 0 : 1);

/** Everyone calls or checks until the hand ends. */
function passive(s: PokerState): PokerState {
  let cur = s;
  for (let i = 0; i < 100 && cur.toAct; i++) {
    const c = choices(game.getTableView(cur), cur.toAct);
    cur = act(cur, cur.toAct, { type: c.canCheck ? 'check' : 'call' });
  }
  return cur;
}

describe('hand ranking', () => {
  const cat = (cards: string) => scoreFive(cards.split(' '))[0];
  it('ranks every category', () => {
    expect(cat('As Ks Qs Js Ts')).toBe(8);
    expect(cat('9c 9d 9h 9s 2c')).toBe(7);
    expect(cat('Kc Kd Kh 5s 5c')).toBe(6);
    expect(cat('2h 7h 9h Jh Ah')).toBe(5);
    expect(cat('5c 6d 7h 8s 9c')).toBe(4);
    expect(cat('Ac 2d 3h 4s 5c')).toBe(4);
    expect(cat('Qc Qd Qh 4s 2c')).toBe(3);
    expect(cat('Jc Jd 4h 4s Ac')).toBe(2);
    expect(cat('Tc Td 4h 8s Ac')).toBe(1);
    expect(cat('2c 5d 9h Js Kc')).toBe(0);
  });
  it('breaks ties on kickers, and the wheel is the lowest straight', () => {
    const s = (c: string) => scoreFive(c.split(' '));
    expect(compareScore(s('Ac Ad 9h 8s 2c'), s('Ah As 9d 7s 6c'))).toBeGreaterThan(0);
    expect(compareScore(s('Ac 2d 3h 4s 5c'), s('2c 3d 4h 5s 6c'))).toBeLessThan(0);
    expect(compareScore(s('Kc Kd 4h 4s Ac'), s('Kh Ks 4c 4d Ad'))).toBe(0);
  });
  it('finds the best five of seven and names it', () => {
    const b = bestHand('Ah Kh 2c 7h Th 3h 9d'.split(' '));
    expect(b.name).toBe('Flush, ace high');
    expect(b.cards).toHaveLength(5);
    expect(handName(scoreFive('Kc Kd Kh 5s 5c'.split(' ')))).toBe('Full house, kings over fives');
    expect(handName(scoreFive('Ts Js Qs Ks As'.split(' ')))).toBe('Royal flush');
    expect(startingHandName(['7c', '7h'])).toBe('A pair of sevens');
    expect(startingHandName(['6d', 'Ad'])).toBe('Ace and six, same suit');
    expect(startingHandName(['Jc', 'Kh'])).toBe('King and jack, different suits');
  });
});

describe('dealing a hand', () => {
  it('posts the blinds, deals two cards each and starts left of the big blind', () => {
    const s = deal();
    expect(s.hand).toBe(1);
    expect(s.phase).toBe('preflop');
    for (const id of ids) expect(s.hole[id]).toHaveLength(2);
    expect(s.deck).toHaveLength(52 - 6);
    expect(s.bets[s.sbSeat!]).toBe(10);
    expect(s.bets[s.bbSeat]).toBe(20);
    // Three players: the button acts first before the flop.
    expect(s.toAct).toBe(s.dealer);
    expect(total(s)).toBe(3000);
  });

  it('heads-up, the button posts the small blind and acts first, then last after the flop', () => {
    let s = deal(['a', 'b']);
    expect(s.sbSeat).toBe(s.dealer);
    expect(s.toAct).toBe(s.dealer);
    s = act(s, s.dealer, { type: 'call' });
    s = act(s, s.bbSeat, { type: 'check' });
    expect(s.phase).toBe('flop');
    expect(s.board).toHaveLength(3);
    expect(s.toAct).toBe(s.bbSeat);
  });

  it('never shows a hand or the deck to the table, and each player only their own cards', () => {
    const s = deal();
    const table = JSON.stringify(game.getTableView(s));
    for (const id of ids) for (const c of s.hole[id]!) expect(table).not.toContain(`"${c}"`);
    expect(table).not.toMatch(/"(deck|hole)"/);
    const mine = game.getPlayerView(s, 'a');
    expect(mine.hole).toEqual(s.hole['a']);
    const json = JSON.stringify(mine);
    for (const id of ['b', 'c']) for (const c of s.hole[id]!) expect(json).not.toContain(`"${c}"`);
  });
});

describe('betting', () => {
  it('only lets the player to act move, and refuses checks facing a bet', () => {
    const s = deal();
    const other = ids.find((id) => id !== s.toAct)!;
    expect(() => act(s, other, { type: 'fold' })).toThrow(GameError);
    expect(() => act(s, s.toAct!, { type: 'check' })).toThrow(/call 20/);
  });

  it('needs raises of at least the last full raise', () => {
    let s = deal();
    expect(() => act(s, s.toAct!, { type: 'raise', to: 30 })).toThrow(/smallest raise is to 40/);
    s = act(s, s.toAct!, { type: 'raise', to: 60 });
    expect(s.currentBet).toBe(60);
    expect(s.minRaise).toBe(40);
    expect(() => act(s, s.toAct!, { type: 'raise', to: 90 })).toThrow(/to 100/);
  });

  it('a short all-in does not reopen the betting for someone who already acted', () => {
    let s = deal();
    const [first, second, third] = [s.dealer, s.sbSeat!, s.bbSeat];
    s = { ...s, stacks: { ...s.stacks, [second]: 65 } }; // 10 posted + 65 behind = 75 all in
    s = act(s, first, { type: 'raise', to: 60 });
    s = act(s, second, { type: 'allIn' }); // to 75: only 15 more than 60, a short raise
    expect(s.currentBet).toBe(75);
    s = act(s, third, { type: 'call' });
    expect(s.toAct).toBe(first);
    expect(choices(game.getTableView(s), first).canRaise).toBe(false);
    expect(() => act(s, first, { type: 'raise', to: 200 })).toThrow(/only call or fold/);
    s = act(s, first, { type: 'call' });
    expect(s.phase).toBe('flop');
  });

  it('a fold to a bet gives the pot to the last player in, shows nothing, and returns the uncalled bet', () => {
    let s = deal();
    const bettor = s.toAct!;
    s = act(s, bettor, { type: 'raise', to: 100 });
    s = act(s, s.toAct!, { type: 'fold' });
    s = act(s, s.toAct!, { type: 'fold' });
    expect(s.phase).toBe('done');
    expect(s.last!.showdown).toBe(false);
    expect(s.last!.shown).toEqual({});
    // The 100 bet was only "called" by the 20 big blind: 80 comes straight back.
    expect(s.last!.pots).toEqual([
      { amount: 20 + 20 + 10, winners: [bettor], hand: 'Everyone else folded' },
    ]);
    expect(s.stacks[bettor]).toBe(1000 + 30);
    expect(total(s)).toBe(3000);
  });

  it('checks around to a showdown and pays the best hand', () => {
    let s = deal();
    s = {
      ...s,
      hole: { a: ['Ah', 'Ad'], b: ['2c', '7d'], c: ['3s', '8h'] },
      deck: ['Ac', 'Ks', '9d', '5h', 'Jc', ...s.deck.slice(5)],
    };
    s = passive(s);
    expect(s.phase).toBe('done');
    expect(s.last!.showdown).toBe(true);
    expect(s.last!.pots[0]!.winners).toEqual(['a']);
    expect(s.last!.hands['a']).toBe('Three aces');
    expect(s.stacks['a']).toBe(1040);
    expect(Object.keys(s.last!.shown).sort()).toEqual(ids);
  });

  it('splits side pots by who could win them', () => {
    let s = deal();
    // a is short and has the best hand, b is next best, c is worst.
    s = {
      ...s,
      stacks: {
        a: 100 - (s.committed['a'] ?? 0),
        b: 300 - (s.committed['b'] ?? 0),
        c: 1000 - (s.committed['c'] ?? 0),
      },
      hole: { a: ['Ah', 'Ad'], b: ['Kh', 'Kd'], c: ['2s', '7c'] },
      deck: ['As', 'Kc', '9d', '5h', 'Jc', ...s.deck.slice(5)],
    };
    for (let i = 0; i < 6 && s.toAct; i++) s = act(s, s.toAct, { type: 'allIn' });
    expect(s.phase).toBe('done');
    const pots = s.last!.pots;
    expect(pots[0]).toMatchObject({ amount: 300, winners: ['a'] });
    expect(pots[1]).toMatchObject({ amount: 400, winners: ['b'] });
    // c's extra 700 was never called and went straight back.
    expect(s.stacks).toEqual({ a: 300, b: 400, c: 700 });
  });
});

describe('the game', () => {
  it('waits for a deal between hands and moves the button', () => {
    let s = passive(deal());
    expect(() => act(s, 'a', { type: 'fold' })).toThrow(/no hand/);
    const button = s.dealer;
    s = act(s, 'b', { type: 'deal' });
    expect(s.hand).toBe(2);
    expect(s.dealer).not.toBe(button);
  });

  it('deals once when several phones send the deal for the same hand', () => {
    let s = passive(deal());
    s = act(s, 'b', { type: 'deal', after: 1 });
    const again = act(s, 'c', { type: 'deal', after: 1 });
    expect(again).toBe(s);
    expect(s.hand).toBe(2);
  });

  it('deals the next hand by itself a few seconds after one ends', () => {
    const at = (s: PokerState, who: string, a: PokerAction, now: number) =>
      game.applyAction(s, who, a, createRng(2), now);
    let s = deal();
    expect(game.nextTimer!(s)).toBeNull();
    for (let i = 0; i < 100 && s.toAct; i++) {
      const c = choices(game.getTableView(s), s.toAct);
      s = at(s, s.toAct, { type: c.canCheck ? 'check' : 'call' }, 1000);
    }
    expect(s.phase).toBe('done');
    expect(game.nextTimer!(s)).toEqual({ id: 'deal', at: 1000 + DEAL_AFTER_MS });
    expect(game.getTableView(s).dealAt).toBe(1000 + DEAL_AFTER_MS);
    s = game.onTimer!(s, 'deal', createRng(3), 1000 + DEAL_AFTER_MS);
    expect(s.hand).toBe(2);
    expect(s.phase).toBe('preflop');
    expect(game.nextTimer!(s)).toBeNull();
  });

  it('with a turn timer, a player out of time checks if they can, or folds', () => {
    let s = deal(ids, { turnTimer: '30 seconds' });
    const first = s.toAct!;
    expect(game.nextTimer!(s)).toEqual({ id: 'act', at: 30_000 });
    // Facing the big blind, the first player folds when time runs out.
    s = game.onTimer!(s, 'act', createRng(3), 30_000);
    expect(s.folded).toContain(first);
    expect(game.nextTimer!(s)).toEqual({ id: 'act', at: 60_000 });
    // A move restarts the clock for the next player.
    const c = choices(game.getTableView(s), s.toAct!);
    s = game.applyAction(
      s,
      s.toAct!,
      { type: c.canCheck ? 'check' : 'call' },
      createRng(4),
      40_000,
    );
    if (s.toAct) expect(game.nextTimer!(s)!.at).toBe(70_000);
  });

  it('lets a busted player buy back in once, early in the game', () => {
    let s = deal(['a', 'b', 'c'], { buyBack: 'Once each', length: '30 hands' });
    s = passive(s);
    s = { ...s, stacks: { ...s.stacks, a: 0 } };
    expect(game.getTableView(s).canBuyBack).toEqual(['a']);
    expect(() => act(s, 'b', { type: 'buyBack' })).toThrow(/can’t buy back/);
    s = act(s, 'a', { type: 'buyBack' });
    expect(s.stacks.a).toBe(1000);
    expect(s.buyIns).toEqual({ a: 1 });
    s = { ...s, stacks: { ...s.stacks, a: 0 } };
    expect(game.getTableView(s).canBuyBack).toEqual([]);
    expect(deal(ids).buyBackLimit).toBe(0);
  });

  it('doubles the blinds on schedule', () => {
    let s = deal(ids, { blindsDouble: 'Every 5 hands' });
    for (let h = 1; h <= 5; h++) s = act(passive(s), 'a', { type: 'deal' });
    expect(s.hand).toBe(6);
    expect([s.sb, s.bb]).toEqual([20, 40]);
  });

  it('ends after the agreed hands, most chips winning', () => {
    let s = deal(ids, { length: '15 hands' });
    for (let h = 1; h < 15; h++) s = act(passive(s), 'a', { type: 'deal' });
    s = passive(s);
    expect(lastHandPlayed(game.getTableView(s))).toBe(true);
    expect(game.getResult(s)).toBeNull();
    s = act(s, 'a', { type: 'deal' });
    const r = game.getResult(s)!;
    expect(r).not.toBeNull();
    expect(r.standings).toHaveLength(3);
    expect(r.summary).not.toMatch(/\{/);
    expect(r.highlights).toEqual([
      expect.objectContaining({ award: 'Biggest pot', playerIds: [s.biggest!.player] }),
    ]);
  });

  it('plays random games to the end without losing a chip', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rng = createRng(seed);
      const players = ['a', 'b', 'c', 'd', 'e'].slice(0, 2 + (seed % 4));
      let s = game.setup({
        playerIds: players,
        options: opts({ stack: '500', length: 'Last one standing', blindsDouble: 'Every 5 hands' }),
        rng,
        now: 0,
      });
      const chips = players.length * 500;
      for (let step = 0; step < 5000 && s.phase !== 'over'; step++) {
        if (s.phase === 'done') {
          expect(Object.values(s.stacks).reduce((x, y) => x + y, 0)).toBe(chips);
          s = game.applyAction(s, players[0]!, { type: 'deal' }, rng, 0);
          continue;
        }
        const who = s.toAct!;
        const c = choices(game.getTableView(s), who);
        const roll = rng.int(10);
        const a: PokerAction =
          roll === 0 && !c.canCheck
            ? { type: 'fold' }
            : roll === 1 && c.canRaise
              ? { type: 'allIn' }
              : roll < 4 && c.canRaise
                ? { type: 'raise', to: c.minTo }
                : { type: c.canCheck ? 'check' : 'call' };
        s = game.applyAction(s, who, a, rng, 0);
      }
      expect(s.phase).toBe('over');
      expect(players.filter((id) => s.stacks[id]! > 0)).toHaveLength(1);
      expect(game.getResult(s)!.winners).toHaveLength(1);
    }
  });
});
