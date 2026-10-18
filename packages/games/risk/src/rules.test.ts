import { createRng, GameError, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { NEUTRAL, reinforcementCount, territoriesOf } from './board';
import type { Card } from './cards';
import { MAPS } from './maps';
import { risk as game, type RiskAction, type RiskOptions, type RiskState } from './rules';

const ids3 = ['a', 'b', 'c'];
const opts = (o: Partial<RiskOptions> = {}): RiskOptions => ({ ...game.defaultOptions(3), ...o });
const start = (players = ids3, o: Partial<RiskOptions> = {}, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: RiskState, who: string, a: RiskAction, rng: Rng = createRng(7), now = 0) =>
  game.applyAction(s, who, a, rng, now);
const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
const armiesOf = (s: RiskState, pid: string) =>
  sum(territoriesOf(s.owner, pid).map((t) => s.armies[t]!));
const world = MAPS.world;
const tids = world.territories.map((t) => t.id);

describe('setup', () => {
  it('deals every territory and the right starting armies', () => {
    const s = start();
    expect(Object.keys(s.owner)).toHaveLength(42);
    for (const t of tids) expect(s.armies[t]).toBeGreaterThanOrEqual(1);
    for (const p of ids3) expect(territoriesOf(s.owner, p)).toHaveLength(14);
    // The first player hasn't placed their reinforcements yet.
    for (const p of ids3) expect(armiesOf(s, p)).toBe(35);
  });

  it('gives two players a passive neutral with 40 armies over 14 territories', () => {
    const s = start(['a', 'b']);
    expect(s.neutral).toBe(true);
    expect(territoriesOf(s.owner, NEUTRAL)).toHaveLength(14);
    expect(armiesOf(s, NEUTRAL)).toBe(40);
    expect(s.seats).toEqual(['a', 'b']);
  });

  it('quick setup starts in reinforce for the first player', () => {
    const s = start();
    expect(s.phase).toBe('reinforce');
    expect(ids3).toContain(s.turn);
    expect(s.toPlace).toBe(reinforcementCount(world, s.owner, s.turn));
    expect(s.round).toBe(1);
  });

  it('draft setup starts in draft with what each player has left to place', () => {
    const s = start(ids3, { setup: 'Draft' });
    expect(s.phase).toBe('draft');
    for (const p of ids3) expect(s.drafts![p]).toEqual({ left: 35 - 14, placed: null });
    for (const p of ids3) expect(armiesOf(s, p)).toBe(14);
  });

  it('plays on the realm when asked', () => {
    const s = start(ids3, { map: 'Realm' });
    expect(s.map).toBe('realm');
    expect(Object.keys(s.owner).sort()).toEqual(MAPS.realm.territories.map((t) => t.id).sort());
  });

  it('deals missions only for secret missions', () => {
    expect(Object.keys(start().missions!)).toEqual(ids3);
    expect(start(ids3, { goal: 'World domination' }).missions).toBeNull();
  });
});

describe('options', () => {
  it('default to the world, secret missions, quick, rising sets and no timer', () => {
    expect(game.defaultOptions(3)).toEqual({
      map: 'World',
      goal: 'Secret missions',
      setup: 'Quick',
      cardSets: 'Rising',
      turnTimer: 'Off',
    });
  });
});

describe('views', () => {
  const s = (() => {
    const base = start();
    const card = (id: string): Card => ({ id, territory: id, symbol: 'infantry' });
    const wild: Card = { id: 'wild-2', territory: null, symbol: 'wild' };
    return { ...base, hands: { a: [card('alaska')], b: [wild], c: [] } };
  })();

  it('the table view hides hands, missions and the deck', () => {
    const tv = game.getTableView(s);
    const json = JSON.stringify(tv);
    expect(json).not.toContain('"hands"');
    expect(json).not.toContain('"deck"');
    expect(json).not.toContain('"discard"');
    expect(tv.missions).toBeNull();
    expect(tv.handCounts).toEqual({ a: 1, b: 1, c: 0 });
    expect(json).not.toContain('wild-2');
  });

  it('a player sees only their own hand and mission', () => {
    const v = game.getPlayerView(s, 'a');
    expect(v.hand.map((c) => c.id)).toEqual(['alaska']);
    expect(v.mission).toEqual(s.missions!.a);
    expect(JSON.stringify(v)).not.toContain('wild-2');
  });
});

const card = (id: string, symbol: Card['symbol'], territory: string | null = id): Card => ({
  id,
  territory,
  symbol,
});

function expectError(f: () => unknown, code?: string) {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    if (code) expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error('expected a GameError');
}

describe('the draft', () => {
  const s0 = start(ids3, { setup: 'Draft' });
  const placeAll = (s: RiskState, p: string) =>
    act(s, p, {
      type: 'draft',
      placements: { [territoriesOf(s.owner, p)[0]!]: s.drafts![p]!.left },
    });

  it('keeps placements hidden until everyone is done, then shows them all', () => {
    const s1 = placeAll(s0, 'a');
    expect(s1.armies).toEqual(s0.armies);
    expect(game.getPlayerView(s1, 'a').draft).not.toBeNull();
    expect(game.getPlayerView(s1, 'b').draft).toBeNull();
    expect(game.getTableView(s1).draftDone).toEqual(['a']);
    expect(JSON.stringify(game.getTableView(s1))).not.toContain('"placed"');
    const s3 = placeAll(placeAll(s1, 'b'), 'c');
    for (const p of ids3) expect(armiesOf(s3, p)).toBe(35);
    expect(s3.phase).toBe('reinforce');
    expect(s3.drafts).toBeNull();
    expect(s3.toPlace).toBe(reinforcementCount(world, s3.owner, s3.turn));
  });

  it('refuses a wrong total, someone else’s territory, and drafting twice', () => {
    const mine = territoriesOf(s0.owner, 'a');
    const theirs = territoriesOf(s0.owner, 'b');
    expectError(() => act(s0, 'a', { type: 'draft', placements: { [mine[0]!]: 1 } }));
    expectError(() => act(s0, 'a', { type: 'draft', placements: { [theirs[0]!]: 21 } }));
    expectError(() => placeAll(placeAll(s0, 'a'), 'a'));
  });
});

describe('trading cards', () => {
  const s = start();
  const p = s.turn;
  const other = s.seats.find((x) => x !== p)!;
  const mine = territoriesOf(s.owner, p)[0]!;
  const theirs = territoriesOf(s.owner, other)[0]!;
  const withHand = (hand: Card[]) => ({ ...s, hands: { ...s.hands, [p]: hand } });

  it('adds the set’s value, plus 2 armies on a traded territory you hold', () => {
    const hand = [card(mine, 'infantry'), card(theirs, 'infantry'), card('wild-1', 'wild', null)];
    const s1 = act(withHand(hand), p, { type: 'trade', cards: [mine, theirs, 'wild-1'] });
    expect(s1.toPlace).toBe(s.toPlace + 4);
    expect(s1.armies[mine]).toBe(s.armies[mine]! + 2);
    expect(s1.armies[theirs]).toBe(s.armies[theirs]);
    expect(s1.hands[p]).toEqual([]);
    expect(s1.setsTraded).toBe(1);
    expect(s1.discard).toHaveLength(3);
  });

  it('refuses cards you don’t hold, or that aren’t a set', () => {
    const hand = [card('x', 'infantry'), card('y', 'infantry'), card('z', 'cavalry')];
    expectError(() => act(withHand(hand), p, { type: 'trade', cards: ['x', 'y', 'z'] }));
    expectError(() => act(withHand(hand), p, { type: 'trade', cards: ['x', 'y', 'q'] }));
    expectError(() => act(withHand(hand), p, { type: 'trade', cards: ['x', 'x', 'y'] }));
  });

  it('with 5 cards you must trade before placing', () => {
    const hand = ['p', 'q', 'r', 's', 't'].map((id) => card(id, 'cavalry'));
    expectError(
      () => act(withHand(hand), p, { type: 'reinforce', placements: { [mine]: s.toPlace } }),
      'must-trade',
    );
  });
});

describe('reinforcing', () => {
  const s = start();
  const p = s.turn;
  const other = s.seats.find((x) => x !== p)!;
  const [m1, m2] = territoriesOf(s.owner, p);

  it('places exactly what you have, on your own territories, then you attack', () => {
    const s1 = act(s, p, { type: 'reinforce', placements: { [m1!]: s.toPlace - 1, [m2!]: 1 } });
    expect(s1.armies[m1!]).toBe(s.armies[m1!]! + s.toPlace - 1);
    expect(s1.armies[m2!]).toBe(s.armies[m2!]! + 1);
    expect(s1.toPlace).toBe(0);
    expect(s1.phase).toBe('attack');
  });

  it('refuses the wrong total or someone else’s territory', () => {
    const theirs = territoriesOf(s.owner, other)[0]!;
    expectError(() => act(s, p, { type: 'reinforce', placements: { [m1!]: s.toPlace + 1 } }));
    expectError(() => act(s, p, { type: 'reinforce', placements: { [m1!]: s.toPlace - 1 } }));
    expectError(() =>
      act(s, p, { type: 'reinforce', placements: { [m1!]: s.toPlace - 1, [theirs]: 1 } }),
    );
    expectError(() => act(s, p, { type: 'reinforce', placements: { nowhere: s.toPlace } }));
  });

  it('refuses moves out of turn and out of phase', () => {
    expectError(() => act(s, other, { type: 'reinforce', placements: { [m1!]: s.toPlace } }));
    expectError(() => act(s, p, { type: 'attack', from: m1!, to: m2!, mode: 'roll' }));
    expectError(() => act(s, p, { type: 'endTurn' }));
    const s1 = act(s, p, { type: 'reinforce', placements: { [m1!]: s.toPlace } });
    expectError(() => act(s1, p, { type: 'reinforce', placements: { [m1!]: 1 } }));
    expectError(() => act(s1, 'nobody', { type: 'endAttack' }));
  });
});
