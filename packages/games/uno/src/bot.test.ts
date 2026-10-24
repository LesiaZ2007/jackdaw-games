import { createRng, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { DECK_SIZE, cardOf } from './cards';
import { uno as game, type UnoAction, type UnoOptions, type UnoState } from './rules';

const opts = (o: Partial<UnoOptions> = {}): UnoOptions => ({ ...game.defaultOptions(3), ...o });
const deal = (players: string[], o: Partial<UnoOptions> = {}, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });

const ask = (s: UnoState, pid: string, seed = 1): UnoAction | null =>
  game.bot!({
    playerId: pid,
    playerIds: s.players,
    view: game.getPlayerView(s, pid),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now: 0,
  });

/** A round in progress with these hands, red 5 on the pile, the first player to act. */
function table(hands: Record<string, number[]>, over: Partial<UnoState> = {}): UnoState {
  const s = deal(Object.keys(hands));
  const used = new Set([...Object.values(hands).flat(), 4]);
  return {
    ...s,
    hands,
    discard: [9],
    colour: 'r',
    toAct: Object.keys(hands)[0]!,
    dir: 1,
    deck: Array.from({ length: DECK_SIZE }, (_, i) => i).filter((i) => !used.has(i) && i !== 9),
    ...over,
  };
}

/**
 * Plays as the platform does: the first bot in seat order with a move makes it; when none has
 * one, the next timer fires (the deal between rounds).
 */
function playOut(players: string[], o: Partial<UnoOptions>, seed: number, cap: number) {
  let s = deal(players, o, seed);
  const rng: Rng = createRng(seed * 17 + 3);
  let moves = 0;
  let now = 0;
  while (s.phase !== 'over' && moves < cap) {
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
  const cases: [number, Partial<UnoOptions>][] = [
    [2, { length: 'One round' }],
    [2, { length: 'To 200 points', stacking: 'Yes' }],
    [5, { length: 'To 200 points' }],
    [5, { length: 'To 500 points', drawing: 'Draw until you can play' }],
    [7, { length: 'One round', stacking: 'Yes', turnTimer: '30 seconds' }],
    [10, { length: 'To 200 points', drawing: 'Draw until you can play', stacking: 'Yes' }],
    [10, { length: 'To 500 points' }],
  ];
  const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'jay', 'owl', 'kite', 'tit'];
  for (const [n, o] of cases)
    for (const seed of [1, 2, 3])
      it(`finishes a game of ${n} bots (${JSON.stringify(o)}, seed ${seed})`, () => {
        const { s, moves } = playOut(birds.slice(0, n), o, seed, 5000);
        expect(s.phase, `after ${moves} moves, round ${s.round}`).toBe('over');
        expect(game.getResult(s)).not.toBe(null);
      });

  it('waits off its turn, and between rounds', () => {
    const s = table({ a: [10, 30], b: [11, 31] });
    expect(ask(s, 'b')).toBe(null);
    expect(ask({ ...s, phase: 'done', toAct: null }, 'a')).toBe(null);
  });

  it('plays a matching card, calling UNO as it goes down to one', () => {
    // Red 5 on the pile; a holds red 7 (13) and blue 3 (80).
    const s = table({ a: [13, 80], b: [30, 31, 32] });
    expect(ask(s, 'a')).toEqual({ type: 'play', card: 13, call: true });
  });

  it('draws when nothing goes, and keeps a drawn Wild Draw Four rather than bluff', () => {
    const s = table({ a: [30, 80], b: [31, 32] });
    expect(ask(s, 'a')).toEqual({ type: 'draw' });
    const drew = { ...table({ a: [30, 80, 104, 2], b: [31, 32] }), drawn: 104 };
    expect(ask(drew, 'a')).toEqual({ type: 'pass' });
  });

  it('saves its wilds, but names its best colour when a wild is all it has', () => {
    const s = table({ a: [100, 13, 80], b: [31, 32] });
    expect(ask(s, 'a')).toMatchObject({ type: 'play', card: 13 });
    const wild = table({ a: [100, 76, 78], b: [31, 32] });
    expect(ask(wild, 'a')).toEqual({ type: 'play', card: 100, colour: 'b', call: false });
  });

  it('hits a player about to go out with an action card', () => {
    // a holds red 9 (17) and red Skip (19); b is down to one.
    const s = table({ a: [17, 19, 80], b: [31] });
    expect(ask(s, 'a')).toMatchObject({ type: 'play', card: 19 });
  });

  it('catches a player who forgot to call, and calls its own', () => {
    const s = table({ a: [30, 31], b: [32] }, { uncalled: 'b' });
    expect(ask(s, 'a')).toEqual({ type: 'catch' });
    expect(ask({ ...s, uncalled: null }, 'b')).toEqual({ type: 'call' });
  });

  it('takes a Draw Two, or passes it on when stacking', () => {
    const pending = { count: 2, from: 'b', wild4: false, bluff: false };
    const s = table({ a: [23, 30], b: [31, 32] }, { pending });
    expect(ask(s, 'a')).toEqual({ type: 'draw' });
    expect(ask({ ...s, stacking: true }, 'a')).toMatchObject({ type: 'play', card: 23 });
  });

  it('only ever names a real colour for a wild', () => {
    for (let seed = 1; seed < 20; seed++) {
      const a = ask(table({ a: [104, 105], b: [31, 32] }), 'a', seed);
      expect(a?.type).toBe('play');
      if (a?.type === 'play') expect(['r', 'y', 'g', 'b']).toContain(a.colour);
      expect(cardOf(a?.type === 'play' ? a.card : 0).face).toBe('wild4');
    }
  });
});

describe('ending early', () => {
  it('one round: nothing before the first move, then the fewest cards wins', () => {
    const s = deal(['a', 'b', 'c'], { length: 'One round' });
    expect(game.partialResult!(s)).toBe(null);
    const mid = table({ a: [1, 2, 3], b: [4], c: [5, 6] }, { seq: 5, target: 0 });
    const r = game.partialResult!(mid)!;
    expect(r.winners).toEqual(['b']);
    expect(r.summary).toBe('Fewest cards left: 1 card');
    expect(r.standings!.map((x) => x.outcome)).toEqual(['loss', 'win', 'loss']);
  });

  it('to a target: nothing before a round ends, then the points leader; ties share', () => {
    const s = deal(['a', 'b', 'c'], { length: 'To 500 points' });
    expect(game.partialResult!({ ...s, seq: 9 })).toBe(null);
    const last = { round: 2, winner: 'b', points: 40, left: {} };
    const led = { ...s, round: 3, last, scores: { a: 30, b: 70, c: 0 } };
    const r = game.partialResult!(led)!;
    expect(r.winners).toEqual(['b']);
    expect(r.summary).toBe('Led with 70 points after 2 rounds');
    expect(r.standings!.find((x) => x.playerId === 'b')).toMatchObject({
      outcome: 'win',
      role: '70 points',
    });
    const tie = game.partialResult!({ ...led, scores: { a: 70, b: 70, c: 0 } })!;
    expect(tie.winners).toEqual(['a', 'b']);
    expect(tie.summary).toBe('2 players tied on 70 points after 2 rounds');
    expect(tie.standings!.map((x) => x.outcome)).toEqual(['draw', 'draw', 'loss']);
  });

  it('between rounds, counts the round just finished', () => {
    const s = deal(['a', 'b'], { length: 'To 500 points' });
    const last = { round: 1, winner: 'a', points: 50, left: {} };
    const r = game.partialResult!({
      ...s,
      phase: 'done',
      toAct: null,
      last,
      scores: { a: 50, b: 0 },
    })!;
    expect(r.summary).toBe('Led with 50 points after 1 round');
  });
});
