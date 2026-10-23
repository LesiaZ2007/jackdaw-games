import { GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { COSTS, piecesLeft, roadSpots, settlementSpots } from './build';
import { layout } from './geometry';
import { catan, robberTiles, type CatanState } from './rules';
import { act, hand, main, playSetup, ready, seedFor, start, withDev } from './testkit';
import type { DevCard } from './types';

const refused = (f: () => unknown) => expect(f).toThrow(GameError);

describe('building', () => {
  it('pays its cost and needs a piece', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    const s = { ...s0, hands: { ...s0.hands, [me]: hand(COSTS.road) } };
    const at = roadSpots(L, s.buildings, s.roads, me)[0]!;
    const after = act(s, me, { type: 'build', kind: 'road', at });
    expect(after.roads[at]).toBe(me);
    expect(after.hands[me]).toEqual(hand());
    refused(() =>
      act(after, me, {
        type: 'build',
        kind: 'road',
        at: roadSpots(L, after.buildings, after.roads, me)[0]!,
      }),
    );
    // No roads left in the supply.
    const full = Object.fromEntries(L.edgeIds.slice(0, 15).map((e) => [e, me]));
    refused(() =>
      act({ ...s, roads: { ...s.roads, ...full } }, me, { type: 'build', kind: 'road', at }),
    );
  });

  it('a settlement must touch your road and keep its distance', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    const s = {
      ...s0,
      hands: { ...s0.hands, [me]: hand({ ...COSTS.settlement, ...{ brick: 2, lumber: 2 } }) },
    };
    expect(settlementSpots(L, s.buildings, s.roads, me, false)).toEqual([]);
    const far = L.cornerIds.find(
      (c) => !settlementSpots(L, s.buildings, s.roads, me, false).includes(c),
    )!;
    refused(() => act(s, me, { type: 'build', kind: 'settlement', at: far }));
  });

  it('a city returns the settlement to the supply', () => {
    const s0 = main();
    const me = s0.turn;
    const corner = Object.keys(s0.buildings).find((c) => s0.buildings[c]!.owner === me)!;
    const s = { ...s0, hands: { ...s0.hands, [me]: hand(COSTS.city) } };
    const after = act(s, me, { type: 'build', kind: 'city', at: corner });
    expect(after.buildings[corner]).toEqual({ owner: me, city: true });
    expect(piecesLeft(after.buildings, after.roads, me)).toMatchObject({ settlement: 4, city: 3 });
    const other = Object.keys(s0.buildings).find((c) => s0.buildings[c]!.owner !== me)!;
    refused(() => act({ ...s }, me, { type: 'build', kind: 'city', at: other }));
  });

  it('buying draws the top card; none when the deck is empty', () => {
    const s0 = main();
    const me = s0.turn;
    const s = {
      ...s0,
      hands: { ...s0.hands, [me]: hand({ ore: 2, wool: 2, grain: 2 }) },
      deck: ['monopoly', 'knight'] as DevCard[],
    };
    const after = act(s, me, { type: 'buy' });
    expect(after.dev[me]).toEqual([{ card: 'monopoly', bought: s.turnSeq }]);
    expect(after.deck).toEqual(['knight']);
    refused(() => act({ ...after, deck: [] }, me, { type: 'buy' }));
  });
});

describe('development cards', () => {
  it('one per turn, never one bought this turn', () => {
    const s0 = main();
    const me = s0.turn;
    const bought = withDev(s0, me, ['knight'], s0.turnSeq);
    refused(() => act(bought, me, { type: 'play', card: 'knight' }));
    expect(catan.getPlayerView(bought, me).dev).toEqual([{ card: 'knight', playable: false }]);
    let s = withDev(s0, me, ['monopoly', 'yearOfPlenty']);
    expect(catan.getPlayerView(s, me).dev.every((d) => d.playable)).toBe(true);
    s = act(s, me, { type: 'play', card: 'monopoly', resource: 'wool' });
    refused(() => act(s, me, { type: 'play', card: 'yearOfPlenty', take: ['ore', 'ore'] }));
  });

  it('a knight before the roll goes back to the roll', () => {
    const s0 = ready();
    const me = s0.turn;
    let s = withDev(s0, me, ['knight']);
    s = act(s, me, { type: 'play', card: 'knight' });
    expect(s.phase).toBe('robber');
    expect(s.knights[me]).toBe(1);
    const tile = robberTiles(s, me).find(
      (t) =>
        !layout(s.size).tiles[t]!.corners.some(
          (c) => s.buildings[c] && s.buildings[c].owner !== me,
        ),
    )!;
    s = act(s, me, { type: 'robber', tile, victim: null });
    expect(s.phase).toBe('roll');
    refused(() =>
      act(withDev(s, me, ['monopoly']), me, { type: 'play', card: 'monopoly', resource: 'ore' }),
    );
  });

  it('only knights before the roll', () => {
    const s0 = ready();
    refused(() =>
      act(withDev(s0, s0.turn, ['monopoly']), s0.turn, {
        type: 'play',
        card: 'monopoly',
        resource: 'ore',
      }),
    );
  });

  it('year of plenty takes two (what the bank has)', () => {
    const s0 = main();
    const me = s0.turn;
    const s = withDev(s0, me, ['yearOfPlenty', 'yearOfPlenty']);
    expect(
      act(s, me, { type: 'play', card: 'yearOfPlenty', take: ['ore', 'grain'] }).hands[me],
    ).toEqual(hand({ ore: 1, grain: 1 }));
    const short = act({ ...s, bank: { ...s.bank, ore: 1 } }, me, {
      type: 'play',
      card: 'yearOfPlenty',
      take: ['ore', 'ore'],
    });
    expect(short.hands[me]!.ore).toBe(1);
    expect(short.bank.ore).toBe(0);
    refused(() => act(s, me, { type: 'play', card: 'yearOfPlenty' }));
  });

  it('monopoly takes every other player’s cards of that resource', () => {
    const s0 = main({ a: { wool: 2 }, b: { wool: 3, ore: 1 }, c: { wool: 1 } });
    const me = s0.turn;
    const s = act(withDev(s0, me, ['monopoly']), me, {
      type: 'play',
      card: 'monopoly',
      resource: 'wool',
    });
    expect(s.hands[me]!.wool).toBe(6);
    for (const p of s.seats.filter((p) => p !== me)) expect(s.hands[p]!.wool).toBe(0);
    expect(s.monopoly).toMatchObject({ pid: me, resource: 'wool', took: 6 - s0.hands[me]!.wool });
  });

  it('road building places two free roads', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    let s = act(withDev(s0, me, ['roadBuilding']), me, { type: 'play', card: 'roadBuilding' });
    expect(s.phase).toBe('roadBuilding');
    refused(() => act(s, me, { type: 'endTurn' }));
    s = act(s, me, { type: 'build', kind: 'road', at: roadSpots(L, s.buildings, s.roads, me)[0]! });
    s = act(s, me, { type: 'build', kind: 'road', at: roadSpots(L, s.buildings, s.roads, me)[0]! });
    expect(s.phase).toBe('main');
    expect(s.hands[me]).toEqual(hand());
    expect(piecesLeft(s.buildings, s.roads, me).road).toBe(11);
  });

  it('road building with nowhere to build ends', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    const mine = Object.keys(s0.roads).filter((e) => s0.roads[e] === me);
    const extra = L.edgeIds.filter((e) => !s0.roads[e]).slice(0, 15 - mine.length);
    const full = { ...s0.roads, ...Object.fromEntries(extra.map((e) => [e, me])) };
    const s = act(withDev({ ...s0, roads: full }, me, ['roadBuilding']), me, {
      type: 'play',
      card: 'roadBuilding',
    });
    expect(s.phase).toBe('main');
    let one = act(withDev(s0, me, ['roadBuilding']), me, { type: 'play', card: 'roadBuilding' });
    one = act(one, me, {
      type: 'build',
      kind: 'road',
      at: roadSpots(L, one.buildings, one.roads, me)[0]!,
    });
    expect(act(one, me, { type: 'endRoads' }).phase).toBe('main');
  });
});

describe('awards and winning', () => {
  it('largest army at 3 knights, taken only with more', () => {
    const s0 = main();
    const me = s0.turn;
    const other = s0.seats.find((p) => p !== me)!;
    const s = withDev({ ...s0, knights: { ...s0.knights, [me]: 2 } }, me, ['knight']);
    const after = act(s, me, { type: 'play', card: 'knight' });
    expect(after.army).toBe(me);
    expect(after.award).toMatchObject({ kind: 'army', from: null, to: me });
    const tied = act({ ...s, army: other, knights: { ...s.knights, [other]: 3 } }, me, {
      type: 'play',
      card: 'knight',
    });
    expect(tied.army).toBe(other);
    const more = act({ ...s, army: other, knights: { ...s.knights, [me]: 3, [other]: 3 } }, me, {
      type: 'play',
      card: 'knight',
    });
    expect(more.army).toBe(me);
  });

  it('longest road moves when a settlement breaks it', () => {
    const s0 = main();
    const me = s0.turn;
    const holder = s0.seats.find((p) => p !== me)!;
    const L = layout(s0.size);
    const centre = L.tiles[9]!;
    const c2 = centre.corners[2]!;
    const spur = L.corners[c2]!.edges.find((e) => !centre.edges.includes(e))!;
    const s: CatanState = {
      ...s0,
      buildings: {},
      roads: {
        ...Object.fromEntries(centre.edges.slice(0, 5).map((e) => [e, holder])),
        [spur]: me,
      },
      longest: { holder, lengths: { ...s0.longest.lengths, [holder]: 5 } },
      hands: { ...s0.hands, [me]: hand(COSTS.settlement) },
    };
    const after = act(s, me, { type: 'build', kind: 'settlement', at: c2 });
    expect(after.longest.lengths[holder]).toBe(3);
    expect(after.longest.holder).toBe(null);
    expect(after.award).toMatchObject({ kind: 'road', from: holder, to: null });
  });

  it('you win at the target on your own turn, victory point cards included', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    const s = withDev(
      { ...s0, hands: { ...s0.hands, [me]: hand(COSTS.city) } },
      me,
      Array<DevCard>(7).fill('victoryPoint'),
    );
    const corner = Object.keys(s.buildings).find((c) => s.buildings[c]!.owner === me)!;
    const after = act(s, me, { type: 'build', kind: 'city', at: corner });
    expect(after.phase).toBe('over');
    expect(after.winner).toBe(me);
    expect(catan.getResult(after)!.winners).toEqual([me]);
    void L;
  });

  it('points reached on another’s turn win when your own turn starts', () => {
    const s0 = main();
    const me = s0.turn;
    const next = s0.seats[(s0.seats.indexOf(me) + 1) % s0.seats.length]!;
    const s = withDev(s0, next, Array<DevCard>(8).fill('victoryPoint'));
    expect(s.phase).toBe('main');
    const after = act(s, me, { type: 'endTurn' });
    expect(after.winner).toBe(next);
  });

  it('ending the turn passes to the next seat, who rolls', () => {
    const s0 = main();
    const me = s0.turn;
    const after = act(s0, me, { type: 'endTurn' });
    expect(after.turn).toBe(s0.seats[(s0.seats.indexOf(me) + 1) % 3]);
    expect(after.phase).toBe('roll');
    expect(after.turnSeq).toBe(s0.turnSeq + 1);
    expect(after.devPlayed).toBe(false);
  });
});

describe('paired turns (5–6 players)', () => {
  const five = () => {
    const s0 = playSetup(start(['a', 'b', 'c', 'd', 'e']));
    const s = act(s0, s0.turn, { type: 'roll' }, seedFor(6));
    return act(s, s.turn, { type: 'endTurn' });
  };

  it('the paired player is three seats along and can build and play a card, but not roll', () => {
    const s = five();
    const i = s.seats.indexOf(s.turn);
    const p2 = s.seats[(i + 3) % 5]!;
    expect(s.paired).toBe(p2);
    expect(s.phase).toBe('main');
    expect(catan.waitingOn!(s)).toEqual([p2]);
    refused(() => act(s, p2, { type: 'roll' }));
    refused(() => act(s, s.turn, { type: 'buy' }));
    const L = layout(s.size);
    const rich = withDev({ ...s, hands: { ...s.hands, [p2]: hand(COSTS.road) } }, p2, ['monopoly']);
    const built = act(rich, p2, {
      type: 'build',
      kind: 'road',
      at: roadSpots(L, rich.buildings, rich.roads, p2)[0]!,
    });
    expect(Object.values(built.roads).filter((o) => o === p2)).toHaveLength(3);
    expect(act(rich, p2, { type: 'play', card: 'monopoly', resource: 'ore' }).monopoly?.pid).toBe(
      p2,
    );
  });

  it('the paired phase ends and the next seat rolls', () => {
    const s = five();
    const after = act(s, s.paired!, { type: 'endTurn' });
    expect(after.paired).toBe(null);
    expect(after.turn).toBe(s.seats[(s.seats.indexOf(s.turn) + 1) % 5]);
    expect(after.phase).toBe('roll');
  });

  it('player 1 wins before the paired player gets a phase', () => {
    const s0 = playSetup(start(['a', 'b', 'c', 'd', 'e']));
    const rolled = act(s0, s0.turn, { type: 'roll' }, seedFor(6));
    const me = rolled.turn;
    const corner = Object.keys(rolled.buildings).find((c) => rolled.buildings[c]!.owner === me)!;
    const s = withDev(
      { ...rolled, hands: { ...rolled.hands, [me]: hand(COSTS.city) } },
      me,
      Array<DevCard>(7).fill('victoryPoint'),
    );
    expect(act(s, me, { type: 'build', kind: 'city', at: corner }).winner).toBe(me);
  });
});

describe('friendly robber', () => {
  it('can’t stop next to a player on 2 points or fewer', () => {
    const s0 = main();
    const me = s0.turn;
    const L = layout(s0.size);
    const s = { ...s0, friendly: true };
    for (const t of robberTiles(s, me))
      for (const c of L.tiles[t]!.corners) expect(s.buildings[c]?.owner ?? me).toBe(me);
    expect(robberTiles(s0, me).length).toBeGreaterThan(robberTiles(s, me).length);
  });
});
