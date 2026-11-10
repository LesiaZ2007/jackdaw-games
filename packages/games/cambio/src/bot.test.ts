import { createRng, type BotLevel, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { SUITS, cardValue, fullDeck, type Suit } from './cards';
import { cambio as game, type CambioOptions, type CambioState } from './rules';

const c = (rank: number, suit: Suit = 'S') => SUITS.indexOf(suit) * 13 + (rank - 1);
const blank = (ps: string[]) =>
  Object.fromEntries(
    ps.map((v) => [v, Object.fromEntries(ps.map((o) => [o, [false, false, false, false]]))]),
  );

/** A random source that never slips, so one decision is the same each time. */
const steady = (seed = 1): Rng => ({ ...createRng(seed), next: () => 0.99 });

const ask = (s: CambioState, pid: string, level: BotLevel = 'hard', seed = 1) =>
  game.bot!({
    playerId: pid,
    playerIds: s.players,
    view: game.getPlayerView(s, pid),
    tableView: game.getTableView(s),
    rng: steady(seed),
    now: 0,
    level,
  });

const W = [c(2, 'S'), c(3, 'S'), c(4, 'S'), c(5, 'S')];
const R = [c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'H')];
const M = [c(10, 'D'), c(11, 'D'), c(12, 'D'), c(1, 'D')];

/** wren to move in a round under way. `wren` is what wren knows of its own grid, by slot. */
function table(
  over: Partial<CambioState> = {},
  wren: boolean[] = [false, false, false, false],
  hands: Record<string, number[]> = { wren: W, rook: R, magpie: M },
): CambioState {
  const players = Object.keys(hands);
  const s = game.setup({
    playerIds: players,
    options: game.defaultOptions(players.length),
    rng: createRng(1),
    now: 0,
  });
  const discard = over.discard ?? [c(9, 'C')];
  const used = new Set([...Object.values(hands).flat(), ...discard]);
  const known = blank(players);
  known.wren!.wren = wren;
  return {
    ...s,
    phase: 'play',
    hands,
    stock: fullDeck(players.length).filter((i) => !used.has(i)),
    discard,
    known,
    toAct: 'wren',
    step: 'start',
    holding: null,
    power: null,
    look: null,
    caller: null,
    turns: 3,
    ready: [],
    peekAt: null,
    ...over,
  };
}
const withKnown = (
  s: CambioState,
  viewer: string,
  owner: string,
  slots: boolean[],
): CambioState => ({
  ...s,
  known: { ...s.known, [viewer]: { ...s.known[viewer]!, [owner]: slots } },
});
const holdingCard = (
  s: CambioState,
  card: number,
  from: 'stock' | 'discard' = 'stock',
): CambioState => ({
  ...s,
  step: 'held' as const,
  holding: { card, from },
});
const power = (
  s: CambioState,
  kind: 'peek' | 'spy' | 'swap' | 'king',
  card: number,
): CambioState => ({
  ...s,
  step: 'power' as const,
  power: { kind, card },
});

/** Plays as the platform does: the first bot with a move makes it; otherwise the timer fires. */
function playOut(players: string[], o: Partial<CambioOptions>, seed: number, level: BotLevel) {
  let s = game.setup({
    playerIds: players,
    options: { ...game.defaultOptions(players.length), ...o },
    rng: createRng(seed),
    now: 0,
  });
  const rng = createRng(seed * 17 + 3);
  let moves = 0;
  let now = 0;
  while (s.phase !== 'over' && moves < 20_000) {
    now += 1100;
    let moved = false;
    for (const pid of s.players) {
      const a = game.bot!({
        playerId: pid,
        playerIds: s.players,
        view: game.getPlayerView(s, pid),
        tableView: game.getTableView(s),
        rng,
        now,
        level,
      });
      if (!a) continue;
      const next = game.applyAction(s, pid, game.actionSchema.parse(a), rng, now);
      expect(next).not.toBe(s);
      s = next;
      moved = true;
      break;
    }
    if (!moved) {
      const t = game.nextTimer!(s);
      if (!t) throw new Error(`stalled in ${s.phase}, round ${s.round}`);
      now = Math.max(now, t.at);
      const next = game.onTimer!(s, t.id, rng, now);
      expect(next).not.toBe(s);
      s = next;
    }
    moves++;
  }
  return { s, moves };
}

describe('the computer player', () => {
  const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'jay', 'owl'];
  const cases: [number, Partial<CambioOptions>, BotLevel][] = [
    [2, { goal: '3 rounds' }, 'hard'],
    [2, { goal: 'First to 50' }, 'normal'],
    [3, { goal: 'First to 100' }, 'normal'],
    [4, { goal: '5 rounds' }, 'easy'],
    [5, { goal: 'First to 50', turnTimer: '30 seconds' }, 'hard'],
    [6, { goal: '3 rounds' }, 'normal'],
    [7, { goal: 'First to 50' }, 'easy'],
    [8, { goal: '3 rounds', turnTimer: '60 seconds' }, 'hard'],
    [8, { goal: 'First to 100' }, 'normal'],
  ];
  for (const [n, o, level] of cases)
    for (const seed of [1, 2, 3])
      it(`finishes a game of ${n} ${level} bots (${JSON.stringify(o)}, seed ${seed})`, () => {
        const { s, moves } = playOut(birds.slice(0, n), o, seed, level);
        expect(s.phase, `after ${moves} moves, round ${s.round}`).toBe('over');
        expect(game.getResult(s)).not.toBe(null);
      });

  it('says it is ready in the peek phase, once', () => {
    const s = game.setup({
      playerIds: ['wren', 'rook'],
      options: game.defaultOptions(2),
      rng: createRng(1),
      now: 0,
    });
    expect(ask(s, 'wren')).toEqual({ type: 'ready' });
    const ready = game.applyAction(s, 'wren', { type: 'ready' }, createRng(1), 0);
    expect(ask(ready, 'wren')).toBeNull();
    expect(ask(ready, 'rook')).toEqual({ type: 'ready' });
  });

  it('waits off its turn and between rounds', () => {
    expect(ask(table(), 'rook')).toBeNull();
    expect(ask(table({ phase: 'scoring', toAct: null }), 'wren')).toBeNull();
  });

  it('draws when it has nothing better to do', () => {
    expect(ask(table(), 'wren')).toEqual({ type: 'draw' });
  });

  it('never calls on the first turn', () => {
    const known = withKnown(table({ turns: 0 }), 'wren', 'wren', [true, true, true, true]);
    const low = {
      ...known,
      hands: { ...known.hands, wren: [c(1, 'S'), c(1, 'C'), c(1, 'H'), c(2, 'C')] },
    };
    expect(ask(low, 'wren')).toEqual({ type: 'draw' });
  });

  it('calls once all four cards are known and total 6 or less (Normal)', () => {
    const low = [c(1, 'S'), c(1, 'C'), c(2, 'H'), c(2, 'C')];
    const s = table({}, [true, true, true, true], { wren: low, rook: R, magpie: M });
    expect(ask(s, 'wren', 'normal')).toEqual({ type: 'call' });
    expect(ask(s, 'wren', 'hard')).toEqual({ type: 'call' });
    expect(ask(s, 'wren', 'easy')).toEqual({ type: 'draw' });
  });

  it('calls at a higher total on Hard and a lower one on Easy', () => {
    const eight = [c(2, 'S'), c(2, 'C'), c(2, 'H'), c(2, 'D')];
    const nine = [c(2, 'S'), c(2, 'C'), c(2, 'H'), c(3, 'D')];
    const s = (hand: number[]) =>
      table({}, [true, true, true, true], { wren: hand, rook: R, magpie: M });
    expect(ask(s(nine), 'wren', 'hard')).toEqual({ type: 'call' });
    expect(ask(s(nine), 'wren', 'normal')).not.toEqual({ type: 'call' });
    expect(ask(s(eight), 'wren', 'normal')).not.toEqual({ type: 'call' });
    expect(ask(s([c(1), c(1, 'C'), c(1, 'H'), c(1, 'D')]), 'wren', 'easy')).toEqual({
      type: 'call',
    });
    expect(ask(s([c(2), c(1, 'C'), c(1, 'H'), c(2, 'D')]), 'wren', 'easy')).not.toEqual({
      type: 'call',
    });
    expect(ask(s(nine), 'wren', 'easy')).not.toEqual({ type: 'call' });
  });

  it('doesn’t call with a card it hasn’t seen', () => {
    const low = [c(1, 'S'), c(1, 'C'), c(2, 'H'), c(2, 'C')];
    const s = table({}, [true, true, true, false], { wren: low, rook: R, magpie: M });
    expect(ask(s, 'wren', 'hard')).toEqual({ type: 'draw' });
  });

  it('doesn’t call after someone else already has', () => {
    const low = [c(1, 'S'), c(1, 'C'), c(2, 'H'), c(2, 'C')];
    const s = table({ caller: 'rook' }, [true, true, true, true], {
      wren: low,
      rook: R,
      magpie: M,
    });
    expect(ask(s, 'wren', 'hard')).toEqual({ type: 'draw' });
  });

  it('takes a low discard when it knows a higher card of its own', () => {
    const s = table({ discard: [c(2, 'C')] }, [false, false, true, false]);
    // wren knows slot 2: a 4.
    expect(ask(s, 'wren')).toEqual({ type: 'take' });
  });

  it('leaves a discard that is high, or when it knows nothing higher', () => {
    expect(ask(table({ discard: [c(4, 'C')] }, [false, false, true, false]), 'wren')).toEqual({
      type: 'draw',
    });
    expect(ask(table({ discard: [c(2, 'C')] }, [true, false, false, false]), 'wren')).toEqual({
      type: 'draw',
    });
    expect(ask(table({ discard: [c(2, 'C')] }), 'wren')).toEqual({ type: 'draw' });
  });

  it('puts a taken card over its highest known card', () => {
    const s = holdingCard(
      table({ discard: [c(9, 'C')] }, [true, false, false, true]),
      c(2, 'C'),
      'discard',
    );
    // wren knows slot 0 (a 2) and slot 3 (a 5): the 5 goes.
    expect(ask(s, 'wren')).toEqual({ type: 'keep', slot: 3 });
  });

  it('keeps a drawn card that is lower than a known high card of its own', () => {
    const s = holdingCard(table({}, [false, false, false, true]), c(3, 'C'));
    expect(ask(s, 'wren')).toEqual({ type: 'keep', slot: 3 });
  });

  it('keeps a drawn card under 5 in a slot it hasn’t seen', () => {
    const s = holdingCard(table({}, [true, true, true, false]), c(4, 'C'));
    expect(ask(s, 'wren')).toEqual({ type: 'keep', slot: 3 });
    const none = holdingCard(table(), c(4, 'C'));
    const a = ask(none, 'wren');
    expect(a).toMatchObject({ type: 'keep' });
  });

  it('discards a high drawn card it has no use for', () => {
    expect(ask(holdingCard(table(), c(9, 'C')), 'wren')).toEqual({ type: 'discard' });
    // Everything known and low: even a 6 isn't worth keeping.
    const all = holdingCard(table({}, [true, true, true, true]), c(6, 'C'));
    expect(ask(all, 'wren')).toEqual({ type: 'discard' });
  });

  it('treats a red King as a very good card to keep', () => {
    const s = holdingCard(table({}, [true, true, true, true]), c(13, 'H'));
    expect(ask(s, 'wren')).toEqual({ type: 'keep', slot: 3 });
  });

  it('uses a 7 or 8 to look at a card of its own it doesn’t know', () => {
    const s = power(table({}, [true, true, false, true]), 'peek', c(7, 'C'));
    expect(ask(s, 'wren')).toEqual({ type: 'peekOwn', slot: 2 });
    const all = power(table({}, [true, true, true, true]), 'peek', c(8, 'C'));
    expect(ask(all, 'wren')).toEqual({ type: 'skipPower' });
  });

  it('uses a 9 or 10 to spy on a card it doesn’t know', () => {
    let s = power(table(), 'spy', c(9, 'C'));
    s = withKnown(s, 'wren', 'rook', [true, true, true, false]);
    s = withKnown(s, 'wren', 'magpie', [true, true, true, true]);
    expect(ask(s, 'wren')).toEqual({ type: 'spy', player: 'rook', slot: 3 });
  });

  it('never spies on the caller, and skips if there is no one to spy on', () => {
    let s = power(table({ caller: 'rook' }), 'spy', c(9, 'C'));
    expect(ask(s, 'wren')).toMatchObject({ type: 'spy', player: 'magpie' });
    s = withKnown(s, 'wren', 'magpie', [true, true, true, true]);
    expect(ask(s, 'wren')).toEqual({ type: 'skipPower' });
  });

  it('swaps a known high card of its own for an opponent’s unknown one with a Jack or Queen', () => {
    const s = power(
      table({}, [false, true, false, false], {
        wren: [c(2), c(12, 'C'), c(3), c(4)],
        rook: R,
        magpie: M,
      }),
      'swap',
      c(11, 'C'),
    );
    const a = ask(s, 'wren');
    expect(a).toMatchObject({ type: 'swap', mySlot: 1 });
  });

  it('prefers an opponent’s known low card for a swap', () => {
    let s = power(
      table({}, [false, true, false, false], {
        wren: [c(2), c(12, 'C'), c(3), c(4)],
        rook: R,
        magpie: M,
      }),
      'swap',
      c(11, 'C'),
    );
    s = withKnown(s, 'wren', 'magpie', [false, false, false, true]);
    // magpie's slot 3 is an Ace.
    expect(ask(s, 'wren')).toEqual({ type: 'swap', mySlot: 1, player: 'magpie', slot: 3 });
  });

  it('skips a swap when it has no known high card to give away', () => {
    const s = power(table({}, [true, true, true, true]), 'swap', c(11, 'C'));
    expect(ask(s, 'wren')).toEqual({ type: 'skipPower' });
    expect(ask(power(table(), 'swap', c(11, 'C')), 'wren')).toEqual({ type: 'skipPower' });
  });

  it('never swaps with the caller', () => {
    const hands = { wren: [c(2), c(12, 'C'), c(3), c(4)], rook: R, magpie: M };
    const s = power(
      table({ caller: 'rook' }, [false, true, false, false], hands),
      'swap',
      c(11, 'C'),
    );
    expect(ask(s, 'wren')).toMatchObject({ type: 'swap', player: 'magpie' });
  });

  it('looks with a black King at its highest known card and one of theirs, then swaps if theirs is lower', () => {
    const hands = { wren: [c(2), c(12, 'C'), c(3), c(4)], rook: R, magpie: M };
    let s = power(table({}, [false, true, false, false], hands), 'king', c(13, 'S'));
    const look = ask(s, 'wren');
    expect(look).toMatchObject({ type: 'kingLook', mySlot: 1 });
    if (look?.type !== 'kingLook') throw new Error('expected a look');
    s = game.applyAction(s, 'wren', look, createRng(1), 0);
    // After looking: wren holds a Queen and has seen one of theirs.
    const seen = hands[look.player as 'rook' | 'magpie']![look.slot]!;
    const expected = cardValue(seen) < 12 ? 'kingSwap' : 'kingKeep';
    expect(ask(s, 'wren')).toEqual({ type: expected });
  });

  it('keeps after a King’s look when its own card is the lower one', () => {
    const hands = { wren: [c(2), c(1, 'C'), c(3), c(4)], rook: R, magpie: M };
    let s = power(table({}, [false, true, false, false], hands), 'king', c(13, 'S'));
    s = game.applyAction(
      s,
      'wren',
      { type: 'kingLook', mySlot: 1, player: 'rook', slot: 0 },
      createRng(1),
      0,
    );
    expect(ask(s, 'wren')).toEqual({ type: 'kingKeep' });
  });

  it('skips a King when everyone else is locked', () => {
    const s = power(table({ caller: 'rook' }, [], { wren: W, rook: R }), 'king', c(13, 'S'));
    expect(ask(s, 'wren')).toEqual({ type: 'skipPower' });
  });

  it('calls after a very long round even without knowing its cards', () => {
    expect(ask(table({ turns: 3 * 12 }), 'wren')).toEqual({ type: 'call' });
  });

  it('only plays moves the rules accept, from only its own view', () => {
    // Every decision a bot makes in a played game is applied; a refused move would throw.
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const { s } = playOut(['wren', 'rook', 'magpie', 'robin'], { goal: '3 rounds' }, 11, level);
      expect(s.phase).toBe('over');
      expect(s.history).toHaveLength(3);
    }
  });
});
