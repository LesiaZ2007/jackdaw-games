import { createRng, GameError, type BotLevel } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { DECK, RANKS, type Card, type Suit } from './cards';
import {
  actionSchema,
  canMove,
  cardsLeft,
  movesFor,
  reachable,
  setup,
  solitaire as game,
  type Column,
  type Foundation,
  type Seat,
  type SolitaireAction,
  type SolitaireState,
} from './rules';

// ── Helpers ───────────────────────────────────────────────────────────────────

const col = (up: Card[] = [], down: Card[] = []): Column => ({ down, up });

/** A seat with the given columns (the rest empty). */
function seat(o: { cols?: Column[]; stock?: Card[]; waste?: Card[] } = {}): Seat {
  const cols = [...(o.cols ?? [])];
  while (cols.length < 7) cols.push(col());
  return { stock: o.stock ?? [], waste: o.waste ?? [], cols, played: 0, movedAt: 0 };
}

/** A seat that can always play (an ace on the waste) and never runs out of cards. */
const busy = () => seat({ cols: [col(['Kd'])], waste: ['Ac'] });

/** A foundation of `suit` built up to `n` cards by `by`. */
function found(suit: Suit, n: number, by: string): Foundation {
  return {
    suit,
    cards: [...RANKS].slice(0, n).map((r) => r + suit),
    by: Array<string>(n).fill(by),
  };
}

/** A game in progress with exactly these seats and foundations. */
function table(
  seats: Record<string, Seat>,
  foundations: Foundation[] = [],
  draw: 1 | 3 = 1,
): SolitaireState {
  return {
    players: Object.keys(seats),
    draw,
    seats,
    foundations,
    pulls: 0,
    pull: null,
    ups: 0,
    last: null,
    over: false,
    winners: [],
    blocked: false,
    startedAt: 1_000,
    endedAt: null,
    recap: [],
  };
}

const act = (s: SolitaireState, id: string, a: SolitaireAction, now = 2_000) =>
  game.applyAction(s, id, a, createRng(1), now);

function refused(fn: () => unknown): GameError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    return e as GameError;
  }
  throw new Error('expected a GameError');
}

const deal = (players: string[], draw: 'Draw one' | 'Draw three' = 'Draw one', seed = 1) =>
  game.setup({ playerIds: players, options: { draw }, rng: createRng(seed), now: 1_000 });

const same = (a: readonly string[]) => [...a].sort();

/** Every card a seat still owns plus what it has put up in the middle. */
function deckOf(s: SolitaireState, id: string): Card[] {
  const x = s.seats[id]!;
  return [
    ...x.stock,
    ...x.waste,
    ...x.cols.flatMap((c) => [...c.down, ...c.up]),
    ...s.foundations.flatMap((f) => f.cards.filter((_, i) => f.by[i] === id)),
  ];
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('setup', () => {
  it('has default options', () => {
    expect(game.defaultOptions(2)).toEqual({ draw: 'Draw one' });
    expect(game.optionsSchema.parse({ draw: 'Draw three' })).toEqual({ draw: 'Draw three' });
    expect(game.optionsSchema.safeParse({ draw: 'Draw five' }).success).toBe(false);
  });

  it('keeps all 52 cards of every deck, in the right places', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const players of [
        ['Wren', 'Rook'],
        ['Wren', 'Rook', 'Magpie', 'Robin'],
      ]) {
        const s = deal(players, 'Draw one', seed);
        for (const id of players) {
          expect(same(deckOf(s, id))).toEqual(same(DECK));
          expect(s.seats[id]!.cols).toHaveLength(7);
        }
      }
    }
  });

  it('lays seven columns with none to six face down', () => {
    // The deck backwards, so no ace lands face up and nothing is put up.
    const s = setup(['Wren', 'Rook'], 1, (d) => [...d].reverse(), 1_000);
    expect(s.pulls).toBe(0);
    expect(s.foundations).toEqual([]);
    for (const id of s.players) {
      const x = s.seats[id]!;
      expect(x.cols.map((c) => c.down.length)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(x.cols.every((c) => c.up.length === 1)).toBe(true);
      expect(x.stock).toHaveLength(24);
      expect(x.waste).toEqual([]);
      expect(cardsLeft(x)).toBe(52);
    }
  });

  it('puts the uncovered aces up in the middle, one foundation each', () => {
    // The deck in order: the ace of spades is the face-up card of the first column.
    const s = setup(['Wren', 'Rook'], 1, (d) => [...d], 1_000);
    expect(s.foundations).toEqual([
      { suit: 's', cards: ['As'], by: ['Wren'] },
      { suit: 's', cards: ['As'], by: ['Rook'] },
    ]);
    for (const id of s.players) {
      const x = s.seats[id]!;
      expect(x.played).toBe(1);
      expect(x.cols[0]).toEqual({ down: [], up: [] });
      expect(cardsLeft(x)).toBe(51);
    }
    expect(game.announce!(null, s)).toEqual([
      'Every deck is dealt and 2 aces are in the middle. Go!',
    ]);
  });

  it('leaves a covered ace covered when it is dealt', () => {
    // Column one: a covered ace of hearts under the face-up ace of spades.
    const s = setup(
      ['Wren'],
      1,
      () => {
        const d = DECK.filter((c) => c !== 'As' && c !== 'Ah');
        // Slots: 0 col0 up, 1 col1 down, 2 col1 up.
        return ['As', 'Ah', '5d', ...d.filter((c) => c !== '5d')];
      },
      1_000,
    );
    // Col 0 is the ace of spades; col 1 has the ace of hearts face down under the 5 of diamonds.
    expect(s.foundations[0]!.cards).toEqual(['As']);
    expect(s.foundations.some((f) => f.suit === 'h')).toBe(false);
    expect(s.seats.Wren!.cols[1]).toEqual({ down: ['Ah'], up: ['5d'] });
  });

  it('draws three when asked', () => {
    expect(deal(['Wren', 'Rook']).draw).toBe(1);
    expect(deal(['Wren', 'Rook'], 'Draw three').draw).toBe(3);
  });
});

// ── Draw ──────────────────────────────────────────────────────────────────────

describe('draw', () => {
  const base = (draw: 1 | 3, stock: Card[], waste: Card[] = []) =>
    table({ Wren: seat({ cols: [col(['Kd'])], stock, waste }), Magpie: busy() }, [], draw);

  it('turns one card', () => {
    const s = act(base(1, ['9c', '8c', '7c']), 'Wren', { type: 'draw' });
    expect(s.seats.Wren!.waste).toEqual(['7c']);
    expect(s.seats.Wren!.stock).toEqual(['9c', '8c']);
  });

  it('turns three cards, the last one on top', () => {
    const s = act(base(3, ['2c', '3c', '4c', '5c']), 'Wren', { type: 'draw' });
    expect(s.seats.Wren!.waste).toEqual(['5c', '4c', '3c']);
    expect(s.seats.Wren!.stock).toEqual(['2c']);
  });

  it('turns what is left when fewer than three remain', () => {
    const s = act(base(3, ['2c', '3c']), 'Wren', { type: 'draw' });
    expect(s.seats.Wren!.waste).toEqual(['3c', '2c']);
    expect(s.seats.Wren!.stock).toEqual([]);
  });

  it('turns the waste back over when the stock is gone, first drawn first again', () => {
    const turned = base(1, [], ['9c', '8c', '7c']);
    const s = act(turned, 'Wren', { type: 'draw' });
    expect(s.seats.Wren!.stock).toEqual(['7c', '8c', '9c']);
    expect(s.seats.Wren!.waste).toEqual([]);
    expect(act(s, 'Wren', { type: 'draw' }).seats.Wren!.waste).toEqual(['9c']);
  });

  it('refuses when both are empty', () => {
    expect(refused(() => act(base(1, [], []), 'Wren', { type: 'draw' })).code).toBe('empty');
  });

  it('refuses someone who is not playing', () => {
    expect(refused(() => act(base(1, ['9c']), 'Robin', { type: 'draw' })).code).toBe('not_playing');
  });
});

// ── Up ────────────────────────────────────────────────────────────────────────

describe('up', () => {
  it('starts a foundation with an ace', () => {
    const s = table({
      Wren: seat({ cols: [col(['Kd'])], waste: ['Ah'] }),
      Rook: busy(),
    });
    const n = act(s, 'Wren', { type: 'up', from: 'waste', card: 'Ah' });
    expect(n.foundations).toEqual([{ suit: 'h', cards: ['Ah'], by: ['Wren'] }]);
    expect(n.seats.Wren!.waste).toEqual([]);
    expect(n.seats.Wren!.played).toBe(1);
    expect(n.last).toEqual({ n: 1, by: 'Wren', card: 'Ah', pile: 0 });
    expect(n.seats.Wren!.movedAt).toBe(2_000);
  });

  it('builds on another player’s foundation', () => {
    const s = table({ Wren: seat({ cols: [col(['Kd'])], waste: ['3s'] }), Rook: busy() }, [
      found('s', 2, 'Rook'),
    ]);
    const n = act(s, 'Wren', { type: 'up', from: 'waste', card: '3s' });
    expect(n.foundations[0]!.cards).toEqual(['As', '2s', '3s']);
    expect(n.foundations[0]!.by).toEqual(['Rook', 'Rook', 'Wren']);
    expect(game.getTableView(n).foundations[0]).toMatchObject({ top: '3s', count: 3, by: 'Wren' });
  });

  it('refuses a card that does not go yet', () => {
    const s = table({ Wren: seat({ cols: [col(['Kd'])], waste: ['4s'] }), Rook: busy() }, [
      found('s', 2, 'Rook'),
    ]);
    const e = refused(() => act(s, 'Wren', { type: 'up', from: 'waste', card: '4s' }));
    expect(e.code).toBe('no_room');
    expect(e.message).not.toBe('Someone got there first.');
  });

  it('refuses a card that has already moved', () => {
    const s = table({
      Wren: seat({ cols: [col(['Kd']), col(['5d'])], waste: ['9c'] }),
      Rook: busy(),
    });
    expect(refused(() => act(s, 'Wren', { type: 'up', from: 'waste', card: 'Ah' })).code).toBe(
      'moved',
    );
    expect(refused(() => act(s, 'Wren', { type: 'up', from: 1, card: 'Ah' })).code).toBe('moved');
  });

  it('refuses a card with others on top of it', () => {
    const s = table({ Wren: seat({ cols: [col(['3c', '2h'])] }), Rook: busy() }, [
      found('c', 2, 'Rook'),
    ]);
    expect(refused(() => act(s, 'Wren', { type: 'up', from: 0, card: '3c' })).code).toBe('covered');
  });

  it('tells the second player racing for the same card that someone got there first', () => {
    const s = table(
      {
        Wren: seat({ cols: [col(['Kd'])], waste: ['2h'] }),
        Rook: seat({ cols: [col(['Kd'])], waste: ['2h'] }),
        Magpie: busy(),
      },
      [found('h', 1, 'Magpie')],
    );
    const n = act(s, 'Wren', { type: 'up', from: 'waste', card: '2h' });
    const e = refused(() => act(n, 'Rook', { type: 'up', from: 'waste', card: '2h' }));
    expect(e.code).toBe('no_room');
    expect(e.message).toBe('Someone got there first.');
    // Rook's card is still where it was.
    expect(n.seats.Rook!.waste).toEqual(['2h']);
  });

  it('turns the next covered card of the column face up', () => {
    const s = table(
      { Wren: seat({ cols: [col(['Kd']), col(['2s'], ['7c', '8c'])] }), Rook: busy() },
      [found('s', 1, 'Rook')],
    );
    const n = act(s, 'Wren', { type: 'up', from: 1, card: '2s' });
    expect(n.seats.Wren!.cols[1]).toEqual({ down: ['7c'], up: ['8c'] });
  });

  it('is announced when a king goes up', () => {
    const s = table({ Wren: seat({ cols: [col(['Kd'])], waste: ['Ks'] }), Rook: busy() }, [
      found('s', 12, 'Rook'),
    ]);
    const n = act(s, 'Wren', { type: 'up', from: 'waste', card: 'Ks' });
    expect(game.announce!(s, n)).toEqual(['{Wren} put the K♠ up.']);
  });
});

// ── Move ──────────────────────────────────────────────────────────────────────

describe('move', () => {
  it('moves a run, turning the covered card over', () => {
    const s = table({
      Wren: seat({ cols: [col(['9s', '8h', '7c'], ['Qc']), col([], []), col(['Td'])] }),
      Magpie: busy(),
    });
    const n = act(s, 'Wren', { type: 'move', from: 0, card: '9s', to: 2 });
    expect(n.seats.Wren!.cols[2]!.up).toEqual(['Td', '9s', '8h', '7c']);
    expect(n.seats.Wren!.cols[0]).toEqual({ down: [], up: ['Qc'] });
  });

  it('moves part of a run', () => {
    const s = table({
      Wren: seat({ cols: [col(['9s', '8h', '7c']), col(['9c'])] }),
      Magpie: busy(),
    });
    const n = act(s, 'Wren', { type: 'move', from: 0, card: '8h', to: 1 });
    expect(n.seats.Wren!.cols[0]!.up).toEqual(['9s']);
    expect(n.seats.Wren!.cols[1]!.up).toEqual(['9c', '8h', '7c']);
  });

  it('puts a king, and only a king, on an empty column', () => {
    const s = table({
      Wren: seat({ cols: [col(['Kh']), col(['5d']), col()] }),
      Magpie: busy(),
    });
    const n = act(s, 'Wren', { type: 'move', from: 0, card: 'Kh', to: 2 });
    expect(n.seats.Wren!.cols[2]!.up).toEqual(['Kh']);
    expect(n.seats.Wren!.cols[0]!.up).toEqual([]);
    expect(refused(() => act(s, 'Wren', { type: 'move', from: 1, card: '5d', to: 2 })).code).toBe(
      'no_fit',
    );
    // And a king doesn't go on a card.
    expect(refused(() => act(s, 'Wren', { type: 'move', from: 0, card: 'Kh', to: 1 })).code).toBe(
      'no_fit',
    );
  });

  it('refuses a card that does not fit, or the column it is on', () => {
    const s = table({
      Wren: seat({ cols: [col(['9s']), col(['9c']), col(['8d'])] }),
      Magpie: busy(),
    });
    // Same colour, same rank, wrong rank.
    for (const to of [1, 2]) {
      expect(refused(() => act(s, 'Wren', { type: 'move', from: 0, card: '9s', to })).code).toBe(
        'no_fit',
      );
    }
    expect(refused(() => act(s, 'Wren', { type: 'move', from: 0, card: '9s', to: 0 })).code).toBe(
      'same',
    );
  });

  it('moves the top of the waste', () => {
    const s = table({
      Wren: seat({ cols: [col(['9s'])], waste: ['3c', '8h'] }),
      Magpie: busy(),
    });
    const n = act(s, 'Wren', { type: 'move', from: 'waste', card: '8h', to: 0 });
    expect(n.seats.Wren!.cols[0]!.up).toEqual(['9s', '8h']);
    expect(n.seats.Wren!.waste).toEqual(['3c']);
  });

  it('refuses a card that has already moved', () => {
    const s = table({
      Wren: seat({ cols: [col(['9d'])], waste: ['8h'] }),
      Magpie: busy(),
    });
    expect(
      refused(() => act(s, 'Wren', { type: 'move', from: 'waste', card: '8s', to: 0 })).code,
    ).toBe('moved');
    expect(refused(() => act(s, 'Wren', { type: 'move', from: 3, card: '8s', to: 0 })).code).toBe(
      'moved',
    );
  });
});

// ── Reachable and moves ───────────────────────────────────────────────────────

describe('reachable', () => {
  const stock = ['9c', '8c', '7c', '6c', '5c', '4c'];

  it('shows every card when drawing one', () => {
    expect(same(reachable(stock, [], 1))).toEqual(same(stock));
    expect(same(reachable(['9c', '8c'], ['2c'], 1))).toEqual(same(['9c', '8c', '2c']));
  });

  it('skips cards when drawing three', () => {
    // Turned in threes the 6 and 9 come up, round after round; the others stay under.
    expect(same(reachable(stock, [], 3))).toEqual(['6c', '9c']);
  });

  it('shows nothing when there is nothing', () => {
    expect(reachable([], [], 1)).toEqual([]);
  });

  it('makes a seat stuck drawing three that could play drawing one', () => {
    const x = seat({ cols: [col(['Kd'])], stock });
    const fs = [{ suit: 'c' as const, count: 4 }];
    expect(canMove(x, fs, 1)).toBe(true);
    expect(canMove(x, fs, 3)).toBe(false);
  });
});

describe('movesFor', () => {
  const fs = [{ suit: 's' as const, count: 1 }];

  it('lists a card that goes up, from the waste or a column', () => {
    expect(
      movesFor(
        {
          waste: '2s',
          cols: [
            { down: 0, up: ['2s'] },
            { down: 0, up: ['Kd'] },
          ],
        },
        fs,
      ),
    ).toEqual([
      { type: 'up', from: 'waste', card: '2s' },
      { type: 'up', from: 0, card: '2s' },
    ]);
  });

  it('lists the waste card onto a column', () => {
    expect(movesFor({ waste: '8h', cols: [{ down: 0, up: ['9s'] }] }, [])).toEqual([
      { type: 'move', from: 'waste', card: '8h', to: 0 },
    ]);
  });

  it('leaves out shuffling a run for nothing', () => {
    const cols = [
      { down: 0, up: ['9s', '8h'] },
      { down: 0, up: ['Td'] },
    ];
    expect(movesFor({ cols }, [])).toEqual([]);
  });

  it('lists a run that turns a covered card over', () => {
    const cols = [
      { down: 2, up: ['9s', '8h'] },
      { down: 0, up: ['Td'] },
    ];
    expect(movesFor({ cols }, [])).toEqual([{ type: 'move', from: 0, card: '9s', to: 1 }]);
  });

  it('lists a move that frees a card for the middle', () => {
    const cols = [
      { down: 0, up: ['9s', '8h'] },
      { down: 0, up: ['9c'] },
    ];
    expect(movesFor({ cols }, [{ suit: 's', count: 8 }])).toEqual([
      { type: 'move', from: 0, card: '8h', to: 1 },
    ]);
  });

  it('lists a king to an empty column only when it turns a card over', () => {
    expect(
      movesFor(
        {
          cols: [
            { down: 0, up: ['Kh'] },
            { down: 0, up: [] },
          ],
        },
        [],
      ),
    ).toEqual([]);
    expect(
      movesFor(
        {
          cols: [
            { down: 1, up: ['Kh'] },
            { down: 0, up: [] },
          ],
        },
        [],
      ),
    ).toEqual([{ type: 'move', from: 0, card: 'Kh', to: 1 }]);
  });
});

// ── Stuck, pulling, blocked ───────────────────────────────────────────────────

/**
 * Wren can play the 9 of clubs onto the 10 of diamonds, and after that is stuck. Rook is stuck
 * already. Wren's longest column ends in the 8 of diamonds, Rook's in the jack of hearts.
 */
function stuckTable() {
  return table({
    Wren: seat({
      waste: ['9c'],
      cols: [col(['Td'], ['3c', 'Qd']), col(['Qs'], ['5h', '4d', '8d'])],
    }),
    Rook: seat({
      cols: [col(['9s'], ['2s', 'Jh']), col(['9c'], ['3d'])],
    }),
  });
}

describe('everyone stuck', () => {
  it('knows who is stuck and who is being waited on', () => {
    const s = stuckTable();
    const t = game.getTableView(s);
    expect(t.seats.Wren!.stuck).toBe(false);
    expect(t.seats.Rook!.stuck).toBe(true);
    expect(game.waitingOn!(s)).toEqual(['Wren']);
  });

  it('waits on nobody when nobody is stuck', () => {
    expect(game.waitingOn!(table({ Wren: busy(), Rook: busy() }))).toEqual([]);
  });

  it('waits on nobody when the game is over', () => {
    expect(game.waitingOn!({ ...stuckTable(), over: true })).toEqual([]);
  });

  it('has everyone pull a covered card until someone can play', () => {
    const before = stuckTable();
    const n = act(before, 'Wren', { type: 'move', from: 'waste', card: '9c', to: 0 });
    expect(n.over).toBe(false);
    // One pull: Wren's 8 of diamonds (longest column) and Rook's jack of hearts.
    expect(n.pulls).toBe(1);
    expect(n.pull).toEqual({ n: 1, cards: { Wren: '8d', Rook: 'Jh' } });
    expect(n.seats.Wren!.waste).toEqual(['8d']);
    expect(n.seats.Wren!.cols[1]!.down).toEqual(['5h', '4d']);
    expect(n.seats.Rook!.waste).toEqual(['Jh']);
    expect(n.seats.Rook!.cols[0]!.down).toEqual(['2s']);
    // Nothing else changed, and the covered cards stay covered.
    expect(cardsLeft(n.seats.Wren!)).toBe(cardsLeft(before.seats.Wren!));
    expect(cardsLeft(n.seats.Rook!)).toBe(cardsLeft(before.seats.Rook!));
    // Now Wren can play the 8 onto the 9, so the pulling stops.
    expect(game.getTableView(n).seats.Wren!.stuck).toBe(false);
    expect(game.getTableView(n).seats.Rook!.stuck).toBe(true);
    expect(game.announce!(before, n)).toEqual([
      'Everyone was stuck, so everyone pulled a covered card.',
    ]);
    expect(n.recap.at(-1)).toMatchObject({ round: 1, data: { cards: { Wren: '8d', Rook: 'Jh' } } });
  });

  it('pulls again and again, and says how many times', () => {
    // Nothing the pulled cards can do: kings pile up on nothing.
    const s = table({
      Wren: seat({
        waste: ['9c'],
        cols: [col(['Td'], ['2c', '3c', '4c']), col(['Qs'], ['5c', '6c', '7c'])],
      }),
      Rook: seat({ cols: [col(['9s'], ['2s', '3s'])] }),
    });
    const n = act(s, 'Wren', { type: 'move', from: 'waste', card: '9c', to: 0 });
    expect(n.pulls).toBeGreaterThan(1);
    expect(n.pull!.n).toBe(n.pulls);
    expect(game.announce!(s, n)[0]).toBe(
      `Everyone was stuck, so everyone pulled ${n.pulls} covered cards.`,
    );
  });

  describe('when nothing is left to pull', () => {
    const wren = () => seat({ waste: ['9c'], cols: [col(['Td']), col(['Qs'])] });

    it('ends blocked, fewest cards left wins', () => {
      const s = table({
        Wren: wren(),
        Rook: seat({ cols: [col(['9s']), col(['9c']), col(['Jh']), col(['7s'])] }),
      });
      const n = act(s, 'Wren', { type: 'move', from: 'waste', card: '9c', to: 0 }, 5_500);
      expect(n.over).toBe(true);
      expect(n.blocked).toBe(true);
      expect(n.winners).toEqual(['Wren']);
      expect(n.pulls).toBe(0);
      expect(n.endedAt).toBe(5_500);
      expect(game.announce!(s, n)).toEqual(['Nobody can play and there’s nothing left to pull.']);

      const r = game.getResult(n)!;
      expect(r.winners).toEqual(['Wren']);
      expect(r.summary).toBe('{Wren} had the fewest left: 3 cards.');
      expect(r.standings).toEqual([
        { playerId: 'Wren', outcome: 'win' },
        { playerId: 'Rook', outcome: 'loss' },
      ]);
      expect(r.reveal).toMatchObject({ left: { Wren: 3, Rook: 4 }, blocked: true, ms: 4_500 });
    });

    it('draws when the cards left are level', () => {
      const s = table({
        Wren: wren(),
        Rook: seat({ cols: [col(['9s']), col(['9c']), col(['Jh'])] }),
      });
      const n = act(s, 'Wren', { type: 'move', from: 'waste', card: '9c', to: 0 });
      expect(n.over).toBe(true);
      expect(n.winners).toEqual(['Wren', 'Rook']);
      const r = game.getResult(n)!;
      expect(r.summary).toBe('A tie on 3 cards left.');
      expect(r.standings).toEqual([
        { playerId: 'Wren', outcome: 'draw' },
        { playerId: 'Rook', outcome: 'draw' },
      ]);
    });

    it('still pulls for a player who has some left while another has none', () => {
      // Rook has nothing covered, Wren does; Wren pulls alone and the game goes on.
      const s = table({
        Wren: seat({ waste: ['9c'], cols: [col(['Td'], ['2c']), col(['Qs'], ['8d'])] }),
        Rook: seat({ cols: [col(['9s']), col(['Jh'])] }),
      });
      const n = act(s, 'Wren', { type: 'move', from: 'waste', card: '9c', to: 0 });
      expect(n.pull!.cards.Rook).toBeNull();
      expect(typeof n.pull!.cards.Wren).toBe('string');
    });
  });
});

// ── Winning ───────────────────────────────────────────────────────────────────

describe('winning', () => {
  const nearlyDone = () =>
    table(
      { Wren: seat({ cols: [col(['2s'])] }), Rook: seat({ cols: [col(['Kd']), col(['5c'])] }) },
      [found('s', 1, 'Rook')],
    );

  it('ends the game for the first to get rid of every card', () => {
    const s = nearlyDone();
    expect(game.getResult(s)).toBeNull();
    const n = act(s, 'Wren', { type: 'up', from: 0, card: '2s' }, 9_000);
    expect(n.over).toBe(true);
    expect(n.blocked).toBe(false);
    expect(n.winners).toEqual(['Wren']);
    expect(game.announce!(s, n)).toEqual(['{Wren} got rid of every card!']);

    const r = game.getResult(n)!;
    expect(r.winners).toEqual(['Wren']);
    expect(r.summary).toBe('{Wren} got rid of every card.');
    expect(r.standings).toEqual([
      { playerId: 'Wren', outcome: 'win' },
      { playerId: 'Rook', outcome: 'loss' },
    ]);
    expect(r.reveal).toEqual({
      left: { Wren: 0, Rook: 2 },
      played: { Wren: 1, Rook: 0 },
      blocked: false,
      pulls: 0,
      ms: 8_000,
    });
    expect(game.partialResult!(n)!.winners).toEqual(['Wren']);
  });

  it('has a partial result for whoever leads, none while all are level', () => {
    const s = nearlyDone();
    const p = game.partialResult!(s)!;
    expect(p.winners).toEqual(['Wren']);
    expect(p.summary).toBe('{Wren} had the fewest left: 1 card.');
    const level = table({ Wren: busy(), Rook: busy() });
    expect(game.partialResult!(level)).toBeNull();
  });

  it('refuses any action after the game is over', () => {
    const n = act(nearlyDone(), 'Wren', { type: 'up', from: 0, card: '2s' });
    for (const a of [
      { type: 'draw' },
      { type: 'up', from: 0, card: '5c' },
      { type: 'move', from: 0, card: '5c', to: 1 },
    ] as SolitaireAction[]) {
      expect(refused(() => act(n, 'Rook', a)).code).toBe('over');
    }
  });
});

// ── Leaks ─────────────────────────────────────────────────────────────────────

describe('what the views show', () => {
  // Diamonds below the face-up cards are the covered, stock and buried-waste ones.
  const secret = {
    Wren: ['3d', '4d', '5d', '6d', '7d', '2d'],
    Rook: ['8d', '9d', 'Td'],
  };
  const crafted = () =>
    table(
      {
        Wren: seat({
          cols: [col(['9s'], ['3d', '4d']), col(['8h'], ['5d']), col(['Kc'])],
          stock: ['6d', '7d'],
          waste: ['2d', 'Ts', 'Js', 'Qs'],
        }),
        Rook: seat({
          cols: [col(['Kh'], ['8d']), col(['Qh'])],
          stock: ['9d', 'Td'],
          waste: ['5s'],
        }),
      },
      [found('c', 1, 'Rook')],
      3,
    );

  it('never names a covered or stock card', () => {
    const s = crafted();
    const views = [
      game.getTableView(s),
      game.getPlayerView(s, 'Wren'),
      game.getPlayerView(s, 'Rook'),
    ];
    for (const v of views) {
      const json = JSON.stringify(v);
      for (const c of [...secret.Wren, ...secret.Rook]) expect(json).not.toContain(`"${c}"`);
    }
  });

  it('shows counts for the covered cards and the stock', () => {
    const t = game.getTableView(crafted());
    expect(t.seats.Wren).toMatchObject({
      stock: 2,
      wasteCount: 4,
      left: 12,
      cols: [
        { down: 2, up: ['9s'] },
        { down: 1, up: ['8h'] },
        { down: 0, up: ['Kc'] },
        { down: 0, up: [] },
        { down: 0, up: [] },
        { down: 0, up: [] },
        { down: 0, up: [] },
      ],
    });
    expect(t.seats.Rook).toMatchObject({ stock: 2, wasteCount: 1, waste: ['5s'], left: 6 });
  });

  it('shows only the top cards of the waste: three drawing three, one drawing one', () => {
    const s = crafted();
    expect(game.getTableView(s).seats.Wren!.waste).toEqual(['Ts', 'Js', 'Qs']);
    const one = { ...s, draw: 1 as const };
    expect(game.getTableView(one).seats.Wren!.waste).toEqual(['Qs']);
    expect(JSON.stringify(game.getTableView(one))).not.toContain('"Ts"');
  });

  it('gives a player view the same table, plus who they are', () => {
    const s = crafted();
    const v = game.getPlayerView(s, 'Rook');
    expect(v.me).toBe('Rook');
    expect(v.movedAt).toBe(0);
    expect(v).toMatchObject(game.getTableView(s));
  });

  it('only names face-up cards in a dealt game', () => {
    for (const seed of [1, 2, 3]) {
      for (const d of ['Draw one', 'Draw three'] as const) {
        const s = deal(['Wren', 'Rook', 'Magpie'], d, seed);
        const t = game.getTableView(s);
        const allowed = new Set<string>();
        for (const id of s.players) {
          const x = s.seats[id]!;
          x.cols.forEach((c) => c.up.forEach((u) => allowed.add(u)));
          x.waste.slice(-s.draw).forEach((u) => allowed.add(u));
        }
        s.foundations.forEach((f) => allowed.add(f.cards.at(-1)!));
        if (s.last) allowed.add(s.last.card);
        for (const c of Object.values(s.pull?.cards ?? {})) if (c) allowed.add(c);
        const named = JSON.stringify(t).match(/"[A2-9TJQK][shdc]"/g) ?? [];
        for (const m of named) expect(allowed.has(m.slice(1, 3))).toBe(true);
        for (const id of s.players) {
          expect(typeof t.seats[id]!.stock).toBe('number');
          t.seats[id]!.cols.forEach((c) => expect(typeof c.down).toBe('number'));
        }
      }
    }
  });
});

// ── The computer player ───────────────────────────────────────────────────────

describe('the computer player', () => {
  const birds = ['Wren', 'Rook', 'Magpie', 'Robin'];
  const CAP = 6_000;

  function playOut(n: number, level: BotLevel, seed: number, draw: 'Draw one' | 'Draw three') {
    const ids = birds.slice(0, n);
    const rng = createRng(seed * 31 + n);
    let s = game.setup({ playerIds: ids, options: { draw }, rng, now: 0 });
    let now = 0;
    let steps = 0;
    let moves = 0;
    while (!s.over && steps < CAP) {
      steps++;
      now += 5_000;
      let acted = false;
      for (const id of ids) {
        if (s.over) break;
        const a = game.bot!({
          playerId: id,
          playerIds: ids,
          view: game.getPlayerView(s, id),
          tableView: game.getTableView(s),
          rng,
          now,
          level,
        });
        if (!a) continue;
        s = game.applyAction(s, id, actionSchema.parse(a), rng, now);
        acted = true;
        moves++;
      }
      if (!acted && !s.over) {
        throw new Error(`stalled: every bot waits (${n} players, ${level}, seed ${seed})`);
      }
    }
    return { s, steps, moves };
  }

  for (const level of ['easy', 'normal', 'hard'] as const) {
    for (const n of [2, 3, 4]) {
      it(`finishes games of ${n} ${level} bots without an illegal move`, () => {
        for (const seed of [1, 2, 3]) {
          const draw = seed % 2 ? 'Draw one' : 'Draw three';
          const { s, steps } = playOut(n, level, seed, draw);
          expect(s.over, `not over after ${steps} steps (seed ${seed}, ${draw})`).toBe(true);
          const r = game.getResult(s)!;
          expect(r.winners.length).toBeGreaterThan(0);
          if (!s.blocked) expect(cardsLeft(s.seats[s.winners[0]!]!)).toBe(0);
          for (const id of s.players) expect(same(deckOf(s, id))).toEqual(same(DECK));
        }
      });
    }
  }

  it('does nothing when the game is over or the player is stuck', () => {
    const s = stuckTable();
    const ask = (st: SolitaireState, id: string) =>
      game.bot!({
        playerId: id,
        playerIds: st.players,
        view: game.getPlayerView(st, id),
        tableView: game.getTableView(st),
        rng: createRng(1),
        now: 99_000,
        level: 'hard',
      });
    expect(ask(s, 'Rook')).toBeNull();
    expect(ask({ ...s, over: true }, 'Wren')).toBeNull();
    expect(ask(s, 'Wren')).toEqual({ type: 'move', from: 'waste', card: '9c', to: 0 });
  });
});
