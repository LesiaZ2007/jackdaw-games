import { GameError, createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { roadSpots, settlementSpots } from './build';
import { layout } from './geometry';
import { catan, type CatanAction, type CatanOptions, type CatanState } from './rules';
import { RESOURCES, YIELD, countCards, emptyCards, type Cards } from './types';

const game = catan;

export function start(players: string[], o: Partial<CatanOptions> = {}, seed = 1): CatanState {
  return game.setup({
    playerIds: players,
    options: { ...game.defaultOptions(players.length), ...o },
    rng: createRng(seed),
    now: 0,
  });
}

export const act = (s: CatanState, pid: string, a: CatanAction, seed = 1, now = 0) =>
  game.applyAction(s, pid, a, createRng(seed), now);

/** A seed whose first two dice make `total`. */
export function seedFor(total: number): number {
  for (let seed = 1; ; seed++) {
    const r = createRng(seed);
    if (r.int(6) + 1 + r.int(6) + 1 === total) return seed;
  }
}

/** Plays the whole opening: each player takes spread-out legal corners and the first road. */
export function playSetup(s: CatanState): CatanState {
  const L = layout(s.size);
  let k = 0;
  while (s.phase === 'setup') {
    const pid = s.setup!.order[s.setup!.step]!;
    if (!s.setup!.corner) {
      const spots = settlementSpots(L, s.buildings, s.roads, pid, true);
      s = act(s, pid, { type: 'build', kind: 'settlement', at: spots[(k++ * 7) % spots.length]! });
    } else {
      s = act(s, pid, {
        type: 'build',
        kind: 'road',
        at: roadSpots(L, s.buildings, s.roads, pid, s.setup!.corner)[0]!,
      });
    }
  }
  return s;
}

export const hand = (c: Partial<Cards> = {}): Cards => ({ ...emptyCards(), ...c });

const refused = (f: () => unknown) => expect(f).toThrow(GameError);

describe('setup', () => {
  it('runs in snake order (a b c c b a) from the first player', () => {
    const s = start(['a', 'b', 'c']);
    const order = s.setup!.order;
    expect(order).toHaveLength(6);
    expect(order.slice(3)).toEqual([...order.slice(0, 3)].reverse());
    expect(new Set(order.slice(0, 3))).toEqual(new Set(['a', 'b', 'c']));
    expect(s.turn).toBe(order[0]);
    expect(game.waitingOn!(s)).toEqual([order[0]]);
  });

  it('second settlement pays one card per touching tile', () => {
    let s = start(['a', 'b', 'c'], {}, 4);
    const L = layout(s.size);
    // Play to the last player's second settlement.
    for (let i = 0; i < 6 * 2 - 2;) {
      const pid = s.setup!.order[s.setup!.step]!;
      s = s.setup!.corner
        ? act(s, pid, {
            type: 'build',
            kind: 'road',
            at: roadSpots(L, s.buildings, s.roads, pid, s.setup!.corner)[0]!,
          })
        : act(s, pid, {
            type: 'build',
            kind: 'settlement',
            at: settlementSpots(L, s.buildings, s.roads, pid, true)[i * 3]!,
          });
      i++;
    }
    const pid = s.setup!.order[s.setup!.step]!;
    const before = countCards(s.hands[pid]!);
    const corner = settlementSpots(L, s.buildings, s.roads, pid, true).find(
      (c) => L.corners[c]!.tiles.length === 3,
    )!;
    s = act(s, pid, { type: 'build', kind: 'settlement', at: corner });
    const owed = L.corners[corner]!.tiles.filter((t) => YIELD[s.board.tiles[t]!.terrain]).length;
    expect(countCards(s.hands[pid]!)).toBe(before + owed);
    expect(before).toBe(0);
  });

  it('setup road must touch the settlement just placed', () => {
    let s = start(['a', 'b', 'c']);
    const L = layout(s.size);
    const pid = s.setup!.order[0]!;
    const corner = L.tiles[9]!.corners[0]!;
    s = act(s, pid, { type: 'build', kind: 'settlement', at: corner });
    const far = L.edgeIds.find((e) => L.edges[e]!.a !== corner && L.edges[e]!.b !== corner)!;
    refused(() => act(s, pid, { type: 'build', kind: 'road', at: far }));
    refused(() => act(s, pid, { type: 'build', kind: 'settlement', at: L.tiles[0]!.corners[0]! }));
    s = act(s, pid, { type: 'build', kind: 'road', at: L.corners[corner]!.edges[0]! });
    expect(s.setup!.step).toBe(1);
  });

  it('after setup the first player rolls', () => {
    const s = playSetup(start(['a', 'b', 'c', 'd']));
    expect(s.phase).toBe('roll');
    expect(Object.keys(s.buildings)).toHaveLength(8);
    expect(Object.keys(s.roads)).toHaveLength(8);
    expect(game.waitingOn!(s)).toEqual([s.turn]);
  });
});

/** A board after setup with a known hand and no cards, ready to roll. */
function ready(players = ['a', 'b', 'c'], seed = 1) {
  const s = playSetup(start(players, {}, seed));
  const bank = { ...s.bank };
  for (const p of s.seats) for (const r of RESOURCES) bank[r] += s.hands[p]![r];
  return { ...s, hands: Object.fromEntries(s.seats.map((p) => [p, emptyCards()])), bank };
}

describe('rolling', () => {
  it('pays settlements 1 and cities 2, nothing from the robber’s tile', () => {
    const s0 = ready();
    const L = layout(s0.size);
    // The tile with an 8 that has a building beside it.
    const tile = s0.board.tiles.findIndex(
      (t, i) => t.number === 8 && L.tiles[i]!.corners.some((c) => s0.buildings[c]),
    );
    if (tile < 0) throw new Error('seed has no built 8');
    const res = YIELD[s0.board.tiles[tile]!.terrain]!;
    const corner = L.tiles[tile]!.corners.find((c) => s0.buildings[c])!;
    const owner = s0.buildings[corner]!.owner;
    const s = {
      ...s0,
      buildings: { ...s0.buildings, [corner]: { owner, city: true } },
      robber: s0.board.tiles.findIndex((t) => t.terrain === 'desert'),
    };
    const after = act(s, s.turn, { type: 'roll' }, seedFor(8));
    expect(after.dice![0] + after.dice![1]).toBe(8);
    expect(after.hands[owner]![res]).toBeGreaterThanOrEqual(2);
    expect(after.produced[owner]![res]).toBeGreaterThanOrEqual(2);
    expect(after.phase).toBe('main');
    const robbed = act({ ...s, robber: tile }, s.turn, { type: 'roll' }, seedFor(8));
    expect(robbed.hands[owner]![res]).toBe(
      after.hands[owner]![res] -
        L.tiles[tile]!.corners.filter((c) => s.buildings[c]?.owner === owner).reduce(
          (n, c) => n + (s.buildings[c]!.city ? 2 : 1),
          0,
        ),
    );
  });

  it('a short bank pays nobody that resource unless only one player is owed it', () => {
    const s0 = ready();
    const L = layout(s0.size);
    // Find a number whose tiles pay two different players the same resource.
    for (const n of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
      const owed: Record<string, Record<string, number>> = {};
      s0.board.tiles.forEach((t, i) => {
        if (t.number !== n || i === s0.robber) return;
        for (const c of L.tiles[i]!.corners) {
          const b = s0.buildings[c];
          if (!b) continue;
          const r = YIELD[t.terrain]!;
          owed[r] = { ...owed[r], [b.owner]: (owed[r]?.[b.owner] ?? 0) + 1 };
        }
      });
      const shared = Object.keys(owed).find((r) => Object.keys(owed[r]!).length > 1);
      const single = Object.keys(owed).find((r) => Object.keys(owed[r]!).length === 1);
      if (shared) {
        const total = Object.values(owed[shared]!).reduce((x, y) => x + y, 0);
        const s = { ...s0, bank: { ...s0.bank, [shared]: total - 1 } };
        const after = act(s, s.turn, { type: 'roll' }, seedFor(n));
        for (const p of Object.keys(owed[shared]!))
          expect(after.hands[p]![shared as 'ore']).toBe(0);
        expect(after.bank[shared as 'ore']).toBe(total - 1);
        return;
      }
      if (single) {
        const [p, k] = Object.entries(owed[single]!)[0]!;
        if (k < 2) continue;
        const s = { ...s0, bank: { ...s0.bank, [single]: 1 } };
        const after = act(s, s.turn, { type: 'roll' }, seedFor(n));
        expect(after.hands[p]![single as 'ore']).toBe(1);
        expect(after.bank[single as 'ore']).toBe(0);
        return;
      }
    }
    throw new Error('no suitable number on this seed');
  });
});

describe('the seven', () => {
  const sevenWith = (hands: Record<string, Cards>) => {
    const s0 = ready();
    return act({ ...s0, hands }, s0.turn, { type: 'roll' }, seedFor(7));
  };

  it('players with 8 or more discard half rounded down, others don’t', () => {
    const s = sevenWith({ a: hand({ ore: 9 }), b: hand({ wool: 8 }), c: hand({ grain: 7 }) });
    expect(s.phase).toBe('discard');
    expect(s.discards).toEqual({ a: 4, b: 4 });
    expect(game.waitingOn!(s).sort()).toEqual(['a', 'b']);
    expect(s.produced).toEqual({});
  });

  it('discards must be exact and owned; then the robber moves', () => {
    let s = sevenWith({ a: hand({ ore: 9 }), b: hand({ wool: 4, brick: 4 }), c: hand() });
    refused(() => act(s, 'a', { type: 'discard', cards: { ore: 3 } }));
    refused(() => act(s, 'a', { type: 'discard', cards: { wool: 4 } }));
    refused(() => act(s, 'c', { type: 'discard', cards: {} }));
    s = act(s, 'a', { type: 'discard', cards: { ore: 4 } });
    refused(() => act(s, 'a', { type: 'discard', cards: { ore: 4 } }));
    expect(s.hands.a!.ore).toBe(5);
    s = act(s, 'b', { type: 'discard', cards: { wool: 2, brick: 2 } });
    expect(s.phase).toBe('robber');
    expect(game.waitingOn!(s)).toEqual([s.turn]);
  });

  it('no discards goes straight to the robber', () => {
    const s = sevenWith({ a: hand({ ore: 2 }), b: hand(), c: hand() });
    expect(s.phase).toBe('robber');
  });

  it('the robber must move; the victim must have a building there; a card is taken at random', () => {
    const s = sevenWith({ a: hand({ ore: 2 }), b: hand({ wool: 3 }), c: hand({ grain: 1 }) });
    const L = layout(s.size);
    const thief = s.turn;
    refused(() => act(s, thief, { type: 'robber', tile: s.robber, victim: null }));
    const tile = s.board.tiles.findIndex(
      (_, i) =>
        i !== s.robber &&
        L.tiles[i]!.corners.some(
          (c) =>
            s.buildings[c] &&
            s.buildings[c].owner !== thief &&
            countCards(s.hands[s.buildings[c].owner]!) > 0,
        ),
    );
    const victim = L.tiles[tile]!.corners.map((c) => s.buildings[c]?.owner).find(
      (o) => o && o !== thief && countCards(s.hands[o]!) > 0,
    )!;
    const stranger = s.seats.find(
      (p) => p !== thief && !L.tiles[tile]!.corners.some((c) => s.buildings[c]?.owner === p),
    );
    if (stranger) refused(() => act(s, thief, { type: 'robber', tile, victim: stranger }));
    refused(() => act(s, thief, { type: 'robber', tile, victim: null }));
    refused(() => act(s, victim, { type: 'robber', tile, victim }));
    const after = act(s, thief, { type: 'robber', tile, victim });
    expect(after.robber).toBe(tile);
    expect(countCards(after.hands[victim]!)).toBe(countCards(s.hands[victim]!) - 1);
    expect(countCards(after.hands[thief]!)).toBe(countCards(s.hands[thief]!) + 1);
    expect(after.robbery).toMatchObject({ thief, victim });
    expect(after.robbery!.resource).not.toBeNull();
    expect(after.phase).toBe('main');
  });

  it('robbing someone with no cards takes nothing; an empty tile robs nobody', () => {
    const s = sevenWith({ a: hand(), b: hand(), c: hand() });
    const L = layout(s.size);
    const thief = s.turn;
    const tile = s.board.tiles.findIndex(
      (_, i) =>
        i !== s.robber &&
        L.tiles[i]!.corners.some((c) => s.buildings[c] && s.buildings[c].owner !== thief),
    );
    const victim = L.tiles[tile]!.corners.map((c) => s.buildings[c]?.owner).find(
      (o) => o && o !== thief,
    )!;
    const after = act(s, thief, { type: 'robber', tile, victim });
    expect(after.robbery).toMatchObject({ victim, resource: null });
    const empty = s.board.tiles.findIndex(
      (_, i) => i !== s.robber && !L.tiles[i]!.corners.some((c) => s.buildings[c]),
    );
    expect(act(s, thief, { type: 'robber', tile: empty, victim: null }).robbery).toMatchObject({
      victim: null,
    });
  });
});

describe('order', () => {
  it('rejects moves out of turn and out of phase', () => {
    const s = ready();
    const other = s.seats.find((p) => p !== s.turn)!;
    refused(() => act(s, other, { type: 'roll' }));
    refused(() => act(s, s.turn, { type: 'endTurn' }));
    refused(() => act(s, s.turn, { type: 'robber', tile: 0, victim: null }));
    refused(() => act(s, s.turn, { type: 'discard', cards: {} }));
    refused(() => act(s, 'zed', { type: 'roll' }));
  });

  it('rejects stale and repeated moves', () => {
    const s = act(ready(), ready().turn, { type: 'roll' }, seedFor(6));
    refused(() => act(s, s.turn, { type: 'roll' }));
  });
});
