import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HOUSE,
  SUITS,
  cardName,
  cardShort,
  fullDeck,
  houseValue,
  housePower,
  isJoker,
  isRed,
  cardValue,
  powerOf,
  type Suit,
} from './cards';
import {
  cambio as game,
  callerScore,
  houseConflict,
  houseOf,
  type CambioAction,
  type CambioOptions,
  type CambioState,
} from './rules';

const ids = ['wren', 'rook', 'magpie'];
const c = (rank: number, suit: Suit = 'S', second = false) =>
  SUITS.indexOf(suit) * 13 + (rank - 1) + (second ? 52 : 0);
const opts = (o: Partial<CambioOptions> = {}): CambioOptions => ({
  ...game.defaultOptions(3),
  ...o,
});
const deal = (o: Partial<CambioOptions> = {}, players = ids, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: CambioState, who: string, a: CambioAction, now = 0) =>
  game.applyAction(s, who, a, createRng(2), now);

const W = [c(2, 'S'), c(3, 'S'), c(4, 'S'), c(5, 'S')];
const R = [c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'H')];
const M = [c(10, 'D'), c(11, 'D'), c(12, 'D'), c(1, 'D')];

/** A round in play, wren to move, with these hands and the given cards on top of the stock. */
function table(
  hands: Record<string, number[]>,
  o: Partial<CambioOptions> = {},
  over: Partial<CambioState> = {},
  top: number[] = [],
): CambioState {
  const players = Object.keys(hands);
  const s = deal(o, players);
  const discard = [c(5, 'C')];
  const used = new Set([...Object.values(hands).flat(), ...discard, ...top]);
  return {
    ...s,
    phase: 'play',
    hands,
    stock: [...top, ...fullDeck(players.length, s.house.jokers).filter((i) => !used.has(i))],
    discard,
    known: Object.fromEntries(
      players.map((v) => [
        v,
        Object.fromEntries(players.map((x) => [x, [false, false, false, false]])),
      ]),
    ),
    toAct: players[0]!,
    step: 'start',
    holding: null,
    power: null,
    look: null,
    caller: null,
    turns: 1,
    ready: [],
    peekAt: null,
    ...over,
  };
}

/** `caller` has called and the last player is about to finish the round with a plain discard. */
function endOfRound(
  hands: Record<string, number[]>,
  caller: string,
  o: Partial<CambioOptions> = {},
  over: Partial<CambioState> = {},
) {
  const players = Object.keys(hands);
  const last = players[(players.indexOf(caller) + players.length - 1) % players.length]!;
  const filler = c(6, 'D', true);
  const s = table(hands, o, { caller, toAct: last, turns: 5, ...over }, [filler]);
  return act(act(s, last, { type: 'draw' }), last, { type: 'discard' }, 1000);
}

describe('house rules: the defaults are the traditional game', () => {
  it('resolve to DEFAULT_HOUSE and ride on both views', () => {
    const s = deal();
    expect(s.house).toEqual(DEFAULT_HOUSE);
    expect(houseOf(game.defaultOptions(3))).toEqual(DEFAULT_HOUSE);
    expect(game.getTableView(s).house).toEqual(DEFAULT_HOUSE);
    expect(game.getPlayerView(s, 'wren').house).toEqual(DEFAULT_HOUSE);
  });

  it('give every card the value and power it always had', () => {
    for (let id = 0; id < 104; id++) {
      expect(houseValue(id, DEFAULT_HOUSE)).toBe(cardValue(id));
      expect(housePower(id, DEFAULT_HOUSE)).toBe(powerOf(id));
    }
  });

  it('stay with the options the game started with, whatever the defaults say later', () => {
    const s = deal({ redKings: '-1', openingPeek: 'One' });
    expect(s.house.redKing).toBe(-1);
    expect(game.getTableView(s).house.peekSlots).toEqual([2]);
  });
});

describe('house rules: which cards give which power', () => {
  const powerAfterDiscard = (card: number, o: Partial<CambioOptions>) => {
    const s = table({ wren: W, rook: R, magpie: M }, o, {}, [card]);
    return act(act(s, 'wren', { type: 'draw' }), 'wren', { type: 'discard' });
  };

  it('moves the powers to other ranks', () => {
    const o = { peekCards: '9 and 10', spyCards: '7 and 8', swapCards: 'None' } as const;
    expect(powerAfterDiscard(c(9, 'C'), o).power?.kind).toBe('peek');
    expect(powerAfterDiscard(c(7, 'C'), o).power?.kind).toBe('spy');
    // Jacks no longer swap: the turn simply ends.
    const jack = powerAfterDiscard(c(11, 'C'), o);
    expect(jack.power).toBeNull();
    expect(jack.toAct).toBe('rook');
  });

  it('turns every power off with None', () => {
    const o = {
      peekCards: 'None',
      spyCards: 'None',
      swapCards: 'None',
      kingPower: 'None',
    } as const;
    for (const rank of [7, 8, 9, 10, 11, 12, 13]) {
      const s = powerAfterDiscard(c(rank, 'S'), o);
      expect(s.power, `rank ${rank}`).toBeNull();
      expect(s.toAct).toBe('rook');
    }
  });

  it('lets Jacks and Queens peek, or 7 and 8 swap, when asked', () => {
    expect(
      powerAfterDiscard(c(12, 'H'), { peekCards: 'Jack and Queen', swapCards: '7 and 8' }).power
        ?.kind,
    ).toBe('peek');
    expect(
      powerAfterDiscard(c(8, 'H'), { peekCards: 'Jack and Queen', swapCards: '7 and 8' }).power
        ?.kind,
    ).toBe('swap');
  });

  it('gives red Kings the look and swap with All Kings, and black Kings none with None', () => {
    expect(powerAfterDiscard(c(13, 'H'), {}).power).toBeNull();
    expect(powerAfterDiscard(c(13, 'H'), { kingPower: 'All Kings' }).power?.kind).toBe('king');
    expect(powerAfterDiscard(c(13, 'S'), { kingPower: 'None' }).power).toBeNull();
  });

  it('gives a joker nothing', () => {
    expect(powerAfterDiscard(104, { jokers: 'Two per deck' }).power).toBeNull();
  });
});

describe('house rules: validating the options', () => {
  it('accepts the defaults and any set of distinct cards', () => {
    expect(game.validateOptions!(game.defaultOptions(4), 4)).toBeNull();
    expect(
      game.validateOptions!(
        opts({ peekCards: 'Jack and Queen', spyCards: '7 and 8', swapCards: '9 and 10' }),
        4,
      ),
    ).toBeNull();
    expect(
      game.validateOptions!(opts({ peekCards: 'None', spyCards: 'None', swapCards: 'None' }), 4),
    ).toBeNull();
  });

  it('refuses two powers on the same cards, and says which', () => {
    expect(houseConflict(opts({ spyCards: '7 and 8' }))).toBe(
      'Peek and spy can’t both use 7 and 8. Pick different cards for one of them.',
    );
    expect(game.validateOptions!(opts({ swapCards: '9 and 10' }), 3)).toBe(
      'Spy and swap can’t both use 9 and 10. Pick different cards for one of them.',
    );
    expect(game.validateOptions!(opts({ peekCards: 'Jack and Queen' }), 3)).toBe(
      'Peek and swap can’t both use Jack and Queen. Pick different cards for one of them.',
    );
  });

  it('takes only known values', () => {
    expect(game.optionsSchema.safeParse(opts({ redKings: '5' as never })).success).toBe(false);
    for (const o of [
      opts({ redKings: '-1', callerPenalty: 'Double', callerBonus: '-5', jokers: 'Two per deck' }),
    ])
      expect(game.optionsSchema.parse(o)).toEqual(o);
  });
});

describe('house rules: what cards are worth', () => {
  it('values red Kings 0, -1 or 13', () => {
    const wren = [c(13, 'H'), c(13, 'D'), c(1, 'S'), c(1, 'C')];
    expect(endOfRound({ wren, rook: W, magpie: M }, 'wren').last!.totals.wren).toBe(2);
    expect(
      endOfRound({ wren, rook: W, magpie: M }, 'wren', { redKings: '-1' }).last!.totals.wren,
    ).toBe(0);
    expect(
      endOfRound({ wren, rook: W, magpie: M }, 'wren', { redKings: '13' }).last!.totals.wren,
    ).toBe(28);
  });

  it('keeps black Kings at 13 whatever red Kings are', () => {
    expect(houseValue(c(13, 'S'), houseOf(opts({ redKings: '-1' })))).toBe(13);
  });
});

describe('house rules: what a caller scores', () => {
  // wren 2+3+4+5 = 14 against rook 6+7+8+9 = 30
  const lose = (o: Partial<CambioOptions>) =>
    endOfRound({ wren: R, rook: W, magpie: M }, 'wren', o);
  const win = (o: Partial<CambioOptions>) => endOfRound({ wren: W, rook: R, magpie: M }, 'wren', o);

  it('adds 10, 5 or 20 when someone beats the caller', () => {
    expect(lose({}).scores.wren).toBe(40);
    expect(lose({ callerPenalty: '5' }).scores.wren).toBe(35);
    expect(lose({ callerPenalty: '20' }).scores.wren).toBe(50);
  });

  it('doubles the total with Double', () => {
    const s = lose({ callerPenalty: 'Double' });
    expect(s.last!.scored.wren).toBe(60);
    expect(s.scores.wren).toBe(60);
  });

  it('leaves a total of zero or less alone when doubling', () => {
    const house = houseOf(opts({ callerPenalty: 'Double' }));
    expect(callerScore(0, false, house)).toBe(0);
    expect(callerScore(-3, false, house)).toBe(-3);
    expect(callerScore(7, false, house)).toBe(14);
  });

  it('pays the winning caller 0, their total, or -5', () => {
    expect(win({}).scores.wren).toBe(0);
    expect(win({ callerBonus: 'Their total' }).scores.wren).toBe(14);
    const s = win({ callerBonus: '-5' });
    expect(s.scores.wren).toBe(-5);
    expect(s.last!.scored.wren).toBe(-5);
  });

  it('still counts a tie for the lowest as a win', () => {
    const rook = [c(5, 'H'), c(4, 'H'), c(3, 'H'), c(2, 'H')];
    const s = endOfRound({ wren: W, rook, magpie: M }, 'wren', { callerBonus: '-5' });
    expect(s.last!.callerWon).toBe(true);
    expect(s.scores.wren).toBe(-5);
  });
});

describe('house rules: negative totals and scores', () => {
  it('scores negative rounds and ranks them lowest first', () => {
    // Three red Kings at -1 and an ace: a total of -2.
    const wren = [c(13, 'H'), c(13, 'D'), c(13, 'H', true), c(1, 'S')];
    const s = endOfRound({ wren, rook: R, magpie: M }, 'wren', { redKings: '-1' });
    expect(s.last!.totals.wren).toBe(-2);
    expect(s.last!.callerWon).toBe(true);
    expect(s.scores.wren).toBe(0);
    // Another player scoring a negative total keeps it.
    const neg = endOfRound({ wren: W, rook: wren, magpie: M }, 'wren', { redKings: '-1' });
    expect(neg.last!.totals.rook).toBe(-2);
    expect(neg.last!.callerWon).toBe(false);
    expect(neg.scores.rook).toBe(-2);
    expect(neg.scores.wren).toBe(24);
  });

  it('keeps the lowest hand of the game and the winner right when scores go below zero', () => {
    const wren = [c(13, 'H'), c(13, 'D'), c(13, 'H', true), c(1, 'S')];
    let s = endOfRound({ wren: W, rook: wren, magpie: M }, 'wren', {
      goal: '3 rounds',
      redKings: '-1',
    });
    expect(s.lowest).toMatchObject({ player: 'rook', total: -2 });
    s = { ...s, round: 3 };
    s = game.onTimer!(s, 'next', createRng(4), 5000);
    expect(s.phase).toBe('over');
    const result = game.getResult(s)!;
    expect(result.winners).toEqual(['rook']);
    expect(result.summary).toBe('Lowest score: -2 points after 1 round');
    expect(result.highlights![0]!.text).toBe('-2 in round 1');
  });

  it('shares the win on a tie, negative or not', () => {
    const s0 = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', { goal: '3 rounds' });
    const tied = { ...s0, round: 3, scores: { wren: -4, rook: -4, magpie: 9 } };
    const over = game.onTimer!(tied, 'next', createRng(4), 5000);
    expect(game.getResult(over)!.winners.sort()).toEqual(['rook', 'wren']);
  });
});

describe('house rules: exactly 100', () => {
  const nineties = { scores: { wren: 90, rook: 20, magpie: 30 } };
  it('drops a player landing on 100 to 50, and the game goes on', () => {
    // rook (30) scores 30 on 70 = 100
    const s = endOfRound(
      { wren: W, rook: R, magpie: M },
      'wren',
      { exactly100: 'Drops to 50' },
      {
        scores: { wren: 5, rook: 70, magpie: 10 },
      },
    );
    expect(s.scores.rook).toBe(50);
    expect(s.last!.dropped).toEqual(['rook']);
    expect(s.last!.scored.rook).toBe(30);
    const next = game.onTimer!(s, 'next', createRng(4), 9000);
    expect(next.phase).toBe('peek');
    expect(next.round).toBe(2);
  });

  it('without the rule, 100 ends the game', () => {
    const s = endOfRound(
      { wren: W, rook: R, magpie: M },
      'wren',
      {},
      {
        scores: { wren: 5, rook: 70, magpie: 10 },
      },
    );
    expect(s.scores.rook).toBe(100);
    expect(s.last!.dropped).toBeUndefined();
    expect(game.onTimer!(s, 'next', createRng(4), 9000).phase).toBe('over');
  });

  it('ends the game on anyone else’s score over 100', () => {
    const s = endOfRound(
      { wren: W, rook: R, magpie: M },
      'wren',
      { exactly100: 'Drops to 50' },
      {
        scores: { wren: 5, rook: 70, magpie: 80 },
      },
    );
    expect(s.scores.rook).toBe(50);
    expect(s.scores.magpie).toBe(114);
    expect(game.onTimer!(s, 'next', createRng(4), 9000).phase).toBe('over');
  });

  it('does nothing in a game to 50 or a set number of rounds', () => {
    const o = { exactly100: 'Drops to 50' } as const;
    const a = endOfRound(
      { wren: W, rook: R, magpie: M },
      'wren',
      { ...o, goal: '5 rounds' },
      nineties,
    );
    const b = endOfRound(
      { wren: W, rook: R, magpie: M },
      'wren',
      { ...o, goal: 'First to 50' },
      {
        scores: { wren: 5, rook: 70, magpie: 10 },
      },
    );
    expect(a.last!.dropped).toBeUndefined();
    expect(b.scores.rook).toBe(100);
  });
});

describe('house rules: the opening peek', () => {
  it('shows two bottom cards by default, one with One, none with None', () => {
    const view = (o: Partial<CambioOptions>) => game.getPlayerView(deal(o), 'wren').grid.wren!;
    expect(view({}).map((x) => x !== null)).toEqual([false, false, true, true]);
    expect(view({ openingPeek: 'One' }).map((x) => x !== null)).toEqual([
      false,
      false,
      true,
      false,
    ]);
    expect(view({ openingPeek: 'None' }).every((x) => x === null)).toBe(true);
  });

  it('keeps the peek phase for Two and One', () => {
    expect(deal({ openingPeek: 'One' }).phase).toBe('peek');
    expect(deal({ openingPeek: 'One' }).peekAt).toBe(20_000);
  });

  it('skips the peek phase with None: the round goes straight to play', () => {
    const s = deal({ openingPeek: 'None' });
    expect(s.phase).toBe('play');
    expect(s.toAct).toBe(ids[(ids.indexOf(s.dealer) + 1) % 3]);
    expect(s.peekAt).toBeNull();
    expect(game.nextTimer!(s)).toBeNull();
    expect(game.waitingOn!(s)).toEqual([s.toAct]);
    // Ready is a harmless no-op.
    expect(act(s, 'wren', { type: 'ready' })).toBe(s);
  });

  it('also skips it in every later round', () => {
    let s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', { openingPeek: 'None' });
    s = game.onTimer!(s, 'next', createRng(4), 9000);
    expect(s.round).toBe(2);
    expect(s.phase).toBe('play');
    expect(s.toAct).not.toBeNull();
  });
});

describe('house rules: jokers', () => {
  it('adds two per deck, with ids that leave the old scheme alone', () => {
    expect(fullDeck(3)).toHaveLength(52);
    expect(fullDeck(3, true)).toHaveLength(54);
    expect(fullDeck(6, true)).toHaveLength(108);
    expect(fullDeck(3, true).filter(isJoker)).toEqual([104, 105]);
    expect(fullDeck(6, true).filter(isJoker)).toEqual([104, 105, 106, 107]);
  });

  it('are worth 0, black, with no power, and have their own name', () => {
    for (const id of [104, 107]) {
      expect(cardValue(id)).toBe(0);
      expect(isRed(id)).toBe(false);
      expect(powerOf(id)).toBeNull();
      expect(cardName(id)).toBe('Joker');
      expect(cardShort(id)).toBe('Jk');
    }
  });

  it('are in the deal only when asked for', () => {
    const count = (o: Partial<CambioOptions>) => {
      const s = deal(o);
      return s.stock.length + s.discard.length + 12;
    };
    expect(count({})).toBe(52);
    expect(count({ jokers: 'Two per deck' })).toBe(54);
    const s = deal({ jokers: 'Two per deck' }, [
      'wren',
      'rook',
      'magpie',
      'robin',
      'finch',
      'heron',
    ]);
    expect(s.stock.length + s.discard.length + 24).toBe(108);
  });
});
