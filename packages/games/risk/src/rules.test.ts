import { createRng, GameError, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { NEUTRAL, reinforcementCount, territoriesOf } from './board';
import type { Card } from './cards';
import { visibleTo } from './fog';
import { MAPS } from './maps';
import type { Mission } from './missions';
import {
  risk as game,
  legalMoves,
  type RiskAction,
  type RiskOptions,
  type RiskState,
} from './rules';

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

/** A rigged dice cup: `int(6)` returns the faces given (1–6), in order. */
function dice(...faces: number[]): Rng {
  const base = createRng(3);
  let i = 0;
  return {
    next: () => base.next(),
    int: (n: number) => (n === 6 && i < faces.length ? faces[i++]! - 1 : base.int(n)),
    pick: (xs) => base.pick(xs),
    shuffle: (xs) => base.shuffle(xs),
    get state() {
      return base.state;
    },
  };
}

/**
 * A board where `a` is to move (in `phase`); `c` holds `layout.c` if playing; `b` holds the rest.
 * Every territory has 1 army unless `layout.armies` says otherwise; nobody holds cards.
 */
function staged(
  layout: { a: string[]; c?: string[]; armies?: Record<string, number> },
  phase: RiskState['phase'] = 'attack',
  players = ['a', 'b'],
): RiskState {
  const s = start(players, { goal: 'World domination' });
  const holder = (t: string) => (layout.a.includes(t) ? 'a' : layout.c?.includes(t) ? 'c' : 'b');
  const owner = Object.fromEntries(tids.map((t) => [t, holder(t)]));
  const armies = Object.fromEntries(tids.map((t) => [t, layout.armies?.[t] ?? 1]));
  return {
    ...s,
    neutral: false,
    owner,
    armies,
    phase,
    turn: 'a',
    first: 'a',
    toPlace: 0,
    hands: Object.fromEntries(players.map((p) => [p, [] as Card[]])),
  };
}

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
  it('default to the world, secret missions, quick, rising sets, no timer and no fog', () => {
    expect(game.defaultOptions(3)).toEqual({
      map: 'World',
      goal: 'Secret missions',
      setup: 'Quick',
      cardSets: 'Rising',
      turnTimer: 'Off',
      fog: false,
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

  it('gives the 2 armies for a territory you hold once a turn, however many sets you trade', () => {
    const [m1, m2] = territoriesOf(s.owner, p);
    const hand = [
      card(m1!, 'infantry'),
      card('x1', 'infantry', null),
      card('w1', 'wild', null),
      card(m2!, 'cavalry'),
      card('x2', 'cavalry', null),
      card('w2', 'wild', null),
    ];
    const s1 = act(withHand(hand), p, { type: 'trade', cards: [m1!, 'x1', 'w1'] });
    const s2 = act(s1, p, { type: 'trade', cards: [m2!, 'x2', 'w2'] });
    expect(s2.armies[m1!]).toBe(s.armies[m1!]! + 2);
    expect(s2.armies[m2!]).toBe(s.armies[m2!]);
    // A new turn earns it again.
    expect(s2.tradeBonus).toBe(true);
    const after = { ...s2, toPlace: 0, phase: 'fortify' as const };
    expect(act(after, p, { type: 'endTurn' }).tradeBonus).toBe(false);
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

describe('attacking', () => {
  const ak = (from = 'alaska', to = 'kamchatka', mode: 'roll' | 'blitz' = 'roll') =>
    ({ type: 'attack', from, to, mode }) as const;

  it('rolls up to 3 dice against up to 2; the defender wins ties', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 4, kamchatka: 2 } });
    const s1 = act(s, 'a', ak(), dice(6, 5, 1, 5, 5));
    expect(s1.battle).toMatchObject({
      attacker: 'a',
      defender: 'b',
      attackDice: [6, 5, 1],
      defendDice: [5, 5],
      attackerLost: 1,
      defenderLost: 1,
      conquered: false,
      ended: false,
    });
    expect(s1.armies.alaska).toBe(3);
    expect(s1.armies.kamchatka).toBe(1);
  });

  it('a roll is one exchange; the battle ends when the attacker is down to 1', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 2, kamchatka: 3 } });
    const s1 = act(s, 'a', ak(), dice(1, 6, 6));
    expect(s1.battle).toMatchObject({ attackDice: [1], defendDice: [6, 6], ended: true });
    expect(s1.armies.alaska).toBe(1);
    expect(s1.phase).toBe('attack');
  });

  it('blitz fights until the territory falls or the attacker is down to 1', () => {
    const big = staged({ a: ['alaska'], armies: { alaska: 30, kamchatka: 3 } });
    const s1 = act(big, 'a', ak('alaska', 'kamchatka', 'blitz'), createRng(5));
    expect(s1.battle).toMatchObject({ mode: 'blitz', ended: true });
    expect(s1.battle!.conquered || s1.armies.alaska === 1).toBe(true);
    expect(s1.battle!.attackerLost + s1.battle!.defenderLost).toBeGreaterThan(0);
    const small = staged({ a: ['alaska'], armies: { alaska: 2, kamchatka: 5 } });
    const s2 = act(small, 'a', ak('alaska', 'kamchatka', 'blitz'), dice(1, 6, 6, 6, 6));
    expect(s2.armies.alaska).toBe(1);
    expect(s2.armies.kamchatka).toBe(5);
    expect(s2.battle).toMatchObject({ attackerLost: 1, defenderLost: 0, ended: true });
  });

  it('a run of Rolls on one border adds up both sides’ losses for the verdict', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 4, kamchatka: 3 } });
    // 6 5 1 against 6 1: one each. Then 6 6 against 1 1: the defender loses both and it falls.
    const s1 = act(s, 'a', ak(), dice(6, 5, 1, 6, 1));
    const s2 = act(s1, 'a', ak(), dice(6, 6, 1, 1));
    expect(s2.battle).toMatchObject({
      conquered: true,
      attackerLost: 0,
      defenderLost: 2,
      runLost: { attacker: 1, defender: 3 },
    });
  });

  it('a battle counts its throws, so a blitz can say how long it took', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 4, kamchatka: 1 } });
    // First throw: three 1s against a 6 (the attacker loses one); second: 6s against a 1.
    const s1 = act(s, 'a', ak('alaska', 'kamchatka', 'blitz'), dice(1, 1, 1, 6, 6, 6, 1));
    expect(s1.battle).toMatchObject({
      throws: 2,
      conquered: true,
      attackDice: [6, 6],
      defendDice: [1],
    });
    const s2 = act(s, 'a', ak(), dice(1, 1, 1, 6));
    expect(s2.battle).toMatchObject({ throws: 1, conquered: false });
  });

  it('refuses attacks from 1 army, on yourself, past your borders, or from someone else’s land', () => {
    const s = staged({ a: ['alaska', 'alberta'], armies: { alaska: 1, alberta: 5, peru: 5 } });
    expectError(() => act(s, 'a', ak('alaska', 'kamchatka')));
    expectError(() => act(s, 'a', ak('alberta', 'alaska')));
    expectError(() => act(s, 'a', ak('alberta', 'kamchatka')));
    expectError(() => act(s, 'a', ak('peru', 'brazil')));
  });

  it('a conquest asks how many move in: at least the dice rolled, leaving 1 behind', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 4, kamchatka: 1 } });
    const s1 = act(s, 'a', ak(), dice(6, 6, 6, 1));
    expect(s1.battle).toMatchObject({ conquered: true, ended: true });
    expect(s1.owner.kamchatka).toBe('a');
    expect(s1.phase).toBe('occupy');
    expect(s1.occupy).toEqual({ from: 'alaska', to: 'kamchatka', min: 3, max: 3 });
    expectError(() => act(s1, 'a', { type: 'occupy', n: 4 }));
    expectError(() => act(s1, 'a', { type: 'occupy', n: 2 }));
    expectError(() => act(s1, 'a', ak('alaska', 'northwest-territory')));
    const s2 = act(s1, 'a', { type: 'occupy', n: 3 });
    expect([s2.armies.alaska, s2.armies.kamchatka]).toEqual([1, 3]);
    expect(s2.phase).toBe('attack');
    expect(s2.occupy).toBeNull();
    expect(s2.takenThisTurn).toBe(1);
  });

  it('can take the neutral’s territories', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 5, kamchatka: 1 } });
    const n = { ...s, owner: { ...s.owner, kamchatka: NEUTRAL } };
    const s1 = act(n, 'a', ak(), dice(6, 6, 6, 1));
    expect(s1.owner.kamchatka).toBe('a');
    expect(s1.battle!.defender).toBe(NEUTRAL);
  });

  it('taking someone’s last territory knocks them out and hands you their cards', () => {
    const s = staged(
      { a: ['alaska'], c: ['kamchatka'], armies: { alaska: 4, kamchatka: 1 } },
      'attack',
      ['a', 'b', 'c'],
    );
    const withCards = {
      ...s,
      hands: { a: [], b: [], c: [card('x', 'cavalry'), card('y', 'wild', null)] },
    };
    const s1 = act(withCards, 'a', ak(), dice(6, 6, 6, 1));
    expect(s1.eliminated).toEqual(['c']);
    expect(s1.eliminatedBy).toEqual({ c: 'a' });
    expect(s1.hands.a!.map((x) => x.id)).toEqual(['x', 'y']);
    expect(s1.hands.c).toEqual([]);
  });

  it('with 6+ cards after a knock-out you trade down and place before attacking again', () => {
    const s = staged(
      { a: ['alaska'], c: ['kamchatka'], armies: { alaska: 4, kamchatka: 1 } },
      'attack',
      ['a', 'b', 'c'],
    );
    const four = ['p', 'q', 'r', 's'].map((id) => card(id, 'infantry'));
    const two = [card('t', 'cavalry'), card('u', 'artillery')];
    const s1 = act({ ...s, hands: { a: four, b: [], c: two } }, 'a', ak(), dice(6, 6, 6, 1));
    const s2 = act(s1, 'a', { type: 'occupy', n: 3 });
    expect(s2.phase).toBe('reinforce');
    expect(s2.returnTo).toBe('attack');
    expectError(() => act(s2, 'a', ak('kamchatka', 'japan')));
    const s3 = act(s2, 'a', { type: 'trade', cards: ['p', 'q', 'r'] });
    const s4 = act(s3, 'a', { type: 'reinforce', placements: { kamchatka: s3.toPlace } });
    expect(s4.phase).toBe('attack');
    expect(s4.hands.a).toHaveLength(3);
  });

  it('counts every attack and remembers the bloodiest battle', () => {
    const s = staged({ a: ['alaska'], armies: { alaska: 10, kamchatka: 6 } });
    const s1 = act(s, 'a', ak(), dice(6, 6, 6, 1, 1));
    const s2 = act(s1, 'a', ak(), dice(6, 6, 6, 1, 1));
    expect(s2.battleSeq).toBe(s.battleSeq + 2);
    expect(s2.best.battle).toMatchObject({ pid: 'a', value: 4 });
    expect(s2.best.battle!.text).toBe('Alaska to Kamchatka');
  });
});

describe('fortifying and ending the turn', () => {
  const chain = { a: ['alaska', 'alberta', 'ontario', 'quebec'], armies: { alaska: 5 } };

  it('moves along your own chain, leaves 1 behind, and passes the turn', () => {
    const s = staged(chain, 'fortify');
    const s1 = act(s, 'a', { type: 'fortify', from: 'alaska', to: 'quebec', n: 4 });
    expect([s1.armies.alaska, s1.armies.quebec]).toEqual([1, 5]);
    expect(s1.turn).toBe('b');
    expect(s1.phase).toBe('reinforce');
    expect(s1.toPlace).toBe(reinforcementCount(world, s1.owner, 'b'));
    expectError(() => act(s, 'a', { type: 'fortify', from: 'alaska', to: 'quebec', n: 5 }));
    expectError(() => act(s, 'a', { type: 'fortify', from: 'alaska', to: 'kamchatka', n: 1 }));
    const gap = staged({ a: ['alaska', 'ontario'], armies: { alaska: 5 } }, 'fortify');
    expectError(() => act(gap, 'a', { type: 'fortify', from: 'alaska', to: 'ontario', n: 1 }));
  });

  it('can fortify straight from attacking, or end the turn without moving', () => {
    const s = staged(chain);
    expect(act(s, 'a', { type: 'fortify', from: 'alaska', to: 'alberta', n: 1 }).turn).toBe('b');
    expect(act(s, 'a', { type: 'endAttack' }).phase).toBe('fortify');
    const s1 = act(s, 'a', { type: 'endTurn' });
    expect([s1.turn, s1.phase]).toEqual(['b', 'reinforce']);
    expectError(() => act({ ...s, phase: 'reinforce', toPlace: 3 }, 'a', { type: 'endTurn' }));
  });

  it('draws a card only if you took a territory this turn', () => {
    const s = staged(chain, 'fortify');
    expect(act(s, 'a', { type: 'endTurn' }).hands.a).toHaveLength(0);
    const s1 = act({ ...s, takenThisTurn: 1 }, 'a', { type: 'endTurn' });
    expect(s1.hands.a).toHaveLength(1);
    expect(s1.deck).toHaveLength(s.deck.length - 1);
    expect(s1.takenThisTurn).toBe(0);
  });

  it('reshuffles the discard when the deck runs out; with both empty there’s no card', () => {
    const s = { ...staged(chain, 'fortify'), takenThisTurn: 1 };
    const s1 = act({ ...s, deck: [], discard: [card('d1', 'infantry')] }, 'a', { type: 'endTurn' });
    expect(s1.hands.a!.map((c) => c.id)).toEqual(['d1']);
    expect(s1.discard).toEqual([]);
    const s2 = act({ ...s, deck: [], discard: [] }, 'a', { type: 'endTurn' });
    expect(s2.hands.a).toEqual([]);
  });

  it('skips players who are out, and counts rounds from whoever went first', () => {
    const s = staged(chain, 'fortify', ['a', 'b', 'c']);
    const out = { ...s, eliminated: ['b'] };
    const s1 = act(out, 'a', { type: 'endTurn' });
    expect([s1.turn, s1.round]).toEqual(['c', s.round]);
    const s2 = act({ ...s1, phase: 'fortify' }, 'c', { type: 'endTurn' });
    expect([s2.turn, s2.round]).toEqual(['a', s.round + 1]);
  });
});

describe('winning', () => {
  const withMissions = (s: RiskState, missions: Record<string, Mission>): RiskState => ({
    ...s,
    goal: 'missions',
    missions,
  });
  const allBut = (...not: string[]) => tids.filter((t) => !not.includes(t));
  const take = (s: RiskState) =>
    act(
      s,
      'a',
      { type: 'attack', from: 'alaska', to: 'kamchatka', mode: 'roll' },
      dice(6, 6, 6, 1),
    );
  const hold24: Mission = { kind: 'territories', n: 24 };

  it('a mission completed by the mover wins at once: 24 territories', () => {
    const s = staged({ a: allBut('kamchatka').slice(0, 23), armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const s1 = take(withMissions(s, { a: hold24, b: hold24, c: hold24 }));
    expect(s1.phase).toBe('over');
    expect(s1.winner).toBe('a');
    expect(s1.actBy).toBeNull();
    expectError(() => act(s1, 'a', { type: 'occupy', n: 3 }), 'over');
  });

  it('18 territories with 2 armies each', () => {
    const mine = allBut('kamchatka').slice(0, 18);
    const armies = Object.fromEntries(mine.map((t, i) => [t, i === 0 ? 1 : 2]));
    const s = { ...staged({ a: mine, armies }, 'reinforce'), toPlace: 3 };
    const m: Mission = { kind: 'territories2', n: 18 };
    const s1 = act(withMissions(s, { a: m, b: hold24 }), 'a', {
      type: 'reinforce',
      placements: { [mine[0]!]: 3 },
    });
    expect(s1.winner).toBe('a');
  });

  it('a fortify that completes the mission wins, though the turn has passed', () => {
    const mine = allBut('kamchatka').slice(0, 18);
    expect(mine).toContain('alaska');
    expect(mine).toContain('alberta');
    const armies = Object.fromEntries(mine.map((t) => [t, 2]));
    const s = staged({ a: mine, armies: { ...armies, alaska: 1, alberta: 3 } }, 'fortify');
    const m: Mission = { kind: 'territories2', n: 18 };
    const s1 = act(withMissions(s, { a: m, b: hold24 }), 'a', {
      type: 'fortify',
      from: 'alberta',
      to: 'alaska',
      n: 1,
    });
    expect([s1.phase, s1.winner]).toEqual(['over', 'a']);
  });

  it('two continents', () => {
    const asia = world.territories.filter((t) => t.continent === 'asia').map((t) => t.id);
    const sa = world.territories.filter((t) => t.continent === 'south-america').map((t) => t.id);
    const s = staged({
      a: ['alaska', ...sa, ...asia.filter((t) => t !== 'kamchatka')],
      armies: { alaska: 4 },
    });
    const m: Mission = { kind: 'continents', ids: ['asia', 'south-america'], any: false };
    expect(take(withMissions(s, { a: m, b: hold24 })).winner).toBe('a');
  });

  it('destroying your target', () => {
    const s = staged({ a: ['alaska'], c: ['kamchatka'], armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const s1 = take(withMissions(s, { a: { kind: 'destroy', target: 'c' }, b: hold24, c: hold24 }));
    expect(s1.winner).toBe('a');
  });

  it('a destroy mission falls back to 24 territories when someone else gets there first', () => {
    // Nobody reaches 24: a ends on 22, b holds 20.
    const a20 = ['alaska', ...allBut('alaska', 'kamchatka').slice(0, 20)];
    const s = staged({ a: a20, c: ['kamchatka'], armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const s1 = take(withMissions(s, { a: hold24, b: { kind: 'destroy', target: 'c' }, c: hold24 }));
    expect(s1.winner).toBeNull();
    expect(s1.missions!.b).toEqual(hold24);
  });

  it('a knock-out that hands someone else a mission they already meet wins it for them', () => {
    // b's target, c, is taken out by a; b's mission falls back to 24 territories, which b holds.
    const s = staged({ a: ['alaska'], c: ['kamchatka'], armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const s1 = take(withMissions(s, { a: hold24, b: { kind: 'destroy', target: 'c' }, c: hold24 }));
    expect(territoriesOf(s1.owner, 'b').length).toBeGreaterThanOrEqual(24);
    expect([s1.phase, s1.winner]).toEqual(['over', 'b']);
  });

  it('world domination ends when one player is left', () => {
    const s = staged({ a: allBut('kamchatka'), armies: { alaska: 4 } });
    const s1 = take(s);
    expect([s1.phase, s1.winner]).toEqual(['over', 'a']);
  });

  it('reports the winner, everyone’s mission and the awards', () => {
    const s = staged({ a: allBut('kamchatka').slice(0, 23), armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const before = withMissions(s, { a: hold24, b: { kind: 'destroy', target: 'c' }, c: hold24 });
    expect(game.getResult(before)).toBeNull();
    const s1 = take(before);
    const r = game.getResult(s1)!;
    expect(r.winners).toEqual(['a']);
    expect(r.summary).toBe('Mission complete: hold 24 territories');
    expect(r.standings).toEqual([
      { playerId: 'a', outcome: 'win', role: 'Hold 24 territories' },
      { playerId: 'b', outcome: 'loss', role: 'Destroy an army' },
      { playerId: 'c', outcome: 'loss', role: 'Hold 24 territories' },
    ]);
    expect(r.highlights!.map((h) => h.award)).toEqual(['Bloodiest battle', 'Greatest conquest']);
    // The seat order, so the final map keeps everyone's army colours.
    expect((r.reveal as { seats: string[] }).seats).toEqual(['a', 'b', 'c']);
    expect(game.getTableView(s1).missions).toEqual(s1.missions);
  });

  it('announces knock-outs, continents taken and the win', () => {
    const s = staged({ a: allBut('kamchatka').slice(0, 23), armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    const before = withMissions(s, { a: hold24, b: hold24, c: hold24 });
    const lines = game.announce!(before, take(before));
    expect(lines).toContain('{a} wins: hold 24 territories');
    const asia = world.territories.filter((t) => t.continent === 'asia').map((t) => t.id);
    const s2 = staged({
      a: ['alaska', ...asia.filter((t) => t !== 'kamchatka')],
      armies: { alaska: 4 },
    });
    expect(game.announce!(s2, take(s2))).toContain('{a} holds Asia');
    const s3 = staged({ a: ['alaska'], c: ['kamchatka'], armies: { alaska: 4 } }, 'attack', [
      'a',
      'b',
      'c',
    ]);
    expect(game.announce!(s3, take(s3))).toContain('{c} is knocked out by {a}');
  });
});

describe('the turn timer', () => {
  const timed = (o: Partial<RiskOptions> = {}) =>
    game.setup({
      playerIds: ids3,
      options: opts({ turnTimer: '1 minute', ...o }),
      rng: createRng(1),
      now: 1000,
    });
  const fire = (s: RiskState) => game.onTimer!(s, 'turn', createRng(9), s.actBy!);

  it('is off unless chosen', () => {
    expect(game.nextTimer!(start())).toBeNull();
    const s = timed();
    expect(game.nextTimer!(s)).toEqual({ id: 'turn', at: 61_000 });
  });

  it('restarts when the turn passes', () => {
    const s = staged({ a: ['alaska'] }, 'fortify');
    const t = { ...s, turnSecs: 60, actBy: 5 };
    const s1 = act(t, 'a', { type: 'endTurn' }, createRng(1), 10_000);
    expect(s1.actBy).toBe(70_000);
  });

  it('finishes a turn from every phase', () => {
    const s = timed();
    const p = s.turn;
    // Reinforce, with a forced trade first (three cavalry, the first set: 4).
    const hand = ['p', 'q', 'r', 's', 't'].map((id) => card(id, 'cavalry'));
    const r = fire({ ...s, hands: { ...s.hands, [p]: hand } });
    expect(r.turn).not.toBe(p);
    expect(r.hands[p]).toHaveLength(2);
    expect(armiesOf(r, p)).toBe(armiesOf(s, p) + s.toPlace + 4);
    // Attack and fortify.
    for (const phase of ['attack', 'fortify'] as const)
      expect(fire({ ...s, phase, toPlace: 0 }).turn).not.toBe(p);
    // Occupy: the minimum moves in.
    const big = staged({ a: ['alaska'], armies: { alaska: 4, kamchatka: 1 } });
    const o = act(
      { ...big, turnSecs: 60, actBy: 1 },
      'a',
      {
        type: 'attack',
        from: 'alaska',
        to: 'kamchatka',
        mode: 'roll',
      },
      dice(6, 6, 6, 1),
    );
    const o1 = fire(o);
    expect([o1.armies.alaska, o1.armies.kamchatka, o1.turn]).toEqual([1, 3, 'b']);
    // Unknown timers do nothing.
    expect(game.onTimer!(s, 'other', createRng(1), 99_999)).toBe(s);
  });

  it('spreads everyone’s unplaced armies when the draft runs out', () => {
    const s = timed({ setup: 'Draft' });
    const s1 = fire(s);
    expect(s1.phase).toBe('reinforce');
    for (const p of ids3) expect(armiesOf(s1, p)).toBe(35);
  });

  it('says who the game is waiting on', () => {
    const d = start(ids3, { setup: 'Draft' });
    expect(game.waitingOn!(d)).toEqual(ids3);
    const placed = act(d, 'b', {
      type: 'draft',
      placements: { [territoriesOf(d.owner, 'b')[0]!]: d.drafts!.b!.left },
    });
    expect(game.waitingOn!(placed)).toEqual(['a', 'c']);
    const s = start();
    expect(game.waitingOn!(s)).toEqual([s.turn]);
  });
});

describe('random whole games', () => {
  /** The same state with every hidden thing swapped for something else. */
  function scrambled(s: RiskState, keep?: string): RiskState {
    const fake = (p: string): Card[] =>
      p === keep ? s.hands[p]! : [card(`fake-${p}`, 'wild', null)];
    return {
      ...s,
      hands: Object.fromEntries(s.seats.map((p) => [p, fake(p)])),
      deck: [],
      discard: [card('fake-discard', 'cavalry')],
      missions:
        s.missions &&
        Object.fromEntries(
          s.seats.map((p) => [p, p === keep ? s.missions![p]! : { kind: 'territories', n: 24 }]),
        ),
      drafts:
        s.drafts &&
        Object.fromEntries(
          s.seats.map((p) => {
            const d = s.drafts![p]!;
            return [p, p === keep || !d.placed ? d : { ...d, placed: { nowhere: d.left } }];
          }),
        ),
    } as RiskState;
  }

  const configs: [string[], Partial<RiskOptions>][] = [];
  for (const n of [2, 3, 4, 5, 6])
    for (const map of ['World', 'Realm', 'Skerries', 'Twin Crowns'] as const)
      for (const goal of ['Secret missions', 'World domination'] as const)
        configs.push([
          ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n),
          { map, goal, setup: n % 2 ? 'Draft' : 'Quick', cardSets: n > 3 ? 'Fixed' : 'Rising' },
        ]);

  let finished = 0;
  it.each(configs.map((c, i) => [i, ...c] as const))(
    'game %i (%j, %j) stays sound and never leaks',
    (i, players, o) => {
      const rng = createRng(100 + i);
      let s = start(players, o, 100 + i);
      for (let step = 0; step < 2500 && !game.getResult(s); step++) {
        const movers = game.waitingOn!(s);
        const pid = movers[rng.int(movers.length)]!;
        const moves = legalMoves(s, pid);
        expect(moves.length, `${s.phase} for ${pid}`).toBeGreaterThan(0);
        // Mostly attack while attacking, so games move along.
        const attacks = moves.filter((m) => m.type === 'attack');
        const move = attacks.length && rng.next() < 0.8 ? rng.pick(attacks) : rng.pick(moves);
        s = game.applyAction(s, pid, move, rng, step * 1000);
        // The board stays sound.
        expect(Object.keys(s.owner)).toHaveLength(42);
        for (const t of Object.keys(s.owner)) expect(s.armies[t]).toBeGreaterThanOrEqual(1);
        // The table view never depends on anything hidden…
        if (s.phase !== 'over') {
          const t = scrambled(s);
          const tv = game.getTableView(s);
          // Card counts are public; the scrambled hands differ in size, so set those aside.
          expect({ ...game.getTableView(t), handCounts: tv.handCounts }).toEqual(tv);
          // …and nobody's view depends on anyone else's secrets.
          for (const p of s.seats) {
            expect(game.getPlayerView(scrambled(s, p), p)).toEqual(game.getPlayerView(s, p));
          }
        }
      }
      if (game.getResult(s)) finished++;
    },
    30_000,
  );

  it('mostly finish', () => {
    // Missions games end quickly; random world domination can wander for a long time.
    expect(finished).toBeGreaterThan(configs.length / 2);
  });
});

describe('fog of war', () => {
  const ALL = [...MAPS.world.territories, ...MAPS.realm.territories].map((t) => t.id);

  /** Every territory `pid` can't see gets other armies, and (between others) other owners. */
  function scrambledFog(s: RiskState, pid: string, rng: Rng): RiskState {
    const seenBy = visibleTo(MAPS[s.map], s.owner, pid);
    const others = [...s.seats.filter((p) => p !== pid), ...(s.neutral ? [NEUTRAL] : [])];
    const owner = { ...s.owner };
    const armies = { ...s.armies };
    for (const t of Object.keys(owner)) {
      if (seenBy.has(t)) continue;
      armies[t] = 1 + rng.int(30);
      if (owner[t] !== pid) owner[t] = rng.pick(others);
    }
    return { ...s, owner, armies };
  }

  /** The public view, with the counts that scrambling owners may change set aside. */
  const publicPart = (s: RiskState) => ({ ...game.getTableView(s), held: null, handCounts: null });

  it('is off by default and on when asked', () => {
    expect(start().fog).toBe(false);
    expect(game.getTableView(start()).fog).toBe(false);
    expect(game.getPlayerView(start(), 'a').sight).toBeNull();
    expect(start(ids3, { fog: true }).fog).toBe(true);
  });

  it('shows each player only their own territories and their neighbours', () => {
    const s = start(ids3, { fog: true });
    const tv = game.getTableView(s);
    expect(tv.owner).toEqual({});
    expect(tv.armies).toEqual({});
    expect(tv.toPlace).toBe(0);
    expect(tv.held).toEqual({ a: 14, b: 14, c: 14 });
    for (const p of ids3) {
      const sight = game.getPlayerView(s, p).sight!;
      const mine = territoriesOf(s.owner, p);
      const next = mine.flatMap((t) => world.territories.find((x) => x.id === t)!.adj);
      expect(Object.keys(sight.owner).sort()).toEqual([...new Set([...mine, ...next])].sort());
      for (const t of Object.keys(sight.owner)) {
        expect(sight.owner[t]).toBe(s.owner[t]);
        expect(sight.armies[t]).toBe(s.armies[t]);
      }
      // Only the player to move learns how many armies they have to place.
      expect(sight.toPlace).toBe(p === s.turn ? s.toPlace : 0);
    }
  });

  it('lifts once the game is over', () => {
    const s = { ...start(ids3, { fog: true }), phase: 'over' as const, winner: 'a' };
    expect(game.getTableView(s).owner).toEqual(s.owner);
    expect(game.getPlayerView(s, 'a').sight).toBeNull();
  });

  it('keeps continents out of chat', () => {
    // a takes the last of Australia.
    const aus = ['indonesia', 'new-guinea', 'western-australia', 'eastern-australia'];
    const s = { ...staged({ a: [...aus.slice(1), 'siam'], armies: { siam: 10 } }), fog: true };
    const next = act(s, 'a', { type: 'attack', from: 'siam', to: 'indonesia', mode: 'blitz' });
    expect(next.owner.indonesia).toBe('a');
    expect(game.announce!(s, next).join(' ')).not.toContain('Australia');
    const clear = game.announce!({ ...s, fog: false }, { ...next, fog: false });
    expect(clear.join(' ')).toContain('Australia');
  });

  it('shows a battle only to the two sides', () => {
    const s = {
      ...staged({ a: ['siam'], c: ['china'], armies: { siam: 10 } }, 'attack', ['a', 'b', 'c']),
      fog: true,
    };
    const next = act(s, 'a', { type: 'attack', from: 'siam', to: 'indonesia', mode: 'roll' });
    expect(game.getTableView(next).battle).toBeNull();
    expect(game.getPlayerView(next, 'a').sight!.battle).toEqual(next.battle);
    expect(game.getPlayerView(next, 'b').sight!.battle).toEqual(next.battle);
    // c (in China) sees Siam but not Indonesia.
    expect(game.getPlayerView(next, 'c').sight!.battle).toBeNull();
  });

  it.each([
    [['a', 'b'], 'World', 'Quick', 11],
    [['a', 'b', 'c'], 'Realm', 'Draft', 12],
    [['a', 'b', 'c', 'd', 'e', 'f'], 'World', 'Draft', 13],
    [['a', 'b', 'c', 'd'], 'Realm', 'Quick', 14],
  ] as const)(
    '%j on %s (%s) never leaks through the fog',
    (players, map, setup, seed) => {
      const rng = createRng(seed);
      const peek = createRng(seed + 1);
      let s = start([...players], { map, setup, fog: true }, seed);
      for (let step = 0; step < 1500 && !game.getResult(s); step++) {
        const movers = game.waitingOn!(s);
        const pid = movers[rng.int(movers.length)]!;
        const moves = legalMoves(s, pid);
        const attacks = moves.filter((m) => m.type === 'attack');
        const move = attacks.length && rng.next() < 0.8 ? rng.pick(attacks) : rng.pick(moves);
        s = game.applyAction(s, pid, move, rng, step * 1000);
        if (s.phase === 'over') break;
        const tv = game.getTableView(s);
        // No owners, armies, battles, move-ins or territory names in public at all.
        expect(tv.owner).toEqual({});
        expect(tv.armies).toEqual({});
        expect(tv.battle).toBeNull();
        expect(tv.occupy).toBeNull();
        const json = JSON.stringify(tv);
        for (const t of ALL) expect(json).not.toContain(`"${t}"`);
        for (const t of MAPS[s.map].territories) expect(json).not.toContain(t.name);
        if (step % 5) continue;
        for (const p of s.seats) {
          const sight = game.getPlayerView(s, p).sight;
          expect(sight).not.toBeNull();
          const seenBy = visibleTo(MAPS[s.map], s.owner, p);
          expect(Object.keys(sight!.owner).every((t) => seenBy.has(t))).toBe(true);
          // Changing anything out of sight changes nothing this player (or the table) gets.
          const fogged = scrambledFog(s, p, peek);
          expect(game.getPlayerView(fogged, p)).toEqual(game.getPlayerView(s, p));
          expect(publicPart(fogged)).toEqual(publicPart(s));
        }
      }
    },
    30_000,
  );
});

describe('ending early', () => {
  it('saves nothing before the first battle', () => {
    expect(game.partialResult!(start())).toBeNull();
    expect(game.partialResult!(start(ids3, { setup: 'Draft' }))).toBeNull();
  });

  it('gives the win to whoever holds the most territories', () => {
    const s = {
      ...staged({ a: tids.slice(0, 20), c: tids.slice(20, 30) }, 'attack', ids3),
      battleSeq: 4,
      round: 3,
    };
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual(['a']);
    expect(r.summary).toBe('Held the most territories (20) after 3 rounds');
    expect(r.standings!.map((x) => [x.playerId, x.outcome])).toEqual([
      ['a', 'win'],
      ['b', 'loss'],
      ['c', 'loss'],
    ]);
    expect((r.reveal as { owner: unknown }).owner).toEqual(s.owner);
  });

  it('breaks a tie on armies, and shares a dead heat', () => {
    const a = tids.slice(0, 14);
    const c = tids.slice(14, 28);
    const base = { ...staged({ a, c }, 'attack', ids3), battleSeq: 1 };
    const more = { ...base, armies: { ...base.armies, [c[0]!]: 5 } };
    expect(game.partialResult!(more)!.winners).toEqual(['c']);
    expect(game.partialResult!(base)!.winners.sort()).toEqual(['a', 'b', 'c']);
  });
});
