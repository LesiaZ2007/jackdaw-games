import { GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { roadSpots, type Buildings } from './build';
import { layout } from './geometry';
import type { CatanState } from './rules';
import { act, hand, main, playSetup, seedFor, start } from './testkit';
import { validTrade } from './trade';

const refused = (f: () => unknown) => expect(f).toThrow(GameError);

/** Main phase; the player on their turn is `me`, the others `x` and `y`. */
function table(hands: { me?: object; x?: object; y?: object } = {}) {
  const s0 = main();
  const me = s0.turn;
  const [x, y] = s0.seats.filter((p) => p !== me) as [string, string];
  const s: CatanState = {
    ...s0,
    hands: { [me]: hand(hands.me ?? {}), [x]: hand(hands.x ?? {}), [y]: hand(hands.y ?? {}) },
  };
  return { s, me, x, y };
}

describe('validTrade', () => {
  it('needs something on both sides and no resource on both', () => {
    expect(validTrade({ wool: 1 }, { ore: 1 })).toBe(null);
    expect(validTrade({}, { ore: 1 })).not.toBe(null);
    expect(validTrade({ wool: 1 }, {})).not.toBe(null);
    expect(validTrade({ wool: 2 }, { wool: 1 })).not.toBe(null);
    expect(validTrade({ wool: 1, ore: 0 }, { ore: 1 })).toBe(null);
  });
});

describe('trading', () => {
  it('only the player on their turn offers and accepts', () => {
    const { s, me, x } = table({ me: { wool: 2 }, x: { ore: 1 } });
    refused(() => act(s, x, { type: 'offer', give: { ore: 1 }, want: { wool: 1 }, to: null }));
    const o = act(s, me, { type: 'offer', give: { wool: 2 }, want: { ore: 1 }, to: null });
    expect(o.offers).toHaveLength(1);
    expect(o.offers[0]).toMatchObject({ from: me, to: null, give: { wool: 2 }, want: { ore: 1 } });
    const id = o.offers[0]!.id;
    const yes = act(o, x, { type: 'answer', offer: id, reply: 'accept' });
    refused(() => act(yes, x, { type: 'accept', offer: id, with: x }));
    const done = act(yes, me, { type: 'accept', offer: id, with: x });
    expect(done.hands[me]).toEqual(hand({ ore: 1 }));
    expect(done.hands[x]).toEqual(hand({ wool: 2 }));
    expect(done.offers).toEqual([]);
  });

  it('you can only offer cards you have, and only to someone else at the table', () => {
    const { s, me } = table({ me: { wool: 1 } });
    refused(() => act(s, me, { type: 'offer', give: { wool: 2 }, want: { ore: 1 }, to: null }));
    refused(() => act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: me }));
    refused(() => act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: 'zed' }));
  });

  it('an offer to one player can only be answered by them', () => {
    const { s, me, x, y } = table({ me: { wool: 1 }, x: { ore: 1 }, y: { ore: 1 } });
    const o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: x });
    refused(() => act(o, y, { type: 'answer', offer: o.offers[0]!.id, reply: 'accept' }));
    expect(
      act(o, x, { type: 'answer', offer: o.offers[0]!.id, reply: 'decline' }).offers[0]!.replies,
    ).toEqual({ [x]: 'decline' });
  });

  it('you can only say yes with the cards wanted', () => {
    const { s, me, x } = table({ me: { wool: 1 } });
    const o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null });
    refused(() => act(o, x, { type: 'answer', offer: o.offers[0]!.id, reply: 'accept' }));
  });

  it('accepting needs a partner who said yes', () => {
    const { s, me, x, y } = table({ me: { wool: 1 }, x: { ore: 1 }, y: { ore: 1 } });
    let o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null });
    const id = o.offers[0]!.id;
    refused(() => act(o, me, { type: 'accept', offer: id, with: x }));
    o = act(o, y, { type: 'answer', offer: id, reply: 'decline' });
    refused(() => act(o, me, { type: 'accept', offer: id, with: y }));
  });

  it('others counter or propose; those go to the player on their turn', () => {
    const { s, me, x, y } = table({ me: { wool: 3 }, x: { ore: 1, grain: 1 }, y: { brick: 1 } });
    const o = act(s, me, { type: 'offer', give: { wool: 2 }, want: { ore: 1 }, to: null });
    const c = act(o, x, {
      type: 'counter',
      offer: o.offers[0]!.id,
      give: { ore: 1 },
      want: { wool: 3 },
    });
    const counter = c.offers.at(-1)!;
    expect(counter).toMatchObject({
      from: x,
      to: me,
      give: { ore: 1 },
      want: { wool: 3 },
      counter: o.offers[0]!.id,
    });
    const p = act(c, y, { type: 'propose', give: { brick: 1 }, want: { wool: 1 } });
    expect(p.offers.at(-1)).toMatchObject({ from: y, to: me, counter: null });
    refused(() => act(p, me, { type: 'propose', give: { wool: 1 }, want: { brick: 1 } }));
    refused(() => act(p, me, { type: 'accept', offer: counter.id, with: y }));
    const done = act(p, me, { type: 'accept', offer: counter.id, with: x });
    expect(done.hands[me]).toEqual(hand({ ore: 1 }));
    expect(done.hands[x]).toEqual(hand({ grain: 1, wool: 3 }));
  });

  it('re-checks both hands when a trade completes', () => {
    const { s, me, x } = table({ me: { wool: 2, brick: 1, lumber: 1 }, x: { ore: 1 } });
    let o = act(s, me, { type: 'offer', give: { wool: 1, brick: 1 }, want: { ore: 1 }, to: null });
    const id = o.offers[0]!.id;
    o = act(o, x, { type: 'answer', offer: id, reply: 'accept' });
    // The maker builds a road with the brick before accepting.
    const L = layout(o.size);
    const spot = roadSpots(L, o.buildings, o.roads, me)[0]!;
    const spent = act(o, me, { type: 'build', kind: 'road', at: spot });
    refused(() => act(spent, me, { type: 'accept', offer: id, with: x }));
    // The partner spends their ore some other way.
    const gone = { ...o, hands: { ...o.hands, [x]: hand() } };
    refused(() => act(gone, me, { type: 'accept', offer: id, with: x }));
  });

  it('no player trades in the paired phase, but the bank is open', () => {
    const s0 = playSetup(start(['a', 'b', 'c', 'd', 'e']));
    const rolled = act(s0, s0.turn, { type: 'roll' }, seedFor(6));
    const s1 = act(rolled, rolled.turn, { type: 'endTurn' });
    const p2 = s1.paired!;
    const s = {
      ...s1,
      hands: { ...s1.hands, [p2]: hand({ wool: 4 }), [s1.turn]: hand({ ore: 2 }) },
    };
    refused(() => act(s, p2, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null }));
    refused(() => act(s, s.turn, { type: 'propose', give: { ore: 1 }, want: { wool: 1 } }));
    expect(act(s, p2, { type: 'bank', give: 'wool', get: 'ore', n: 1 }).hands[p2]).toMatchObject({
      wool: 0,
      ore: 1,
    });
  });

  it('offers clear at the end of the turn', () => {
    const { s, me } = table({ me: { wool: 1 } });
    const o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null });
    expect(act(o, me, { type: 'endTurn' }).offers).toEqual([]);
  });

  it('a maker can withdraw; at most 6 open offers each', () => {
    const { s, me, x } = table({ me: { wool: 1 } });
    let o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null });
    refused(() => act(o, x, { type: 'withdraw', offer: o.offers[0]!.id }));
    expect(act(o, me, { type: 'withdraw', offer: o.offers[0]!.id }).offers).toEqual([]);
    for (let i = 0; i < 5; i++)
      o = act(o, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 + i }, to: null });
    refused(() => act(o, me, { type: 'offer', give: { wool: 1 }, want: { grain: 1 }, to: null }));
  });

  it('accepting a completed or withdrawn offer is refused', () => {
    const { s, me, x } = table({ me: { wool: 2 }, x: { ore: 2 } });
    let o = act(s, me, { type: 'offer', give: { wool: 1 }, want: { ore: 1 }, to: null });
    const id = o.offers[0]!.id;
    o = act(o, x, { type: 'answer', offer: id, reply: 'accept' });
    const done = act(o, me, { type: 'accept', offer: id, with: x });
    refused(() => act(done, me, { type: 'accept', offer: id, with: x }));
    refused(() => act(done, x, { type: 'answer', offer: id, reply: 'accept' }));
  });

  it('trades between two players off turn are refused', () => {
    const { s, x, y } = table({ x: { ore: 1 }, y: { wool: 1 } });
    refused(() => act(s, x, { type: 'offer', give: { ore: 1 }, want: { wool: 1 }, to: y }));
  });
});

describe('bank trades', () => {
  const at = (s: CatanState, me: string, kinds: ('any' | 'wool')[]): CatanState => {
    const L = layout(s.size);
    const buildings: Buildings = { ...s.buildings };
    for (const h of s.board.harbours)
      if (kinds.includes(h.kind as 'any' | 'wool'))
        buildings[L.edges[h.edge]!.a] = { owner: me, city: false };
    return { ...s, buildings };
  };

  it('4 for 1 anywhere, only on your turn', () => {
    const { s, me, x } = table({ me: { ore: 8 }, x: { ore: 4 } });
    expect(act(s, me, { type: 'bank', give: 'ore', get: 'wool', n: 2 }).hands[me]).toMatchObject({
      ore: 0,
      wool: 2,
    });
    refused(() => act(s, me, { type: 'bank', give: 'ore', get: 'ore', n: 1 }));
    refused(() =>
      act({ ...s, hands: { ...s.hands, [me]: hand({ ore: 3 }) } }, me, {
        type: 'bank',
        give: 'ore',
        get: 'wool',
        n: 1,
      }),
    );
    refused(() => act(s, x, { type: 'bank', give: 'ore', get: 'wool', n: 1 }));
    refused(() =>
      act({ ...s, bank: { ...s.bank, wool: 0 } }, me, {
        type: 'bank',
        give: 'ore',
        get: 'wool',
        n: 1,
      }),
    );
  });

  it('3 at a generic harbour, 2 at its own harbour', () => {
    const { s, me } = table({ me: { ore: 3, wool: 2 } });
    const generic = at(s, me, ['any']);
    expect(
      act(generic, me, { type: 'bank', give: 'ore', get: 'grain', n: 1 }).hands[me],
    ).toMatchObject({ ore: 0, grain: 1 });
    const wool = at(s, me, ['wool']);
    expect(
      act(wool, me, { type: 'bank', give: 'wool', get: 'grain', n: 1 }).hands[me],
    ).toMatchObject({ wool: 0, grain: 1 });
    refused(() => act(wool, me, { type: 'bank', give: 'ore', get: 'grain', n: 1 }));
  });
});
