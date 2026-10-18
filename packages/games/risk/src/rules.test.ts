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
