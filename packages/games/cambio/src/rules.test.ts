import { createRng, GameError, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  SUITS,
  cardName,
  cardShort,
  cardValue,
  decksFor,
  fullDeck,
  isRed,
  powerOf,
  type Suit,
} from './cards';
import {
  CALLER_BONUS_LABELS,
  CALLER_PENALTY_LABELS,
  CALL_PENALTY,
  EXACTLY_100_LABELS,
  JOKER_LABELS,
  KING_POWER_LABELS,
  MEMORY_LABELS,
  NEXT_ROUND_MS,
  OPENING_PEEK_LABELS,
  RED_KING_LABELS,
  PEEK_MS,
  cambio as game,
  lastRoundPlayed,
  targets,
  type CambioAction,
  type CambioOptions,
  type CambioState,
} from './rules';

const ids = ['wren', 'rook', 'magpie'];
const opts = (o: Partial<CambioOptions> = {}): CambioOptions => ({
  ...game.defaultOptions(3),
  ...o,
});
const deal = (players = ids, o: Partial<CambioOptions> = {}, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: CambioState, who: string, a: CambioAction, now = 0, seed = 2) =>
  game.applyAction(s, who, a, createRng(seed), now);
const fails = (s: CambioState, who: string, a: CambioAction, code?: string) => {
  try {
    act(s, who, a);
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    if (code) expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${JSON.stringify(a)} to be refused`);
};

/** A card by rank (1 Ace to 13 King) and suit, from the first deck (or the second). */
const c = (rank: number, suit: Suit = 'S', second = false) =>
  SUITS.indexOf(suit) * 13 + (rank - 1) + (second ? 52 : 0);

const blank = (ps: string[]) =>
  Object.fromEntries(
    ps.map((v) => [v, Object.fromEntries(ps.map((o) => [o, [false, false, false, false]]))]),
  );
const knows = (s: CambioState, viewer: string, owner: string, slot: number) =>
  s.known[viewer]![owner]![slot]!;

// Hands with distinct cards: wren holds spades, rook hearts, magpie diamonds.
const W = [c(2, 'S'), c(3, 'S'), c(4, 'S'), c(5, 'S')];
const R = [c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'H')];
const M = [c(10, 'D'), c(11, 'D'), c(12, 'D'), c(1, 'D')];

/** A round in play with these hands, nobody knowing anything, a 5 of clubs on the pile. */
function table(
  hands: Record<string, number[]>,
  over: Partial<CambioState> = {},
  o: Partial<CambioOptions> = {},
): CambioState {
  const players = Object.keys(hands);
  const s = deal(players, o);
  const discard = over.discard ?? [c(5, 'C')];
  const used = new Set([...Object.values(hands).flat(), ...discard]);
  const stock = fullDeck(players.length).filter((i) => !used.has(i));
  return {
    ...s,
    phase: 'play',
    hands,
    stock,
    discard,
    known: blank(players),
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
const three = (over: Partial<CambioState> = {}, o: Partial<CambioOptions> = {}) =>
  table({ wren: W, rook: R, magpie: M }, over, o);

/** wren's turn with a card on top of the stock, drawn: wren is holding it. */
const holding = (card: number, over: Partial<CambioState> = {}) => {
  const s = three({ stock: [card, ...three().stock.filter((x) => x !== card)], ...over });
  return act(s, 'wren', { type: 'draw' });
};
/** wren has discarded a drawn card and may use its power. */
const powered = (card: number, over: Partial<CambioState> = {}) =>
  act(holding(card, over), 'wren', { type: 'discard' });

describe('cards', () => {
  it('counts Ace 1, 2 to 10 face value, Jack 11, Queen 12', () => {
    expect([c(1), c(2), c(9), c(10), c(11), c(12)].map(cardValue)).toEqual([1, 2, 9, 10, 11, 12]);
  });

  it('counts black Kings 13 and red Kings 0', () => {
    expect(cardValue(c(13, 'S'))).toBe(13);
    expect(cardValue(c(13, 'C'))).toBe(13);
    expect(cardValue(c(13, 'H'))).toBe(0);
    expect(cardValue(c(13, 'D'))).toBe(0);
  });

  it('knows red from black', () => {
    expect([isRed(c(4, 'H')), isRed(c(4, 'D')), isRed(c(4, 'S')), isRed(c(4, 'C'))]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('gives powers to 7 to Queen and black Kings only', () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => powerOf(c(r)))).toEqual(Array(6).fill(null));
    expect([7, 8].map((r) => powerOf(c(r)))).toEqual(['peek', 'peek']);
    expect([9, 10].map((r) => powerOf(c(r)))).toEqual(['spy', 'spy']);
    expect([11, 12].map((r) => powerOf(c(r, 'H')))).toEqual(['swap', 'swap']);
    expect(powerOf(c(13, 'S'))).toBe('king');
    expect(powerOf(c(13, 'C'))).toBe('king');
    expect(powerOf(c(13, 'H'))).toBeNull();
    expect(powerOf(c(13, 'D'))).toBeNull();
  });

  it('names cards, and a second deck repeats the first', () => {
    expect(cardName(c(12, 'H'))).toBe('Queen of hearts');
    expect(cardShort(c(10, 'S'))).toBe('10♠');
    expect(cardName(c(12, 'H', true))).toBe('Queen of hearts');
    expect(cardValue(c(13, 'H', true))).toBe(0);
  });

  it('uses one deck up to five players and two from six', () => {
    expect([2, 5, 6, 8].map(decksFor)).toEqual([1, 1, 2, 2]);
    expect(fullDeck(5)).toHaveLength(52);
    expect(fullDeck(6)).toHaveLength(104);
  });
});

describe('the deal', () => {
  it('deals four cards each and turns one up, with one deck for five players', () => {
    const s = deal(['a', 'b', 'c', 'd', 'e']);
    for (const id of s.players) expect(s.hands[id]).toHaveLength(4);
    expect(s.discard).toHaveLength(1);
    expect(s.stock).toHaveLength(52 - 20 - 1);
    const all = [...Object.values(s.hands).flat(), ...s.stock, ...s.discard];
    expect(new Set(all).size).toBe(52);
  });

  it('uses two decks for six players', () => {
    const s = deal(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(s.stock).toHaveLength(104 - 24 - 1);
    const all = [...Object.values(s.hands).flat(), ...s.stock, ...s.discard];
    expect(all).toHaveLength(104);
    expect(game.getTableView(s).decks).toBe(2);
  });

  it('seats up to eight', () => {
    const s = deal(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(s.stock).toHaveLength(104 - 32 - 1);
    expect(game.getTableView(s).decks).toBe(2);
  });

  it('starts every round in the peek phase with nobody to move', () => {
    const s = deal();
    expect(s.phase).toBe('peek');
    expect(s.round).toBe(1);
    expect(s.toAct).toBeNull();
    expect(s.scores).toEqual({ wren: 0, rook: 0, magpie: 0 });
  });

  it('is the same for the same seed', () => {
    expect(deal(ids, {}, 9)).toEqual(deal(ids, {}, 9));
    expect(deal(ids, {}, 9).hands).not.toEqual(deal(ids, {}, 10).hands);
  });
});

describe('the peek phase', () => {
  it('shows each player their two bottom cards and nothing else', () => {
    const s = deal();
    for (const id of ids) {
      const v = game.getPlayerView(s, id);
      expect(v.grid[id]!.map((x) => x !== null)).toEqual([false, false, true, true]);
      expect(v.grid[id]![2]).toBe(s.hands[id]![2]);
      expect(v.grid[id]![3]).toBe(s.hands[id]![3]);
      for (const other of ids.filter((o) => o !== id)) {
        expect(v.grid[other]).toEqual([null, null, null, null]);
      }
    }
  });

  it('shows the table no faces but the top of the pile', () => {
    const t = game.getTableView(deal());
    expect(t.hands).toBeNull();
    expect(t.top).not.toBeNull();
    expect(JSON.stringify(t)).not.toMatch(/"grid"|"known"|"stock"/);
  });

  it('starts play when everyone is ready, with the seat after the dealer to move', () => {
    let s = deal();
    for (const id of ids.slice(0, 2)) s = act(s, id, { type: 'ready' });
    expect(s.phase).toBe('peek');
    expect(s.ready).toEqual(['wren', 'rook']);
    s = act(s, 'magpie', { type: 'ready' });
    expect(s.phase).toBe('play');
    expect(s.toAct).toBe(ids[(ids.indexOf(s.dealer) + 1) % 3]);
    expect(s.peekAt).toBeNull();
  });

  it('ends by itself after 20 seconds', () => {
    const s = deal();
    expect(s.peekAt).toBe(PEEK_MS);
    expect(PEEK_MS).toBe(20_000);
    expect(game.nextTimer!(s)).toEqual({ id: 'peek', at: PEEK_MS });
    const n = game.onTimer!(s, 'peek', createRng(3), PEEK_MS);
    expect(n.phase).toBe('play');
    expect(game.nextTimer!(n)).toBeNull();
  });

  it('counts a second ready as nothing, and a late one too', () => {
    const s = act(deal(), 'wren', { type: 'ready' });
    expect(act(s, 'wren', { type: 'ready' })).toBe(s);
    const playing = game.onTimer!(s, 'peek', createRng(3), 1);
    expect(act(playing, 'rook', { type: 'ready' })).toBe(playing);
  });

  it('refuses moves until the peek is over', () => {
    const s = deal();
    fails(s, 'wren', { type: 'draw' }, 'peeking');
    fails(s, 'wren', { type: 'call' }, 'peeking');
  });

  it('keeps what you saw as a note once play starts', () => {
    const s = game.onTimer!(deal(), 'peek', createRng(3), 1);
    const v = game.getPlayerView(s, 'wren');
    expect(v.grid.wren![2]).toBe(s.hands.wren![2]);
    expect(v.grid.wren![0]).toBeNull();
    expect(v.grid.rook).toEqual([null, null, null, null]);
  });

  it('waits on whoever is not ready', () => {
    const s = act(deal(), 'rook', { type: 'ready' });
    expect(game.waitingOn!(s)).toEqual(['wren', 'magpie']);
  });
});

describe('a turn', () => {
  it('belongs to the player to move', () => {
    fails(three(), 'rook', { type: 'draw' }, 'not_your_turn');
    fails(three(), 'nobody', { type: 'draw' }, 'not_playing');
  });

  it('draw: only the drawer sees the card', () => {
    const s = holding(c(4, 'C'));
    expect(game.getPlayerView(s, 'wren').held).toBe(c(4, 'C'));
    expect(game.getPlayerView(s, 'rook').held).toBeNull();
    const t = game.getTableView(s);
    expect(t.holding).toEqual({ from: 'stock', card: null });
    expect(JSON.stringify(t)).not.toContain(`"card":${c(4, 'C')},"from"`);
    expect(s.stock).toHaveLength(three().stock.length - 1);
  });

  it('keep: the drawn card replaces one of yours and the old one goes on the pile', () => {
    const s = act(holding(c(4, 'C')), 'wren', { type: 'keep', slot: 1 });
    expect(s.hands.wren).toEqual([W[0], c(4, 'C'), W[2], W[3]]);
    expect(s.discard.at(-1)).toBe(W[1]);
    expect(s.toAct).toBe('rook');
    expect(s.step).toBe('start');
    expect(s.holding).toBeNull();
  });

  it('keep: you know the new card, and nobody else does', () => {
    let s = holding(c(4, 'C'), {
      known: { ...blank(ids), rook: { ...blank(ids).rook!, wren: [false, true, false, false] } },
    });
    expect(knows(s, 'rook', 'wren', 1)).toBe(true);
    s = act(s, 'wren', { type: 'keep', slot: 1 });
    expect(knows(s, 'wren', 'wren', 1)).toBe(true);
    expect(knows(s, 'rook', 'wren', 1)).toBe(false);
    expect(knows(s, 'magpie', 'wren', 1)).toBe(false);
  });

  it('discard: a card without a power ends the turn', () => {
    const s = powered(c(6, 'C'));
    expect(s.toAct).toBe('rook');
    expect(s.discard.at(-1)).toBe(c(6, 'C'));
    expect(s.power).toBeNull();
  });

  it('discard: a red King has no power', () => {
    expect(powered(c(13, 'H')).toAct).toBe('rook');
  });

  it('draw, then draw again, is refused', () => {
    fails(holding(c(4, 'C')), 'wren', { type: 'draw' }, 'wrong_step');
    fails(holding(c(4, 'C')), 'wren', { type: 'take' }, 'wrong_step');
    fails(holding(c(4, 'C')), 'wren', { type: 'call' }, 'wrong_step');
  });

  it('keeping or discarding before drawing is refused', () => {
    fails(three(), 'wren', { type: 'keep', slot: 0 }, 'wrong_step');
    fails(three(), 'wren', { type: 'discard' }, 'wrong_step');
    fails(three(), 'wren', { type: 'skipPower' }, 'no_power');
  });

  it('take: the top discard goes into your grid, and its slot is public', () => {
    const s = act(three({ discard: [c(9, 'C'), c(3, 'C')] }), 'wren', { type: 'take' });
    expect(s.holding).toEqual({ card: c(3, 'C'), from: 'discard' });
    expect(game.getTableView(s).holding).toEqual({ from: 'discard', card: c(3, 'C') });
    const n = act(s, 'wren', { type: 'keep', slot: 3 });
    expect(n.hands.wren![3]).toBe(c(3, 'C'));
    expect(n.discard).toEqual([c(9, 'C'), W[3]]);
    for (const v of ids) expect(knows(n, v, 'wren', 3)).toBe(true);
    expect(game.getPlayerView(n, 'magpie').grid.wren![3]).toBe(c(3, 'C'));
    expect(game.getPlayerView(n, 'magpie').grid.wren![2]).toBeNull();
  });

  it('take: you must keep it, not discard it', () => {
    const s = act(three(), 'wren', { type: 'take' });
    fails(s, 'wren', { type: 'discard' }, 'took_it');
  });

  it('a card taken from the pile carries no power, even when the card has one', () => {
    const s = three({ discard: [c(11, 'C')] });
    const n = act(act(s, 'wren', { type: 'take' }), 'wren', { type: 'keep', slot: 0 });
    expect(n.step).toBe('start');
    expect(n.toAct).toBe('rook');
    expect(n.power).toBeNull();
  });

  it('a card replaced out of the grid carries no power either', () => {
    // wren's slot 0 is a 9 (spy); keeping a 3 over it puts the 9 on the pile with no power.
    const s = holding(c(3, 'C'), {
      hands: { wren: [c(9, 'S'), ...W.slice(1)], rook: R, magpie: M },
    });
    const n = act(s, 'wren', { type: 'keep', slot: 0 });
    expect(n.toAct).toBe('rook');
    expect(n.power).toBeNull();
  });

  it('keeping a drawn power card gives no power', () => {
    const n = act(holding(c(12, 'C')), 'wren', { type: 'keep', slot: 0 });
    expect(n.toAct).toBe('rook');
    expect(n.power).toBeNull();
  });

  it('refuses a slot that does not exist', () => {
    fails(holding(c(4, 'C')), 'wren', { type: 'keep', slot: 4 }, 'bad_slot');
    expect(game.actionSchema.safeParse({ type: 'keep', slot: 4 }).success).toBe(false);
    expect(game.actionSchema.safeParse({ type: 'keep', slot: -1 }).success).toBe(false);
  });

  it('passes the turn round the table', () => {
    let s = three();
    for (const who of ['wren', 'rook', 'magpie', 'wren']) {
      expect(s.toAct).toBe(who);
      s = act(act(s, who, { type: 'take' }), who, { type: 'keep', slot: 0 });
    }
    expect(s.turns).toBe(5);
  });
});

describe('powers', () => {
  it('7: look at one of your own cards', () => {
    const s = powered(c(7, 'C'));
    expect(s.step).toBe('power');
    expect(s.power).toEqual({ kind: 'peek', card: c(7, 'C') });
    const n = act(s, 'wren', { type: 'peekOwn', slot: 2 });
    expect(game.getPlayerView(n, 'wren').grid.wren![2]).toBe(W[2]);
    expect(game.getPlayerView(n, 'rook').grid.wren![2]).toBeNull();
    expect(n.toAct).toBe('rook');
  });

  it('8 works the same', () => {
    expect(powered(c(8, 'C')).power?.kind).toBe('peek');
  });

  it('9: look at another player’s card, and only you learn it', () => {
    const s = powered(c(9, 'C'));
    expect(s.power?.kind).toBe('spy');
    const n = act(s, 'wren', { type: 'spy', player: 'rook', slot: 1 });
    expect(game.getPlayerView(n, 'wren').grid.rook![1]).toBe(R[1]);
    expect(game.getPlayerView(n, 'magpie').grid.rook![1]).toBeNull();
    expect(game.getPlayerView(n, 'rook').grid.rook![1]).toBeNull();
    expect(n.toAct).toBe('rook');
  });

  it('10 spies too', () => {
    expect(powered(c(10, 'C')).power?.kind).toBe('spy');
  });

  it('a spy needs another player', () => {
    const s = powered(c(9, 'C'));
    fails(s, 'wren', { type: 'spy', player: 'wren', slot: 0 }, 'self');
    fails(s, 'wren', { type: 'spy', player: 'owl', slot: 0 }, 'no_player');
    fails(s, 'wren', { type: 'spy', player: 'rook', slot: 7 }, 'bad_slot');
  });

  it('Jack: swap one of yours with another player’s, unseen', () => {
    const s = powered(c(11, 'C'));
    expect(s.power?.kind).toBe('swap');
    const n = act(s, 'wren', { type: 'swap', mySlot: 0, player: 'rook', slot: 3 });
    expect(n.hands.wren![0]).toBe(R[3]);
    expect(n.hands.rook![3]).toBe(W[0]);
    // Nobody looked: wren still doesn't know what came in.
    expect(game.getPlayerView(n, 'wren').grid.wren![0]).toBeNull();
    expect(n.toAct).toBe('rook');
  });

  it('Queen swaps too', () => {
    expect(powered(c(12, 'H')).power?.kind).toBe('swap');
  });

  it('a swap with yourself is refused', () => {
    fails(
      powered(c(11, 'C')),
      'wren',
      { type: 'swap', mySlot: 0, player: 'wren', slot: 1 },
      'self',
    );
  });

  it('black King: look at one of yours and one of theirs, then swap', () => {
    const s = powered(c(13, 'C'));
    expect(s.power?.kind).toBe('king');
    const l = act(s, 'wren', { type: 'kingLook', mySlot: 1, player: 'magpie', slot: 2 });
    expect(l.step).toBe('king');
    expect(l.toAct).toBe('wren');
    const v = game.getPlayerView(l, 'wren');
    expect(v.grid.wren![1]).toBe(W[1]);
    expect(v.grid.magpie![2]).toBe(M[2]);
    expect(game.getTableView(l).look).toEqual({ mySlot: 1, player: 'magpie', slot: 2 });
    const n = act(l, 'wren', { type: 'kingSwap' });
    expect(n.hands.wren![1]).toBe(M[2]);
    expect(n.hands.magpie![2]).toBe(W[1]);
    // wren saw both, so wren still knows both, now in their new places.
    const after = game.getPlayerView(n, 'wren');
    expect(after.grid.wren![1]).toBe(M[2]);
    expect(after.grid.magpie![2]).toBe(W[1]);
    expect(n.toAct).toBe('rook');
  });

  it('black King: look and leave things as they are', () => {
    const l = act(powered(c(13, 'S')), 'wren', {
      type: 'kingLook',
      mySlot: 0,
      player: 'rook',
      slot: 0,
    });
    const n = act(l, 'wren', { type: 'kingKeep' });
    expect(n.hands.wren).toEqual(W);
    expect(n.hands.rook).toEqual(R);
    expect(knows(n, 'wren', 'rook', 0)).toBe(true);
    expect(n.toAct).toBe('rook');
  });

  it('a King’s swap needs the look first', () => {
    fails(powered(c(13, 'C')), 'wren', { type: 'kingSwap' }, 'wrong_step');
    fails(powered(c(13, 'C')), 'wren', { type: 'kingKeep' }, 'wrong_step');
  });

  it('a King can’t look twice', () => {
    const l = act(powered(c(13, 'C')), 'wren', {
      type: 'kingLook',
      mySlot: 0,
      player: 'rook',
      slot: 0,
    });
    fails(l, 'wren', { type: 'kingLook', mySlot: 1, player: 'rook', slot: 1 }, 'wrong_step');
  });

  it('skipping a power ends the turn without using it', () => {
    for (const rank of [7, 9, 11]) {
      const n = act(powered(c(rank, 'C')), 'wren', { type: 'skipPower' });
      expect(n.toAct).toBe('rook');
      expect(n.hands).toEqual({ wren: W, rook: R, magpie: M });
    }
  });

  it('skipping a King after looking leaves things as they are', () => {
    const l = act(powered(c(13, 'C')), 'wren', {
      type: 'kingLook',
      mySlot: 0,
      player: 'rook',
      slot: 0,
    });
    expect(act(l, 'wren', { type: 'skipPower' }).hands.wren).toEqual(W);
  });

  it('refuses the wrong power for the card', () => {
    fails(powered(c(7, 'C')), 'wren', { type: 'spy', player: 'rook', slot: 0 }, 'wrong_power');
    fails(powered(c(9, 'C')), 'wren', { type: 'peekOwn', slot: 0 }, 'wrong_power');
    fails(
      powered(c(9, 'C')),
      'wren',
      { type: 'swap', mySlot: 0, player: 'rook', slot: 0 },
      'wrong_power',
    );
    fails(
      powered(c(11, 'C')),
      'wren',
      { type: 'kingLook', mySlot: 0, player: 'rook', slot: 0 },
      'wrong_power',
    );
  });

  it('refuses a power when there isn’t one on offer', () => {
    fails(three(), 'wren', { type: 'peekOwn', slot: 0 }, 'wrong_step');
    fails(holding(c(7, 'C')), 'wren', { type: 'peekOwn', slot: 0 }, 'wrong_step');
    fails(powered(c(6, 'C')), 'rook', { type: 'spy', player: 'wren', slot: 0 }, 'wrong_step');
  });

  it('shows the table the card whose power is on offer', () => {
    const t = game.getTableView(powered(c(11, 'C')));
    expect(t.power).toEqual({ kind: 'swap', card: c(11, 'C') });
    expect(t.top).toBe(c(11, 'C'));
  });

  it('logs powers without any hidden face', () => {
    const n = act(powered(c(9, 'C')), 'wren', { type: 'spy', player: 'rook', slot: 1 });
    const last = game.getTableView(n).moves.at(-1)!;
    expect(last).toMatchObject({ kind: 'spy', player: 'wren', target: 'rook', targetSlot: 1 });
    expect(last.card).toBeUndefined();
  });
});

describe('who knows what', () => {
  it('a swap carries what you knew to the new place', () => {
    // wren knows its own slot 0; rook knows magpie's slot 1; magpie knows nothing.
    let known = blank(ids);
    known = { ...known, wren: { ...known.wren!, wren: [true, false, false, false] } };
    known = { ...known, rook: { ...known.rook!, magpie: [false, true, false, false] } };
    const s = powered(c(11, 'C'), { known });
    const n = act(s, 'wren', { type: 'swap', mySlot: 0, player: 'magpie', slot: 1 });
    // The card wren knew is magpie's slot 1 now; the card rook knew is wren's slot 0.
    expect(game.getPlayerView(n, 'wren').grid.magpie![1]).toBe(W[0]);
    expect(game.getPlayerView(n, 'wren').grid.wren![0]).toBeNull();
    expect(game.getPlayerView(n, 'rook').grid.wren![0]).toBe(M[1]);
    expect(game.getPlayerView(n, 'rook').grid.magpie![1]).toBeNull();
    expect(game.getPlayerView(n, 'magpie').grid.wren![0]).toBeNull();
  });

  it('a swap of two unknown cards teaches nobody anything', () => {
    const n = act(powered(c(12, 'C')), 'wren', {
      type: 'swap',
      mySlot: 2,
      player: 'rook',
      slot: 2,
    });
    for (const v of ids) {
      expect(game.getPlayerView(n, v).grid.wren![2]).toBeNull();
      expect(game.getPlayerView(n, v).grid.rook![2]).toBeNull();
    }
  });

  it('knowledge of a slot is dropped when an unseen card replaces it', () => {
    let known = blank(ids);
    known = { ...known, magpie: { ...known.magpie!, wren: [false, false, true, false] } };
    known = { ...known, rook: { ...known.rook!, wren: [false, false, true, false] } };
    const s = holding(c(4, 'C'), { known });
    const n = act(s, 'wren', { type: 'keep', slot: 2 });
    expect(game.getPlayerView(n, 'magpie').grid.wren![2]).toBeNull();
    expect(game.getPlayerView(n, 'rook').grid.wren![2]).toBeNull();
    expect(game.getPlayerView(n, 'wren').grid.wren![2]).toBe(c(4, 'C'));
  });

  it('a card you peeked at stays known until it moves', () => {
    const n = act(powered(c(8, 'C')), 'wren', { type: 'peekOwn', slot: 0 });
    // rook's turn: rook draws and discards; wren still knows slot 0.
    const m = act(act(n, 'rook', { type: 'draw' }), 'rook', { type: 'discard' });
    expect(game.getPlayerView(m, 'wren').grid.wren![0]).toBe(W[0]);
  });

  it('knowledge follows a card swapped by someone else', () => {
    // wren spied rook's slot 1 earlier; magpie, with a Queen, swaps with rook's slot 1.
    const known = {
      ...blank(ids),
      wren: { ...blank(ids).wren!, rook: [false, true, false, false] },
    };
    const s = three({ toAct: 'magpie', known });
    const drawn = { ...s, stock: [c(12, 'C'), ...s.stock.filter((x) => x !== c(12, 'C'))] };
    const n = act(
      act(act(drawn, 'magpie', { type: 'draw' }), 'magpie', { type: 'discard' }),
      'magpie',
      { type: 'swap', mySlot: 0, player: 'rook', slot: 1 },
    );
    expect(game.getPlayerView(n, 'wren').grid.magpie![0]).toBe(R[1]);
    expect(game.getPlayerView(n, 'wren').grid.rook![1]).toBeNull();
  });

  it('after a round, every card is face up for everyone', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    expect(game.getPlayerView(s, 'rook').grid).toEqual({ wren: W, rook: R, magpie: M });
    expect(game.getTableView(s).hands).toEqual({ wren: W, rook: R, magpie: M });
  });

  it('a new round forgets everything but the new peek', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    const n = game.onTimer!(s, 'next', createRng(5), 99_999);
    expect(n.round).toBe(2);
    for (const v of ids) {
      expect(n.known[v]![v]).toEqual([false, false, true, true]);
      for (const o of ids.filter((x) => x !== v))
        expect(n.known[v]![o]).toEqual([false, false, false, false]);
    }
    expect(game.getTableView(n).hands).toBeNull();
  });
});

describe('calling Cambio', () => {
  it('is not allowed on the first turn of a round', () => {
    fails(three({ turns: 0 }), 'wren', { type: 'call' }, 'first_turn');
    const started = game.onTimer!(deal(), 'peek', createRng(3), 1);
    fails(started, started.toAct!, { type: 'call' }, 'first_turn');
  });

  it('is allowed after that, and uses the turn', () => {
    const s = act(three(), 'wren', { type: 'call' });
    expect(s.caller).toBe('wren');
    expect(s.toAct).toBe('rook');
    expect(game.getTableView(s).turnsLeft).toEqual(['rook', 'magpie']);
    expect(game.getTableView(s).moves.at(-1)).toMatchObject({ kind: 'call', player: 'wren' });
  });

  it('gives every other player exactly one more turn, then the round ends', () => {
    let s = act(three(), 'wren', { type: 'call' });
    s = act(act(s, 'rook', { type: 'draw' }), 'rook', { type: 'discard' });
    expect(s.phase).toBe('play');
    expect(s.toAct).toBe('magpie');
    expect(game.getTableView(s).turnsLeft).toEqual(['magpie']);
    s = act(act(s, 'magpie', { type: 'take' }), 'magpie', { type: 'keep', slot: 0 });
    expect(s.phase).toBe('scoring');
    expect(s.toAct).toBeNull();
  });

  it('the round waits for a power to be used or skipped on the last turn', () => {
    let s = act(three({ turns: 1, toAct: 'magpie' }), 'magpie', { type: 'call' });
    s = act(act(s, 'wren', { type: 'draw' }), 'wren', { type: 'discard' });
    s = holdingFor(s, 'rook', c(9, 'C'));
    s = act(s, 'rook', { type: 'discard' });
    expect(s.phase).toBe('play');
    s = act(s, 'rook', { type: 'spy', player: 'wren', slot: 0 });
    expect(s.phase).toBe('scoring');
  });

  it('skips the caller afterwards, with two players', () => {
    let s = table({ wren: W, rook: R }, { toAct: 'wren' });
    s = act(s, 'wren', { type: 'call' });
    expect(s.toAct).toBe('rook');
    s = act(act(s, 'rook', { type: 'draw' }), 'rook', { type: 'discard' });
    expect(s.phase).toBe('scoring');
  });

  it('can only be called once', () => {
    const s = act(three(), 'wren', { type: 'call' });
    fails(s, 'rook', { type: 'call' }, 'already_called');
  });

  it('can’t be called while holding a card or mid-power', () => {
    fails(holding(c(4, 'C')), 'wren', { type: 'call' }, 'wrong_step');
    fails(powered(c(7, 'C')), 'wren', { type: 'call' }, 'wrong_step');
  });

  it('locks the caller’s cards against spying', () => {
    const s = act(three(), 'wren', { type: 'call' });
    const p = holdingFor(s, 'rook', c(9, 'C'));
    const d = act(p, 'rook', { type: 'discard' });
    fails(d, 'rook', { type: 'spy', player: 'wren', slot: 0 }, 'locked');
  });

  it('locks the caller’s cards against swaps and King looks', () => {
    const s = act(three(), 'wren', { type: 'call' });
    const j = act(holdingFor(s, 'rook', c(11, 'C')), 'rook', { type: 'discard' });
    fails(j, 'rook', { type: 'swap', mySlot: 0, player: 'wren', slot: 0 }, 'locked');
    const k = act(holdingFor(s, 'rook', c(13, 'C')), 'rook', { type: 'discard' });
    fails(k, 'rook', { type: 'kingLook', mySlot: 0, player: 'wren', slot: 0 }, 'locked');
  });

  it('still lets others use powers on each other', () => {
    const s = act(three(), 'wren', { type: 'call' });
    const j = act(holdingFor(s, 'rook', c(11, 'C')), 'rook', { type: 'discard' });
    const n = act(j, 'rook', { type: 'swap', mySlot: 0, player: 'magpie', slot: 0 });
    expect(n.hands.rook![0]).toBe(M[0]);
  });

  it('leaves out the caller from who can be targeted', () => {
    const s = act(three(), 'wren', { type: 'call' });
    expect(targets(game.getTableView(s), 'rook')).toEqual(['magpie']);
    expect(targets(game.getTableView(three()), 'rook')).toEqual(['wren', 'magpie']);
  });
});

/** The state with `who` to move and holding `card` drawn from the stock. */
function holdingFor(s: CambioState, who: string, card: number): CambioState {
  const base = { ...s, toAct: who, stock: [card, ...s.stock.filter((x) => x !== card)] };
  return act(base, who, { type: 'draw' });
}

/** A round whose last turn is about to end: `caller` called, the other players have moved. */
function endOfRound(
  hands: Record<string, number[]>,
  caller: string,
  over: Partial<CambioState> = {},
) {
  const players = Object.keys(hands);
  const last = players[(players.indexOf(caller) + players.length - 1) % players.length]!;
  let s = table(hands, { caller, toAct: last, turns: 5, ...over });
  s = holdingFor(s, last, c(6, 'D', true));
  return act(s, last, { type: 'discard' }, 1000);
}

describe('scoring', () => {
  it('scores the caller 0 when strictly lowest, and everyone else their total', () => {
    // wren 2+3+4+5 = 14; rook 6+7+8+9 = 30; magpie 10+11+12+1 = 34
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    expect(s.phase).toBe('scoring');
    expect(s.last).toMatchObject({
      round: 1,
      caller: 'wren',
      callerWon: true,
      totals: { wren: 14, rook: 30, magpie: 34 },
      scored: { wren: 0, rook: 30, magpie: 34 },
    });
    expect(s.scores).toEqual({ wren: 0, rook: 30, magpie: 34 });
  });

  it('scores the caller 0 on a tie for the lowest', () => {
    const rook = [c(5, 'H'), c(4, 'H'), c(3, 'H'), c(2, 'H')];
    const s = endOfRound({ wren: W, rook, magpie: M }, 'wren');
    expect(s.last!.totals.rook).toBe(14);
    expect(s.last!.callerWon).toBe(true);
    expect(s.scores.wren).toBe(0);
    expect(s.scores.rook).toBe(14);
  });

  it('scores the caller their total plus 10 when someone beats them', () => {
    const s = endOfRound({ wren: R, rook: W, magpie: M }, 'wren');
    expect(s.last!.callerWon).toBe(false);
    expect(s.scores).toEqual({ wren: 30 + CALL_PENALTY, rook: 14, magpie: 34 });
    expect(CALL_PENALTY).toBe(10);
  });

  it('counts red Kings as zero', () => {
    const wren = [c(13, 'H'), c(13, 'D'), c(1, 'S'), c(1, 'C')];
    const s = endOfRound({ wren, rook: W, magpie: M }, 'wren');
    expect(s.last!.totals.wren).toBe(2);
    expect(s.scores.wren).toBe(0);
  });

  it('counts black Kings as thirteen', () => {
    const wren = [c(13, 'S'), c(13, 'C'), c(1, 'S'), c(1, 'C')];
    const s = endOfRound({ wren, rook: W, magpie: M }, 'wren');
    expect(s.last!.totals.wren).toBe(28);
    expect(s.scores.wren).toBe(28 + CALL_PENALTY);
  });

  it('adds scores up across rounds, and the deal moves one seat on', () => {
    let s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    const dealer = s.dealer;
    expect(s.nextAt).toBe(1000 + NEXT_ROUND_MS);
    s = game.onTimer!(s, 'next', createRng(5), s.nextAt!);
    expect(s.round).toBe(2);
    expect(s.dealer).toBe(ids[(ids.indexOf(dealer) + 1) % 3]);
    expect(s.scores).toEqual({ wren: 0, rook: 30, magpie: 34 });
    expect(s.history).toHaveLength(1);
    // Second round: wren calls again and loses.
    const two = endOfRound({ wren: R, rook: W, magpie: M }, 'wren', {
      scores: s.scores,
      history: s.history,
      round: 2,
    });
    expect(two.scores).toEqual({ wren: 40, rook: 44, magpie: 68 });
    expect(two.history).toHaveLength(2);
  });

  it('starts the next round when everyone has sent next', () => {
    let s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    s = act(s, 'wren', { type: 'next' });
    s = act(s, 'rook', { type: 'next' });
    expect(s.phase).toBe('scoring');
    expect(game.getTableView(s).nextReady).toEqual(['wren', 'rook']);
    s = act(s, 'magpie', { type: 'next' });
    expect(s.phase).toBe('peek');
    expect(s.round).toBe(2);
  });

  it('treats a repeated or stale next as nothing', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    const one = act(s, 'wren', { type: 'next', after: 1 });
    expect(act(one, 'wren', { type: 'next', after: 1 })).toBe(one);
    expect(act(s, 'rook', { type: 'next', after: 0 })).toBe(s);
    expect(act(s, 'rook', { type: 'next', after: 7 })).toBe(s);
    const later = game.onTimer!(s, 'next', createRng(5), 99_999);
    expect(act(later, 'rook', { type: 'next', after: 1 })).toBe(later);
  });

  it('refuses a next while the round is still on', () => {
    fails(three(), 'wren', { type: 'next' }, 'not_yet');
  });

  it('shows the scoring phase on a timer', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    expect(game.nextTimer!(s)).toEqual({ id: 'next', at: 1000 + NEXT_ROUND_MS });
    expect(game.onTimer!(s, 'next', createRng(5), 1).phase).toBe('peek');
    expect(game.onTimer!(s, 'peek', createRng(5), 1)).toBe(s);
  });

  it('puts the round in the recap with the hidden totals as its secret', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    const key = s.recap.find((e) => e.text.startsWith('Round 1'))!;
    expect(key.actor).toBe('wren');
    expect(key.key).toBe(true);
    expect(key.tone).toBe('good');
    expect(key.secret).toContain('{rook}');
    const called = act(three(), 'wren', { type: 'call' });
    expect(called.recap.at(-1)).toMatchObject({
      actor: 'wren',
      text: '{wren} called Cambio.',
      key: true,
    });
    const loser = endOfRound({ wren: R, rook: W, magpie: M }, 'wren');
    const e = loser.recap.find((x) => x.text.startsWith('Round 1'))!;
    expect(e.tone).toBe('bad');
    expect(e.tag).toBe('+10');
    expect(e.text).toContain('{rook}');
  });
});

describe('the stock', () => {
  it('reshuffles the discards, except the top card, when it runs out', () => {
    const pile = [c(2, 'C'), c(3, 'C'), c(4, 'C'), c(6, 'C'), c(5, 'C')];
    const s = three({ stock: [], discard: pile });
    const n = act(s, 'wren', { type: 'draw' });
    expect(n.discard).toEqual([c(5, 'C')]);
    expect(n.stock).toHaveLength(3);
    expect([n.holding!.card, ...n.stock].sort()).toEqual([...pile.slice(0, 4)].sort());
    expect(game.getTableView(n).moves.map((m) => m.kind)).toContain('shuffle');
  });

  it('uses the injected random source for the shuffle', () => {
    const pile = Array.from({ length: 12 }, (_, i) => c(2 + (i % 8), SUITS[i % 4]!, i > 7));
    const s = three({ stock: [], discard: [...pile, c(5, 'C')] });
    const a = act(s, 'wren', { type: 'draw' }, 0, 4);
    const b = act(s, 'wren', { type: 'draw' }, 0, 4);
    expect(a.stock).toEqual(b.stock);
  });
});

describe('memory option', () => {
  it('defaults to remembering it yourself, so notes is false, and round-trips', () => {
    expect(game.defaultOptions(3).memory).toBe('Remember it yourself');
    expect(game.getTableView(deal()).notes).toBe(false);
    const kept = { ...game.defaultOptions(3), memory: 'Keep notes' as const };
    expect(game.optionsSchema.parse(kept)).toEqual(kept);
    expect(game.optionsSchema.safeParse({ ...kept, memory: 'Cheat' }).success).toBe(false);
    const s = deal(ids, { memory: 'Keep notes' });
    expect(game.getTableView(s).notes).toBe(true);
    expect(game.getPlayerView(s, 'wren').notes).toBe(true);
  });
});

describe('game length', () => {
  const finish = (s: CambioState) => game.onTimer!(s, 'next', createRng(9), 1_000_000);

  it('defaults to first to 100 with no timer', () => {
    expect(game.defaultOptions(4)).toEqual({
      goal: 'First to 100',
      turnTimer: 'Off',
      memory: 'Remember it yourself',
      peekCards: '7 and 8',
      spyCards: '9 and 10',
      swapCards: 'Jack and Queen',
      kingPower: 'Black Kings',
      redKings: '0',
      callerPenalty: '10',
      callerBonus: '0',
      openingPeek: 'Two',
      exactly100: 'Off',
      jokers: 'None',
    });
    expect(game.optionsSchema.safeParse(game.defaultOptions(4)).success).toBe(true);
    expect(game.optionsSchema.safeParse({ goal: 'First to 10', turnTimer: 'Off' }).success).toBe(
      false,
    );
  });

  it('first to 100: keeps going until someone reaches it, then the lowest score wins', () => {
    const under = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', {
      scores: { wren: 5, rook: 50, magpie: 60 },
    });
    expect(lastRoundPlayed(under)).toBe(false);
    expect(finish(under).phase).toBe('peek');
    const over = finish(
      endOfRound({ wren: W, rook: R, magpie: M }, 'wren', {
        scores: { wren: 5, rook: 80, magpie: 60 },
      }),
    );
    expect(over.phase).toBe('over');
    const r = game.getResult(over)!;
    expect(r.winners).toEqual(['wren']);
    expect(r.summary).toBe('Lowest score: 5 points after 1 round');
  });

  it('first to 50 ends at 50', () => {
    const base = { scores: { wren: 5, rook: 25, magpie: 10 } };
    // rook scores 30 more: 55.
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', base);
    expect(lastRoundPlayed({ ...s, target: 50 })).toBe(true);
    const fifty = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', { ...base, target: 50 });
    expect(finish(fifty).phase).toBe('over');
    const hundred = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', { ...base, target: 100 });
    expect(finish(hundred).phase).toBe('peek');
  });

  it('a set number of rounds ignores the score', () => {
    const three3 = three({}, { goal: '3 rounds' });
    expect(three3.rounds).toBe(3);
    expect(three3.target).toBe(0);
    const hands = { wren: W, rook: R, magpie: M };
    const early = endOfRound(hands, 'wren', {
      rounds: 3,
      target: 0,
      round: 2,
      scores: { wren: 0, rook: 500, magpie: 0 },
    });
    expect(finish(early).phase).toBe('peek');
    const last = endOfRound(hands, 'wren', { rounds: 3, target: 0, round: 3 });
    expect(finish(last).phase).toBe('over');
    const five = endOfRound(hands, 'wren', { rounds: 5, target: 0, round: 4 });
    expect(finish(five).phase).toBe('peek');
    expect(finish(endOfRound(hands, 'wren', { rounds: 5, target: 0, round: 5 })).phase).toBe(
      'over',
    );
  });

  it('setup reads the goal option', () => {
    expect(deal(ids, { goal: 'First to 50' }).target).toBe(50);
    expect(deal(ids, { goal: 'First to 100' }).target).toBe(100);
    expect(deal(ids, { goal: '5 rounds' })).toMatchObject({ rounds: 5, target: 0 });
  });

  it('ties for the lowest score share the win', () => {
    const over = finish(
      endOfRound({ wren: W, rook: R, magpie: M }, 'wren', {
        target: 100,
        scores: { wren: 10, rook: 70, magpie: 66 },
        // wren scores 0, so wren stays on 10; rook goes to 100.
      }),
    );
    const tie = { ...over, scores: { wren: 10, rook: 10, magpie: 120 } };
    const r = game.getResult(tie)!;
    expect(r.winners).toEqual(['wren', 'rook']);
    expect(r.summary).toBe('A tie at 10 points after 1 round');
    expect(r.standings!.map((x) => x.outcome)).toEqual(['draw', 'draw', 'loss']);
  });

  it('has no result until the game is over', () => {
    expect(game.getResult(three())).toBeNull();
    expect(game.getResult(endOfRound({ wren: W, rook: R, magpie: M }, 'wren'))).toBeNull();
  });

  it('reports standings, stats, highlights, recap and a reveal', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren', { target: 1 });
    const over = finish(s);
    const r = game.getResult(over)!;
    expect(r.winners).toEqual(['wren']);
    expect(r.standings!.find((x) => x.playerId === 'wren')).toMatchObject({
      outcome: 'win',
      role: '0 points',
    });
    expect(r.standings!.find((x) => x.playerId === 'rook')).toMatchObject({
      outcome: 'loss',
      role: '30 points',
    });
    expect(r.highlights).toEqual([
      { award: 'Lowest round', playerIds: ['wren'], text: '14 in round 1', value: 86 },
    ]);
    expect(r.recap.length).toBeGreaterThan(0);
    expect(r.stats!.columns).toEqual(['Points', 'Best hand', 'Cambios', 'Cambios won']);
    expect(r.stats!.rows[0]).toEqual({ playerId: 'wren', values: [0, 14, 1, 1] });
    const reveal = r.reveal as {
      players: string[];
      scores: Record<string, number>;
      history: { round: number }[];
      lastHands: Record<string, number[]>;
    };
    expect(reveal.players).toEqual(['wren', 'rook', 'magpie']);
    expect(reveal.scores).toEqual({ wren: 0, rook: 30, magpie: 34 });
    expect(reveal.history).toHaveLength(1);
    expect(reveal.lastHands.wren).toEqual(W);
  });
});

describe('ending early', () => {
  it('has nothing before the first round is scored', () => {
    expect(game.partialResult!(deal())).toBeNull();
    expect(game.partialResult!(three())).toBeNull();
  });

  it('after a round, the lowest score wins', () => {
    const s = endOfRound({ wren: R, rook: W, magpie: M }, 'wren');
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual(['rook']);
    expect(r.summary).toBe('Lowest score: 14 points after 1 round');
    expect(r.standings!.map((x) => x.outcome)).toEqual(['loss', 'win', 'loss']);
  });

  it('ignores a round still being played, and shares ties', () => {
    const s = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    const mid = game.onTimer!(s, 'next', createRng(5), 99_999);
    const r = game.partialResult!(mid)!;
    expect(r.summary).toBe('Lowest score: 0 points after 1 round');
    const tie = game.partialResult!({ ...mid, scores: { wren: 7, rook: 7, magpie: 9 } })!;
    expect(tie.winners).toEqual(['wren', 'rook']);
    expect(tie.summary).toBe('A tie at 7 points after 1 round');
  });

  it('is the full result once the game is over', () => {
    const over = { ...endOfRound({ wren: W, rook: R, magpie: M }, 'wren'), phase: 'over' as const };
    expect(game.partialResult!(over)).toEqual(game.getResult(over));
  });
});

describe('the turn timer', () => {
  const timed = (over: Partial<CambioState> = {}) =>
    table({ wren: W, rook: R, magpie: M }, { turnSecs: 30, actBy: 30_000, ...over });

  it('is off by default and set by the option', () => {
    expect(deal().turnSecs).toBe(0);
    expect(deal().actBy).toBeNull();
    const s = deal(ids, { turnTimer: '60 seconds' });
    expect(s.turnSecs).toBe(60);
    const started = game.onTimer!(s, 'peek', createRng(3), 5_000);
    expect(started.actBy).toBe(65_000);
    expect(game.nextTimer!(started)).toEqual({ id: 'act', at: 65_000 });
    expect(game.getTableView(started).actBy).toBe(65_000);
    expect(game.nextTimer!(game.onTimer!(deal(), 'peek', createRng(3), 5_000))).toBeNull();
  });

  it('draws and discards without a power when time runs out', () => {
    const s = timed({ stock: [c(9, 'C'), ...three().stock.filter((x) => x !== c(9, 'C'))] });
    const n = game.onTimer!(s, 'act', createRng(2), 30_000);
    expect(n.toAct).toBe('rook');
    expect(n.discard.at(-1)).toBe(c(9, 'C'));
    expect(n.hands).toEqual(s.hands);
    expect(n.step).toBe('start');
    expect(game.getTableView(n).moves.every((m) => m.late)).toBe(true);
  });

  it('discards the card in hand if holding one from the stock', () => {
    const s = { ...holding(c(11, 'C')), turnSecs: 30, actBy: 30_000 };
    const n = game.onTimer!(s, 'act', createRng(2), 30_000);
    expect(n.toAct).toBe('rook');
    expect(n.discard.at(-1)).toBe(c(11, 'C'));
    expect(n.hands.wren).toEqual(W);
  });

  it('skips a power on offer', () => {
    const s = { ...powered(c(9, 'C')), turnSecs: 30, actBy: 30_000 };
    const n = game.onTimer!(s, 'act', createRng(2), 30_000);
    expect(n.toAct).toBe('rook');
    expect(n.hands).toEqual(s.hands);
  });

  it('keeps a card taken from the pile, since it can’t be discarded', () => {
    const s = { ...act(three(), 'wren', { type: 'take' }), turnSecs: 30, actBy: 30_000 };
    const n = game.onTimer!(s, 'act', createRng(2), 30_000);
    expect(n.toAct).toBe('rook');
    expect(n.hands.wren).toContain(c(5, 'C'));
    expect(n.discard).toHaveLength(1);
  });

  it('after a King’s look, leaves the cards alone', () => {
    const l = act(powered(c(13, 'S')), 'wren', {
      type: 'kingLook',
      mySlot: 0,
      player: 'rook',
      slot: 0,
    });
    const n = game.onTimer!({ ...l, turnSecs: 30, actBy: 30_000 }, 'act', createRng(2), 30_000);
    expect(n.hands.wren).toEqual(W);
    expect(n.toAct).toBe('rook');
  });

  it('restarts for the next player, and for each step of a turn', () => {
    const s = { ...table({ wren: W, rook: R, magpie: M }, { turnSecs: 30, actBy: 30_000 }) };
    const d = act(s, 'wren', { type: 'draw' }, 12_000);
    expect(d.actBy).toBe(42_000);
    const k = act(d, 'wren', { type: 'keep', slot: 0 }, 13_000);
    expect(k.toAct).toBe('rook');
    expect(k.actBy).toBe(43_000);
  });

  it('ends the round if the timed-out player was the last to move', () => {
    const s = table(
      { wren: W, rook: R },
      { caller: 'wren', toAct: 'rook', turnSecs: 30, actBy: 30_000 },
    );
    const n = game.onTimer!(s, 'act', createRng(2), 30_000);
    expect(n.phase).toBe('scoring');
    expect(n.actBy).toBeNull();
  });

  it('does nothing for a stale timer', () => {
    const s = three();
    expect(game.onTimer!(s, 'act', createRng(2), 30_000)).toBe(s);
    expect(game.onTimer!(s, 'bogus', createRng(2), 30_000)).toBe(s);
  });
});

describe('waiting and announcing', () => {
  it('waits on whoever is to move, and on nobody between rounds', () => {
    expect(game.waitingOn!(three())).toEqual(['wren']);
    expect(game.waitingOn!(endOfRound({ wren: W, rook: R, magpie: M }, 'wren'))).toEqual([]);
  });

  it('announces a call and the round’s result', () => {
    const s = three();
    const called = act(s, 'wren', { type: 'call' });
    expect(game.announce!(s, called)).toEqual(['{wren} called Cambio!']);
    const done = endOfRound({ wren: W, rook: R, magpie: M }, 'wren');
    expect(game.announce!(called, done)[0]).toBe('Round 1: {wren} had the lowest hand, 14.');
    const lost = endOfRound({ wren: R, rook: W, magpie: M }, 'wren');
    expect(game.announce!(called, lost)[0]).toBe('Round 1: {wren} called too soon and scores 40.');
    expect(game.announce!(s, s)).toEqual([]);
  });
});

describe('actions', () => {
  it('bounds every field', () => {
    const bad: unknown[] = [
      { type: 'keep' },
      { type: 'keep', slot: 1.5 },
      { type: 'peekOwn', slot: 9 },
      { type: 'spy', player: '', slot: 0 },
      { type: 'spy', player: 'x'.repeat(65), slot: 0 },
      { type: 'swap', mySlot: 4, player: 'a', slot: 0 },
      { type: 'kingLook', mySlot: 0, player: 'a', slot: -2 },
      { type: 'next', after: -1 },
      { type: 'shout' },
    ];
    for (const a of bad) expect(game.actionSchema.safeParse(a).success).toBe(false);
    const good: unknown[] = [
      { type: 'ready' },
      { type: 'call' },
      { type: 'draw' },
      { type: 'take' },
      { type: 'keep', slot: 3 },
      { type: 'discard' },
      { type: 'peekOwn', slot: 0 },
      { type: 'spy', player: 'rook', slot: 2 },
      { type: 'swap', mySlot: 1, player: 'rook', slot: 2 },
      { type: 'kingLook', mySlot: 1, player: 'rook', slot: 2 },
      { type: 'kingSwap' },
      { type: 'kingKeep' },
      { type: 'skipPower' },
      { type: 'next' },
      { type: 'next', after: 2 },
    ];
    for (const a of good) expect(game.actionSchema.safeParse(a).success).toBe(true);
  });

  it('does not mutate the state it is given', () => {
    const s = three();
    const before = JSON.stringify(s);
    act(act(s, 'wren', { type: 'draw' }), 'wren', { type: 'keep', slot: 2 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

/* ---------- The leak fuzz ---------- */

type Ref = Record<string, Record<string, boolean[]>>;

/** Who knows what, worked out here from the actions alone, not from the game's own state. */
function refDeal(players: string[], peeked: number[] = [2, 3]): Ref {
  const ref: Ref = {};
  for (const v of players) {
    ref[v] = {};
    for (const o of players)
      ref[v]![o] = [0, 1, 2, 3].map((slot) => o === v && peeked.includes(slot));
  }
  return ref;
}

function refApply(
  ref: Ref,
  players: string[],
  before: CambioState,
  who: string,
  a: CambioAction,
): Ref {
  const next: Ref = JSON.parse(JSON.stringify(ref));
  const swap = (p1: string, s1: number, p2: string, s2: number) => {
    for (const v of players) {
      const x = next[v]![p1]![s1]!;
      next[v]![p1]![s1] = next[v]![p2]![s2]!;
      next[v]![p2]![s2] = x;
    }
  };
  switch (a.type) {
    case 'keep':
      if (before.holding!.from === 'discard') {
        for (const v of players) next[v]![who]![a.slot] = true;
      } else {
        for (const v of players) next[v]![who]![a.slot] = v === who;
      }
      break;
    case 'peekOwn':
      next[who]![who]![a.slot] = true;
      break;
    case 'spy':
      next[who]![a.player]![a.slot] = true;
      break;
    case 'swap':
      swap(who, a.mySlot, a.player, a.slot);
      break;
    case 'kingLook':
      next[who]![who]![a.mySlot] = true;
      next[who]![a.player]![a.slot] = true;
      break;
    case 'kingSwap':
      swap(who, before.look!.mySlot, before.look!.player, before.look!.slot);
      break;
    default:
  }
  return next;
}

/** A random, playable set of house rules: no two powers on the same cards. */
function randomHouse(rng: Rng): Partial<CambioOptions> {
  const sets = rng.shuffle(['7 and 8', '9 and 10', 'Jack and Queen'] as const);
  const some = <T>(x: T): T | 'None' => (rng.next() < 0.25 ? 'None' : x);
  return {
    peekCards: some(sets[0]!),
    spyCards: some(sets[1]!),
    swapCards: some(sets[2]!),
    kingPower: rng.pick(KING_POWER_LABELS),
    redKings: rng.pick(RED_KING_LABELS),
    callerPenalty: rng.pick(CALLER_PENALTY_LABELS),
    callerBonus: rng.pick(CALLER_BONUS_LABELS),
    openingPeek: rng.pick(OPENING_PEEK_LABELS),
    exactly100: rng.pick(EXACTLY_100_LABELS),
    jokers: rng.pick(JOKER_LABELS),
    memory: rng.pick(MEMORY_LABELS),
  };
}

/** A random legal move for whoever is to act. */
function randomMove(s: CambioState, rng: Rng): { who: string; a: CambioAction } {
  const me = s.toAct!;
  const others = s.players.filter((p) => p !== me && p !== s.caller);
  const slot = () => rng.int(4);
  const target = () => rng.pick(others);
  switch (s.step) {
    case 'start': {
      const r = rng.next();
      if (r < 0.12 && s.turns > 0 && !s.caller) return { who: me, a: { type: 'call' } };
      return { who: me, a: { type: r < 0.4 ? 'take' : 'draw' } };
    }
    case 'held':
      if (s.holding!.from === 'discard' || rng.next() < 0.5)
        return { who: me, a: { type: 'keep', slot: slot() } };
      return { who: me, a: { type: 'discard' } };
    case 'power': {
      if (!others.length || rng.next() < 0.15) return { who: me, a: { type: 'skipPower' } };
      switch (s.power!.kind) {
        case 'peek':
          return { who: me, a: { type: 'peekOwn', slot: slot() } };
        case 'spy':
          return { who: me, a: { type: 'spy', player: target(), slot: slot() } };
        case 'swap':
          return { who: me, a: { type: 'swap', mySlot: slot(), player: target(), slot: slot() } };
        case 'king':
          return {
            who: me,
            a: { type: 'kingLook', mySlot: slot(), player: target(), slot: slot() },
          };
      }
      break;
    }
    case 'king':
      return { who: me, a: { type: rng.next() < 0.5 ? 'kingSwap' : 'kingKeep' } };
  }
  throw new Error('no move');
}

describe('hidden information', () => {
  /** Plays whole random games, checking every view after every move; returns how many faces. */
  const fuzz = (seeds: number[], extra: (seed: number) => Partial<CambioOptions>): number => {
    let checked = 0;
    for (const seed of seeds) {
      const players = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'jay', 'owl'].slice(
        0,
        2 + (seed % 7),
      );
      const rng = createRng(seed * 31);
      let s = deal(players, { goal: seed % 2 ? '3 rounds' : 'First to 50', ...extra(seed) }, seed);
      let ref = refDeal(players, s.house.peekSlots);
      let round = s.round;
      for (let i = 0; i < 900 && s.phase !== 'over'; i++) {
        let who: string;
        let a: CambioAction;
        if (s.phase === 'peek') {
          who = rng.pick(s.players);
          a = { type: 'ready' };
        } else if (s.phase === 'scoring') {
          who = rng.pick(s.players);
          a = { type: 'next' };
        } else ({ who, a } = randomMove(s, rng));
        const before = s;
        s = act(before, who, a, i, seed + i);
        ref =
          s.round !== round
            ? refDeal(players, s.house.peekSlots)
            : refApply(ref, players, before, who, a);
        round = s.round;

        const revealed = s.phase === 'scoring' || s.phase === 'over';
        const table = game.getTableView(s);
        const tableJson = JSON.stringify(table);
        expect(tableJson).not.toMatch(/"grid"|"known"|"stock":|"held":/);
        expect(table.hands !== null).toBe(revealed);
        if (table.holding && table.holding.from === 'stock') expect(table.holding.card).toBeNull();
        for (const m of table.moves) {
          if (m.kind === 'draw' || m.kind === 'peek' || m.kind === 'spy' || m.kind === 'look')
            expect(m.card).toBeUndefined();
        }
        for (const p of players) {
          const v = game.getPlayerView(s, p);
          const json = JSON.stringify(v);
          expect(json).not.toMatch(/"known"|"stock":/);
          expect(v.held !== null).toBe(s.toAct === p && s.holding !== null);
          for (const o of players) {
            for (let slot = 0; slot < 4; slot++) {
              const face = v.grid[o]![slot];
              const should = revealed || ref[p]![o]![slot]!;
              if (should) expect(face, `${p} sees ${o}/${slot}`).toBe(s.hands[o]![slot]);
              else expect(face, `${p} must not see ${o}/${slot}`).toBeNull();
              checked++;
            }
          }
        }
      }
    }
    return checked;
  };

  it('a fuzzed game never shows a player a face they don’t know', () => {
    const seeds = Array.from({ length: 24 }, (_, i) => i + 1);
    expect(fuzz(seeds, () => ({}))).toBeGreaterThan(10_000);
  });

  it('nor does one played under random house rules', () => {
    const seeds = Array.from({ length: 16 }, (_, i) => 100 + i);
    const checked = fuzz(seeds, (seed) => randomHouse(createRng(seed)));
    expect(checked).toBeGreaterThan(5_000);
  });

  it('plays all of its cards through: nothing is lost or invented', () => {
    const rng = createRng(77);
    let s = deal(['wren', 'rook', 'magpie', 'robin', 'finch', 'heron'], { goal: '3 rounds' }, 5);
    for (let i = 0; i < 500 && s.phase !== 'over'; i++) {
      if (s.phase === 'peek') s = act(s, 'wren', { type: 'ready' }, i);
      else if (s.phase === 'scoring') s = game.onTimer!(s, 'next', rng, i);
      else {
        const m = randomMove(s, rng);
        s = act(s, m.who, m.a, i, i + 3);
      }
      if (s.phase === 'play' || s.phase === 'scoring') {
        const all = [
          ...Object.values(s.hands).flat(),
          ...s.stock,
          ...s.discard,
          ...(s.holding ? [s.holding.card] : []),
        ];
        expect(all).toHaveLength(104);
      }
    }
  });
});
