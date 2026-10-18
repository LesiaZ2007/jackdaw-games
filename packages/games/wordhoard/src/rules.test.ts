import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { COUNTS, PREMIUM, SIZE, checkPlay, emptyBoard, type Placement } from './board';
import { wordhoard as game, type WordhoardAction, type WordhoardState } from './rules';
import { isWord } from './words';

const ids = ['a', 'b'];
const start = (seed = 1) =>
  game.setup({
    playerIds: ids,
    options: { pairs: 'Past four players', turnTimer: 'Off' },
    rng: createRng(seed),
    now: 0,
  });
const act = (s: WordhoardState, who: string, a: WordhoardAction) =>
  game.applyAction(s, who, a, createRng(9), 0);
const across = (row: number, col: number, word: string): Placement[] =>
  [...word].map((letter, i) => ({ row, col: col + i, letter }));

/** A game where it's a's turn and the racks are chosen. */
function rigged(a: string, b = 'EEEEEEE'): WordhoardState {
  const s = start();
  return { ...s, turn: 'a', racks: { a: [...a], b: [...b] } };
}

describe('the word list', () => {
  it('knows real words and refuses others', () => {
    expect(isWord('jackdaw')).toBe(true);
    expect(isWord('HOARD')).toBe(true);
    expect(isWord('aa')).toBe(true);
    expect(isWord('zyzzyvas')).toBe(true);
    expect(isWord('qzx')).toBe(false);
    expect(isWord('jackdaws')).toBe(true);
    expect(isWord('QI')).toBe(true);
    expect(isWord('emoji')).toBe(true);
  });
});

describe('the board', () => {
  it('is symmetrical, with a double word on the star and 100 tiles in the bag', () => {
    expect(PREMIUM[7]![7]).toBe('dw');
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++) {
        expect(PREMIUM[r]![c]).toBe(PREMIUM[c]![r]);
        expect(PREMIUM[r]![c]).toBe(PREMIUM[SIZE - 1 - r]![c]);
      }
    expect(Object.values(COUNTS).reduce((x, y) => x + y, 0)).toBe(100);
  });

  it('needs the first word on the star, in one line, with no gaps', () => {
    const b = emptyBoard();
    expect(checkPlay(b, across(0, 0, 'CAT'))).toMatchObject({ ok: false, reason: /star/ });
    expect(
      checkPlay(b, [
        { row: 7, col: 7, letter: 'A' },
        { row: 8, col: 8, letter: 'T' },
      ]),
    ).toMatchObject({ ok: false, reason: /one row or one column/ });
    expect(
      checkPlay(b, [
        { row: 7, col: 7, letter: 'A' },
        { row: 7, col: 9, letter: 'T' },
      ]),
    ).toMatchObject({ ok: false, reason: /gaps/ });
  });

  it('scores letters with the bonus squares under new tiles only', () => {
    const b = emptyBoard();
    // CAT across the star (7,7 is a double word): (3 + 1 + 1) × 2.
    const first = checkPlay(b, across(7, 6, 'CAT'));
    expect(first).toMatchObject({ ok: true, score: 10 });
    b[7]![6] = { letter: 'C' };
    b[7]![7] = { letter: 'A' };
    b[7]![8] = { letter: 'T' };
    // S on the end makes CATS; the star's double no longer counts.
    const cats = checkPlay(b, [{ row: 7, col: 9, letter: 'S' }]);
    expect(cats).toMatchObject({ ok: true, score: 6 });
    // A tile that doesn't touch anything is refused.
    expect(checkPlay(b, [{ row: 0, col: 0, letter: 'A' }])).toMatchObject({
      ok: false,
      reason: /join/,
    });
  });

  it('counts the cross words a play makes, and 50 more for all seven tiles', () => {
    const b = emptyBoard();
    b[7]![7] = { letter: 'A' };
    b[7]![8] = { letter: 'T' };
    // O above A and N above T make ON across and OA, NT down... AT stays.
    const r = checkPlay(b, across(6, 7, 'ON'));
    expect(r.ok && r.words.map((w) => w.word).sort()).toEqual(['NT', 'OA', 'ON']);
    const seven = checkPlay(emptyBoard(), across(7, 4, 'JACKDAW'));
    expect(seven).toMatchObject({ ok: true, bingo: true });
    expect(seven.ok && seven.score).toBeGreaterThan(50);
  });
});

describe('playing', () => {
  it('deals seven tiles each and keeps racks and the bag off the table', () => {
    const s = start();
    expect(s.racks['a']).toHaveLength(7);
    expect(s.bag).toHaveLength(100 - 14);
    const table = JSON.stringify(game.getTableView(s));
    expect(table).not.toMatch(/"(bag|racks|rack)"/);
    const mine = game.getPlayerView(s, 'a');
    expect(mine.rack).toEqual(s.racks['a']);
    expect(JSON.stringify(mine)).not.toContain('"racks"');
    expect(mine.rackCounts).toEqual({ a: 7, b: 7 });
  });

  it('plays a real word, scores it, draws back up and passes the turn', () => {
    let s = rigged('CATSXYZ');
    s = act(s, 'a', { type: 'play', tiles: across(7, 6, 'CAT') });
    expect(s.scores['a']).toBe(10);
    expect(s.racks['a']).toHaveLength(7);
    expect(s.turn).toBe('b');
    expect(s.moves.at(-1)).toMatchObject({ kind: 'play', score: 10, words: [{ word: 'CAT' }] });
  });

  it('refuses words not in the list, tiles you don’t have, and moves out of turn', () => {
    const s = rigged('QZXCATS');
    expect(() => act(s, 'b', { type: 'pass' })).toThrow(/not your turn/);
    expect(() => act(s, 'a', { type: 'play', tiles: across(7, 6, 'QZX') })).toThrow(
      /QZX isn’t in the word list/,
    );
    expect(() => act(s, 'a', { type: 'play', tiles: across(7, 6, 'DOG') })).toThrow(GameError);
  });

  it('plays a blank as any letter, worth nothing', () => {
    let s = rigged('C?TXXXX');
    s = act(s, 'a', {
      type: 'play',
      tiles: [
        { row: 7, col: 6, letter: 'C' },
        { row: 7, col: 7, letter: 'A', blank: true },
        { row: 7, col: 8, letter: 'T' },
      ],
    });
    expect(s.board[7]![7]).toEqual({ letter: 'A', blank: true });
    expect(s.scores['a']).toBe((3 + 0 + 1) * 2);
  });

  it('swaps tiles back into the bag', () => {
    let s = rigged('QQQQQQQ');
    s = { ...s, racks: { ...s.racks, a: ['Q', 'Z', 'X', 'A', 'B', 'C', 'D'] } };
    const before = s.bag.length;
    s = act(s, 'a', { type: 'swap', tiles: ['Q', 'Z'] });
    expect(s.racks['a']).toHaveLength(7);
    expect(s.bag).toHaveLength(before);
    expect(s.moves.at(-1)).toMatchObject({ kind: 'swap', count: 2 });
    expect(JSON.stringify(game.getTableView(s))).not.toContain('"Q"');
  });

  it('ends after six scoreless turns, everyone losing what’s on their rack', () => {
    let s = rigged('AAAAAAA', 'BBBBBBB');
    for (let i = 0; i < 6; i++) s = act(s, s.turn, { type: 'pass' });
    expect(s.over).toBe(true);
    expect(s.scores).toEqual({ a: -7, b: -21 });
    const r = game.getResult(s)!;
    expect(r.winners).toEqual(['a']);
    expect(r.summary).not.toMatch(/\{/);
  });

  it('ends when someone uses their last tile with the bag empty', () => {
    let s = rigged('CAT', 'QZ');
    s = { ...s, bag: [] };
    s = act(s, 'a', { type: 'play', tiles: across(7, 6, 'CAT') });
    expect(s.over).toBe(true);
    // a went out: +20 from b's Q and Z, b loses 20.
    expect(s.endBonus).toEqual({ a: 20, b: -20 });
    expect(s.scores).toEqual({ a: 30, b: -20 });
  });
});

describe('pairs', () => {
  const five = ['a', 'b', 'c', 'd', 'e'];
  const pairs = (seed = 3) =>
    game.setup({
      playerIds: five,
      options: { pairs: 'Past four players', turnTimer: 'Off' },
      rng: createRng(seed),
      now: 0,
    });

  it('pairs past four players (or always), one alone with an odd number', () => {
    const s = pairs();
    expect(s.sides.map((x) => x.length)).toEqual([2, 2, 1]);
    expect(s.sides.flat().sort()).toEqual(five);
    expect(Object.keys(s.racks)).toHaveLength(3);
    expect(game.validateOptions!({ pairs: 'Always', turnTimer: 'Off' }, 8)).toBeNull();
    expect(game.validateOptions!({ pairs: 'Always', turnTimer: 'Off' }, 2)).toMatch(/three/);
    const four = game.setup({
      playerIds: ['a', 'b', 'c', 'd'],
      options: { pairs: 'Always', turnTimer: 'Off' },
      rng: createRng(1),
      now: 0,
    });
    expect(four.sides.map((x) => x.length)).toEqual([2, 2]);
  });

  it('shares a rack and a score between partners, and either can play', () => {
    let s = pairs();
    const [x, y] = s.sides[0]!;
    s = { ...s, turn: x!, racks: { ...s.racks, [x!]: [...'CATSXYZ'] } };
    expect(game.getPlayerView(s, y!).rack).toEqual(game.getPlayerView(s, x!).rack);
    const other = s.sides[1]![0]!;
    expect(game.getPlayerView(s, other).rack).not.toEqual(s.racks[x!]);
    expect(() => act(s, other, { type: 'pass' })).toThrow(/not your turn/);
    s = act(s, y!, { type: 'play', tiles: across(7, 6, 'CAT') });
    expect(s.scores[x!]).toBe(10);
    expect(s.moves.at(-1)?.player).toBe(y);
    expect(s.turn).toBe(other);
    const table = JSON.stringify(game.getTableView(s));
    expect(table).not.toMatch(/"(bag|racks|rack)"/);
  });

  it('wins together', () => {
    let s = pairs();
    const [x, y] = s.sides[0]!;
    s = { ...s, scores: { ...s.scores, [x!]: 99 } };
    for (let i = 0; i < 6; i++)
      s = act(s, s.sides.find((p) => p[0] === s.turn)![0]!, { type: 'pass' });
    const r = game.getResult(s)!;
    expect(r.winners.sort()).toEqual([x, y].sort());
    expect(r.standings!.filter((st) => st.outcome === 'win')).toHaveLength(2);
  });
});

describe('the turn timer', () => {
  it('passes for the side to play when time runs out, and restarts after every move', () => {
    let s = game.setup({
      playerIds: ids,
      options: { pairs: 'Past four players', turnTimer: '1 minute' },
      rng: createRng(1),
      now: 1_000,
    });
    const first = s.turn;
    expect(game.nextTimer!(s)).toEqual({ id: 'turn', at: 61_000 });
    s = game.onTimer!(s, 'turn', createRng(2), 61_000);
    expect(s.moves).toEqual([{ player: first, kind: 'pass', score: 0, late: true }]);
    expect(s.turn).not.toBe(first);
    expect(game.getTableView(s).turnBy).toBe(121_000);
    s = game.applyAction(s, s.turn, { type: 'pass' }, createRng(3), 70_000);
    expect(game.nextTimer!(s)).toEqual({ id: 'turn', at: 130_000 });
    expect(game.nextTimer!(start())).toBeNull();
  });
});
