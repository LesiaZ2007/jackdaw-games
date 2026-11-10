import { GameError, createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { improveCost, type CkState, type Progress } from './ck';
import { BOTH_NAME, SEA_NAME, blank, edgeOf, expansion, inMain, seedWhere, trail } from './expkit';
import { catan, recountRoads, type CatanAction, type CatanState } from './rules';
import { islandOf, islands, isLand, isSea, sailMoves, shipsLeft } from './sea';
import { longestRoad } from './roads';
import { layoutOf, roadSpotsOf, settleSpotsOf, shipSpotsOf } from './spots';
import { act, hand, seedFor, start, withDev } from './testkit';
import { COMMODITIES, countCards, type Cards } from './types';

const game = catan;
const refused = (f: () => unknown) => expect(f).toThrow(GameError);

const pts = (s: CatanState, p: string) => game.getTableView(s).points[p]!;
const rolling = (s: CatanState): CatanState => ({ ...s, phase: 'roll', dice: null });
const give = (s: CatanState, p: string, c: Partial<Cards>): CatanState => ({
  ...s,
  hands: { ...s.hands, [p]: hand(c) },
});
const withShips = (s: CatanState, ships: Record<string, string>): CatanState => ({
  ...s,
  sea: { ...s.sea!, ships: { ...s.sea!.ships, ...ships } },
});
const ckOf = (s: CatanState, patch: Partial<CkState>): CatanState => ({
  ...s,
  ck: { ...s.ck!, ...patch },
});

/** Main phase on a sea map, `me` on turn, everything else off the board. */
function sea(name: typeof SEA_NAME | typeof BOTH_NAME = SEA_NAME) {
  const s0 = inMain(expansion(name));
  const s = { ...s0, buildings: {}, roads: {} } as CatanState;
  const me = s.turn;
  const [other, third] = s.seats.filter((p) => p !== me) as [string, string];
  return { s, me, other, third, L: layoutOf(s) };
}

const seaEdge = (s: CatanState) => (e: string) =>
  layoutOf(s).edges[e]!.tiles.some((t) => isSea(s.board, t));

/** A line of `n` sea edges from a corner of the main island: its corners. */
function lane(s: CatanState, n: number): string[] {
  const L = layoutOf(s);
  return trail(L, n, seaEdge(s), (c) => islandOf(L, s.board, c) === 0);
}

const edgesOf = (L: ReturnType<typeof layoutOf>, T: string[]) =>
  T.slice(1).map((c, i) => edgeOf(L, T[i]!, c));

// ---------- The map and the opening ----------

describe('the sea map', () => {
  it('lays out islands, gold fields and a sea; the target is points + 4', () => {
    const s = start(['a', 'b', 'c'], { expansion: SEA_NAME });
    expect(s.board.map).toBe('seaClassic');
    expect(s.target).toBe(14);
    expect(start(['a', 'b', 'c', 'd', 'e'], { expansion: SEA_NAME }).board.map).toBe('seaBig');
    expect(start(['a', 'b', 'c', 'd', 'e'], { expansion: SEA_NAME, points: '12' }).target).toBe(16);
    expect(start(['a', 'b', 'c'], { expansion: BOTH_NAME }).target).toBe(17);
    expect(start(['a', 'b', 'c'], { expansion: BOTH_NAME, points: '8' }).target).toBe(15);
    const tiles = s.board.tiles;
    expect(tiles.filter((t) => t.terrain === 'gold').length).toBeGreaterThan(0);
    for (const t of tiles) {
      if (t.terrain === 'sea' || t.terrain === 'desert') expect(t.number).toBeNull();
      else expect(t.number).not.toBeNull();
    }
    const home = islands(s.board);
    expect(home.filter((i) => i === 0)).toHaveLength(19);
    expect(Math.max(...home)).toBeGreaterThanOrEqual(2); // islands 1, 2 …
    expect(s.robber).toBe(tiles.findIndex((t) => t.terrain === 'desert'));
    expect(home[s.robber]).toBe(0);
    expect(s.sea).toMatchObject({ ships: {}, pirate: null, moved: false });
    expect(s.sea!.bonus).toEqual({ a: [], b: [], c: [] });
    // Harbors sit around the main island.
    const L = layoutOf(s);
    for (const h of s.board.harbours)
      expect(L.edges[h.edge]!.tiles.some((t) => home[t] === 0)).toBe(true);
    // The big map has 30 main island tiles.
    expect(
      islands(start(['a', 'b', 'c', 'd', 'e'], { expansion: SEA_NAME }).board).filter(
        (i) => i === 0,
      ),
    ).toHaveLength(30);
  });
});

describe('the opening', () => {
  it('settlements go on the main island only', () => {
    const s = start(['a', 'b', 'c'], { expansion: SEA_NAME });
    const pid = s.setup!.order[0]!;
    const L = layoutOf(s);
    const spots = settleSpotsOf(s, pid, true);
    expect(spots.length).toBeGreaterThan(20);
    for (const c of spots) expect(islandOf(L, s.board, c)).toBe(0);
    const isle = L.cornerIds.find(
      (c) => islandOf(L, s.board, c) > 0 && L.corners[c]!.tiles.some((t) => isLand(s.board, t)),
    )!;
    expect(spots).not.toContain(isle);
    refused(() => act(s, pid, { type: 'build', kind: 'settlement', at: isle }));
    // A corner that touches only sea is no place either.
    const water = L.cornerIds.find((c) => L.corners[c]!.tiles.every((t) => isSea(s.board, t)))!;
    refused(() => act(s, pid, { type: 'build', kind: 'settlement', at: water }));
    const coastal = spots[0]!;
    expect(() => act(s, pid, { type: 'build', kind: 'settlement', at: coastal })).not.toThrow();
    // The second pays like any other, but a Seafarers opening piece is still a settlement.
    refused(() => act(s, pid, { type: 'build', kind: 'city', at: coastal }));
  });

  it('the first route can be a ship that touches the new settlement', () => {
    const s0 = start(['a', 'b', 'c'], { expansion: SEA_NAME });
    const pid = s0.setup!.order[0]!;
    const L = layoutOf(s0);
    const at = settleSpotsOf(s0, pid, true).find((c) => shipSpotsOf(s0, pid, c).length > 0)!;
    const s = act(s0, pid, { type: 'build', kind: 'settlement', at });
    const ships = shipSpotsOf(s, pid, at);
    expect(ships.length).toBeGreaterThan(0);
    const far = L.edgeIds.find(
      (e) => L.edges[e]!.a !== at && L.edges[e]!.b !== at && seaEdge(s)(e),
    )!;
    refused(() => act(s, pid, { type: 'build', kind: 'ship', at: far }));
    const t = act(s, pid, { type: 'build', kind: 'ship', at: ships[0]! });
    expect(t.sea!.ships[ships[0]!]).toBe(pid);
    expect(t.setup!.step).toBe(1);
    expect(t.setup!.corner).toBeNull();
    // The base game has no ships.
    const base = start(['a', 'b', 'c']);
    const bp = base.setup!.order[0]!;
    const bs = act(base, bp, {
      type: 'build',
      kind: 'settlement',
      at: base.setup ? layoutOf(base).cornerIds[0]! : '',
    });
    refused(() =>
      act(bs, bp, {
        type: 'build',
        kind: 'ship',
        at: layoutOf(bs).corners[bs.setup!.corner!]!.edges[0]!,
      }),
    );
  });

  it('plays through for 3 and 5 players with roads or ships', () => {
    for (const players of [
      ['a', 'b', 'c'],
      ['a', 'b', 'c', 'd', 'e'],
    ]) {
      const s = expansion(SEA_NAME, players);
      expect(s.phase).toBe('roll');
      const routes = Object.keys(s.roads).length + Object.keys(s.sea!.ships).length;
      expect(routes).toBe(players.length * 2);
      for (const p of players) {
        expect(Object.values(s.buildings).filter((b) => b.owner === p && !b.city)).toHaveLength(2);
      }
    }
  });
});

// ---------- Gold fields ----------

describe('gold fields', () => {
  /** `me` has `piece` beside the first numbered gold tile, rolling its number. */
  function atGold(city: boolean, hands: Partial<Cards> = {}) {
    const { s, me, other, L } = sea();
    const s0 = rolling(blank(s));
    const t = s0.board.tiles.findIndex((x) => x.terrain === 'gold' && x.number);
    const n = s0.board.tiles[t]!.number!;
    const corner = L.tiles[t]!.corners[0]!;
    const k = L.corners[corner]!.tiles.filter(
      (u) => s0.board.tiles[u]!.terrain === 'gold' && s0.board.tiles[u]!.number === n,
    ).length;
    const base = {
      ...s0,
      robber: s0.board.tiles.findIndex((x) => x.terrain === 'desert'),
      buildings: { [corner]: { owner: me, city } },
      hands: { ...s0.hands, [me]: hand(hands) },
    };
    return { base, me, other, n, t, k, rolled: act(base, me, { type: 'roll' }, seedFor(n)) };
  }

  it('a settlement beside a gold field owes one resource of your choice', () => {
    const { rolled, me, k, other } = atGold(false);
    expect(rolled.phase).toBe('pick');
    expect(rolled.owed![me]).toEqual(Array(k).fill('gold'));
    expect(game.waitingOn!(rolled)).toEqual([me]);
    expect(game.getTableView(rolled).owed).toEqual(rolled.owed);
    refused(() => act(rolled, me, { type: 'pick' }));
    refused(() => act(rolled, other, { type: 'pick', resource: 'ore' }));
    refused(() => act(rolled, me, { type: 'roll' }));
    refused(() => act(rolled, me, { type: 'endTurn' }));
    refused(() =>
      act({ ...rolled, bank: { ...rolled.bank, ore: 0 } }, me, { type: 'pick', resource: 'ore' }),
    );
    let s = rolled;
    for (let i = 0; i < k; i++) s = act(s, me, { type: 'pick', resource: 'ore' });
    expect(s.hands[me]!.ore).toBe(k);
    expect(s.bank.ore).toBe(rolled.bank.ore - k);
    expect(s.phase).toBe('main');
    expect(s.owed).toEqual({});
    expect(s.produced[me]!.ore).toBe(k);
  });

  it('a city owes two, and the pick can be any resource but not a commodity', () => {
    const { rolled, me, k } = atGold(true);
    expect(rolled.owed![me]).toEqual(Array(2 * k).fill('gold'));
    let s = act(rolled, me, { type: 'pick', resource: 'wool' });
    if (k === 1) expect(s.phase).toBe('pick');
    for (let i = 1; i < 2 * k; i++) s = act(s, me, { type: 'pick', resource: 'grain' });
    expect(s.phase).toBe('main');
    expect(s.hands[me]).toMatchObject({ wool: 1, grain: 2 * k - 1 });
    for (const g of COMMODITIES) expect(s.hands[me]![g]).toBe(0);
  });

  it('a robber on the gold field pays nothing', () => {
    const { base, me, n, t } = atGold(false);
    const t2 = act({ ...base, robber: t }, me, { type: 'roll' }, seedFor(n));
    expect(t2.phase).toBe('main');
    expect(t2.owed).toEqual({});
  });

  it('gold and commodities live together', () => {
    const { s, me, L } = sea(BOTH_NAME);
    const s0 = rolling(blank(s));
    const t = s0.board.tiles.findIndex((x) => x.terrain === 'gold' && x.number);
    const n = s0.board.tiles[t]!.number!;
    const corner = L.tiles[t]!.corners[0]!;
    const base = {
      ...s0,
      robber: s0.board.tiles.findIndex((x) => x.terrain === 'desert'),
      buildings: { [corner]: { owner: me, city: true } },
    };
    const rolled = act(
      base,
      me,
      { type: 'roll' },
      seedWhere((r, w, f) => r + w === n && f === 'trade'),
    );
    expect(rolled.phase).toBe('pick');
    const done = act(act(rolled, me, { type: 'pick', resource: 'ore' }), me, {
      type: 'pick',
      resource: 'ore',
    });
    expect(done.hands[me]!.ore).toBeGreaterThanOrEqual(2);
  });
});

// ---------- Ships ----------

describe('ships', () => {
  it('cost lumber and wool, and join your building or your ships by a sea edge', () => {
    const { s, me, other, L } = sea();
    const T = lane(s, 3);
    const [e1, e2, e3] = edgesOf(L, T) as [string, string, string];
    const base = give({ ...s, buildings: { [T[0]!]: { owner: me, city: false } } }, me, {
      lumber: 3,
      wool: 3,
    });
    const a = act(base, me, { type: 'build', kind: 'ship', at: e1 });
    expect(a.sea!.ships[e1]).toBe(me);
    expect(a.sea!.built).toEqual([e1]);
    expect(a.hands[me]).toMatchObject({ lumber: 2, wool: 2 });
    expect(a.bank.lumber).toBe(base.bank.lumber + 1);
    // It extends from its own ship, not from nowhere.
    refused(() => act(base, me, { type: 'build', kind: 'ship', at: e2 }));
    const b = act(a, me, { type: 'build', kind: 'ship', at: e2 });
    expect(b.sea!.ships[e2]).toBe(me);
    // Not on an occupied edge, nor without the cards, nor for another player's line.
    refused(() => act(b, me, { type: 'build', kind: 'ship', at: e1 }));
    refused(() => act(give(base, me, { lumber: 1 }), me, { type: 'build', kind: 'ship', at: e1 }));
    refused(() =>
      act(give(a, other, { lumber: 1, wool: 1 }), other, { type: 'build', kind: 'ship', at: e2 }),
    );
    expect(shipSpotsOf(b, other)).toEqual([]);
    expect(shipSpotsOf(b, me)).toContain(e3);
    // A land-locked edge (both sides land) takes no ship; neither does a pure sea one take a road.
    const inland = L.edgeIds.find(
      (e) => L.edges[e]!.tiles.length === 2 && L.edges[e]!.tiles.every((t) => isLand(s.board, t)),
    )!;
    expect(
      shipSpotsOf({ ...b, buildings: { [L.edges[inland]!.a]: { owner: me, city: false } } }, me),
    ).not.toContain(inland);
    const open = L.edgeIds.find(
      (e) => L.edges[e]!.tiles.length === 2 && L.edges[e]!.tiles.every((t) => isSea(s.board, t)),
    )!;
    const harbour = { ...b, buildings: { [L.edges[open]!.a]: { owner: me, city: false } } };
    expect(roadSpotsOf(harbour, me)).not.toContain(open);
    expect(shipSpotsOf(harbour, me)).toContain(open);
  });

  it('a coastal edge takes a ship or a road, not both', () => {
    const { s, me, L } = sea();
    const T = lane(s, 1);
    const e = edgeOf(L, T[0]!, T[1]!);
    const landEdge = L.edges[e]!.tiles.some((t) => isLand(s.board, t));
    const base = { ...s, buildings: { [T[0]!]: { owner: me, city: false } } };
    const ships = withShips(base, { [e]: me });
    expect(roadSpotsOf(ships, me)).not.toContain(e);
    if (landEdge) expect(roadSpotsOf(base, me)).toContain(e);
    expect(shipSpotsOf({ ...base, roads: { [e]: me } }, me)).not.toContain(e);
  });

  it('are limited to 15 each', () => {
    const { s, me, L } = sea();
    const T = lane(s, 2);
    const e = edgeOf(L, T[0]!, T[1]!);
    const fake = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`x${i}`, me]));
    const full = give(
      withShips({ ...s, buildings: { [T[0]!]: { owner: me, city: false } } }, fake),
      me,
      { lumber: 1, wool: 1 },
    );
    expect(shipsLeft(full.sea!, me)).toBe(0);
    refused(() => act(full, me, { type: 'build', kind: 'ship', at: e }));
  });

  it('road building can lay ships', () => {
    const { s, me, L } = sea();
    const T = lane(s, 2);
    const [e1, e2] = edgesOf(L, T) as [string, string];
    const base = withDev({ ...s, buildings: { [T[0]!]: { owner: me, city: false } } }, me, [
      'roadBuilding',
    ]);
    const t = act(base, me, { type: 'play', card: 'roadBuilding' });
    expect(t.phase).toBe('roadBuilding');
    const a = act(t, me, { type: 'build', kind: 'ship', at: e1 });
    expect(a.phase).toBe('roadBuilding');
    const b = act(a, me, { type: 'build', kind: 'ship', at: e2 });
    expect(b.phase).toBe('main');
    expect(b.hands[me]).toEqual(hand());
    expect(Object.keys(b.sea!.ships)).toEqual([e1, e2]);
  });

  it('can’t sail the turn they are built, nor from the middle of a line, and only one a turn', () => {
    const { s, me, other, L } = sea();
    const T = lane(s, 3);
    const [e1, e2, e3] = edgesOf(L, T) as [string, string, string];
    const line = withShips(
      { ...s, buildings: { [T[0]!]: { owner: me, city: false } } },
      {
        [e1]: me,
        [e2]: me,
        [e3]: me,
      },
    );
    // Only the end ship (e3) is open; e1 touches the settlement and e2 is in the middle.
    expect(Object.keys(sailMoves(L, line, me))).toEqual([e3]);
    const to = sailMoves(L, line, me)[e3]![0]!;
    const sailed = act(line, me, { type: 'sail', from: e3, to });
    expect(sailed.sea!.ships[e3]).toBeUndefined();
    expect(sailed.sea!.ships[to]).toBe(me);
    expect(sailed.sea!.moved).toBe(true);
    refused(() => act(line, me, { type: 'sail', from: e1, to })); // touches the settlement
    refused(() => act(line, me, { type: 'sail', from: e2, to }));
    refused(() => act(line, other, { type: 'sail', from: e3, to }));
    // Where it may go: only listed places.
    const far = L.edgeIds.find(
      (e) => !sailMoves(L, line, me)[e3]!.includes(e) && !line.sea!.ships[e],
    )!;
    refused(() => act(line, me, { type: 'sail', from: e3, to: far }));
    // One a turn; none on the turn it was built.
    expect(sailMoves(L, sailed, me)).toEqual({});
    const second = Object.keys(
      sailMoves(L, { ...sailed, sea: { ...sailed.sea!, moved: false } }, me),
    )[0]!;
    refused(() =>
      act(sailed, me, {
        type: 'sail',
        from: second,
        to: sailMoves(L, { ...sailed, sea: { ...sailed.sea!, moved: false } }, me)[second]![0]!,
      }),
    );
    const fresh = { ...line, sea: { ...line.sea!, built: [e3] } };
    refused(() => act(fresh, me, { type: 'sail', from: e3, to }));
    // The next turn it can.
    const next = act({ ...sailed, ...{ phase: 'main' as const } }, me, { type: 'endTurn' });
    expect(next.sea).toMatchObject({ moved: false, built: [] });
  });

  it('a ship beside the pirate can’t sail, and nothing is built beside the pirate', () => {
    const { s, me, L } = sea();
    const T = lane(s, 2);
    const [e1, e2] = edgesOf(L, T) as [string, string];
    const line = withShips(
      { ...s, buildings: { [T[0]!]: { owner: me, city: false } } },
      { [e1]: me, [e2]: me },
    );
    expect(Object.keys(sailMoves(L, line, me))).toEqual([e2]);
    const tile = L.edges[e2]!.tiles.find((t) => isSea(s.board, t))!;
    const guarded = { ...line, sea: { ...line.sea!, pirate: tile } };
    expect(sailMoves(L, guarded, me)).toEqual({});
    const more = give(guarded, me, { lumber: 1, wool: 1 });
    const spot = shipSpotsOf(more, me);
    for (const e of spot) expect(L.tiles[tile]!.edges).not.toContain(e);
  });
});

// ---------- The pirate ----------

describe('the pirate', () => {
  /** A sea tile with a ship of `other` beside it, `me` to move the robber or pirate. */
  function pirating() {
    const { s, me, other, third, L } = sea();
    const tile = s.board.tiles.findIndex((x) => x.terrain === 'sea');
    const e = L.tiles[tile]!.edges[0]!;
    const base: CatanState = {
      ...withShips(s, { [e]: other }),
      phase: 'robber',
      robberBy: me,
      afterRobber: 'main',
      hands: { ...s.hands, [other]: hand({ ore: 3 }) },
    };
    return { base, me, other, third, tile, L, e };
  }

  it('moves to a sea tile and robs a player with a ship beside it', () => {
    const { base, me, other, tile } = pirating();
    const t = act(base, me, { type: 'pirate', tile, victim: other });
    expect(t.sea!.pirate).toBe(tile);
    expect(t.phase).toBe('main');
    expect(t.hands[other]!.ore).toBe(2);
    expect(t.hands[me]!.ore).toBe(1);
    expect(t.robbery).toMatchObject({ thief: me, victim: other, pirate: true, resource: 'ore' });
    // Everyone sees who was robbed, but not what.
    const view = game.getTableView(t);
    expect(view.robbery).toMatchObject({ thief: me, victim: other, pirate: true, took: true });
    expect(JSON.stringify(view.robbery)).not.toMatch(/ore/);
    expect(view.sea!.pirate).toBe(tile);
    expect(game.getPlayerView(t, me).stolen).toMatchObject({ resource: 'ore', role: 'thief' });
    expect(game.getPlayerView(t, other).stolen).toMatchObject({ resource: 'ore', role: 'victim' });
  });

  it('must pick a victim with cards, only one with a ship there, and a different sea tile', () => {
    const { base, me, other, third, tile } = pirating();
    refused(() => act(base, me, { type: 'pirate', tile, victim: null }));
    refused(() => act(base, me, { type: 'pirate', tile, victim: third }));
    refused(() => act(base, me, { type: 'pirate', tile, victim: me }));
    const land = base.board.tiles.findIndex((x) => x.terrain === 'forest');
    refused(() => act(base, me, { type: 'pirate', tile: land, victim: null }));
    const placed = { ...base, sea: { ...base.sea!, pirate: tile } };
    refused(() => act(placed, me, { type: 'pirate', tile, victim: other }));
    // Nobody to rob: moves on its own.
    const empty = { ...base, hands: { ...base.hands, [other]: hand() } };
    expect(act(empty, me, { type: 'pirate', tile, victim: null }).sea!.pirate).toBe(tile);
    // Not in someone else's turn, nor out of the robber phase.
    refused(() => act(base, other, { type: 'pirate', tile, victim: null }));
    refused(() => act({ ...base, phase: 'main' }, me, { type: 'pirate', tile, victim: other }));
  });

  it('the robber still stays on land, and a 7 offers either', () => {
    const { base, me } = pirating();
    const seaTile = base.board.tiles.findIndex((x) => x.terrain === 'sea');
    refused(() => act(base, me, { type: 'robber', tile: seaTile, victim: null }));
    const land = base.board.tiles.findIndex((x, i) => i !== base.robber && x.terrain === 'forest');
    expect(act(base, me, { type: 'robber', tile: land, victim: null }).robber).toBe(land);
    const seven = act(rolling(blank(sea().s)), me, { type: 'roll' }, seedFor(7));
    expect(seven.phase).toBe('robber');
    expect(seven.robberBy).toBe(me);
  });
});

// ---------- Settling islands ----------

describe('new islands', () => {
  /** Settles the corner `at` of `s` for `me`, from a ship of theirs beside it. */
  function settle(s: CatanState, me: string, at: string): CatanState {
    const L = layoutOf(s);
    const e = L.corners[at]!.edges.find(seaEdge(s) as (e: string) => boolean)!;
    const base = give(withShips(s, { [e]: me }), me, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    return act(base, me, { type: 'build', kind: 'settlement', at });
  }
  const corner = (s: CatanState, isle: number, notNear: string[] = []) => {
    const L = layoutOf(s);
    return L.cornerIds.find(
      (c) =>
        islandOf(L, s.board, c) === isle &&
        L.corners[c]!.tiles.some((t) => isLand(s.board, t)) &&
        L.corners[c]!.edges.some(seaEdge(s)) &&
        notNear.every((n) => n !== c && !L.corners[n]!.corners.includes(c)),
    )!;
  };

  it('your first settlement on each small island is worth 2 more points', () => {
    const { s, me, other } = sea();
    const x = corner(s, 1);
    const one = settle(s, me, x);
    expect(one.sea!.bonus[me]).toEqual([1]);
    expect(pts(one, me)).toBe(1 + 2);
    expect(one.log.at(-1)!.text).toMatch(/new island/);
    // A second settlement on the same island adds only its own point.
    const y = corner(s, 1, [x]);
    if (y) {
      const two = settle(one, me, y);
      expect(two.sea!.bonus[me]).toEqual([1]);
      expect(pts(two, me)).toBe(2 + 2);
    }
    // Another island is worth the bonus again.
    const z = corner(s, 2);
    const three = settle(one, me, z);
    expect(three.sea!.bonus[me]).toEqual([1, 2]);
    expect(pts(three, me)).toBe(2 + 4);
    // Rivals aren't affected, and each player takes it once.
    expect(pts(three, other)).toBe(pts(s, other));
    const rival = settle({ ...one, turn: other }, other, z);
    expect(rival.sea!.bonus[other]).toEqual([2]);
    expect(rival.sea!.bonus[me]).toEqual([1]);
  });

  it('the main island is worth nothing extra', () => {
    const { s, me } = sea();
    const t = settle(s, me, corner(s, 0));
    expect(t.sea!.bonus[me]).toEqual([]);
    expect(pts(t, me)).toBe(1);
  });

  it('shows up in the result’s breakdown, and counts toward the target', () => {
    const { s, me } = sea();
    const base = {
      ...s,
      sea: { ...s.sea!, bonus: { ...s.sea!.bonus, [me]: [1, 2, 3, 4, 5, 6, 7] } },
    };
    expect(pts(base, me)).toBe(14);
    const over = act(base, me, { type: 'endTurn' }); // start of the next player's turn: no win yet
    expect(over.phase).toBe('roll');
    // The mover wins as soon as a move takes them to 14: a settlement on top of 12 + 1... use a city.
    const near = {
      ...base,
      sea: { ...base.sea!, bonus: { ...base.sea!.bonus, [me]: [1, 2, 3, 4, 5, 6] } },
      buildings: { [corner(s, 0)]: { owner: me, city: false } },
      hands: { ...base.hands, [me]: hand({ ore: 3, grain: 2 }) },
    };
    expect(pts(near, me)).toBe(13);
    const won = act(near, me, { type: 'build', kind: 'city', at: corner(s, 0) });
    expect(won.phase).toBe('over');
    const reveal = game.getResult(won)!.reveal as {
      points: Record<string, { islands?: number; total: number }>;
    };
    expect(reveal.points[me]).toMatchObject({ islands: 6, total: 14 });
  });
});

// ---------- Longest route ----------

describe('longest route over roads and ships', () => {
  const L = layoutOf({ size: 'classic', board: { map: 'seaClassic' } });
  const T = trail(L, 5);
  const E = T.slice(1).map((c, i) => edgeOf(L, T[i]!, c));
  const own = (edges: string[], p = 'a') => Object.fromEntries(edges.map((e) => [e, p]));

  it('counts roads and ships together when they meet at your own building', () => {
    const b = { [T[3]!]: { owner: 'a', city: false } };
    expect(longestRoad(L, b, own(E.slice(0, 3)), 'a', own(E.slice(3)))).toBe(5);
    expect(longestRoad(L, b, {}, 'a', own(E))).toBe(5);
  });

  it('can’t switch between them anywhere else', () => {
    expect(longestRoad(L, {}, own(E.slice(0, 3)), 'a', own(E.slice(3)))).toBe(3);
    // Another player's building at the join splits them too.
    const rival = { [T[3]!]: { owner: 'b', city: false } };
    expect(longestRoad(L, rival, own(E.slice(0, 3)), 'a', own(E.slice(3)))).toBe(3);
    // Ships of another player don't count.
    expect(longestRoad(L, {}, own(E.slice(0, 3)), 'a', own(E.slice(3), 'b'))).toBe(3);
  });

  it('a rival’s building splits a line of ships', () => {
    const rival = { [T[2]!]: { owner: 'b', city: false } };
    expect(longestRoad(L, rival, {}, 'a', own(E))).toBe(3);
  });

  it('Longest Road changes hands as ships go down, and a sailed ship can break it', () => {
    const { s, me, other } = sea();
    const lane5 = lane(s, 5);
    const LL = layoutOf(s);
    const es = edgesOf(LL, lane5);
    const base = {
      ...s,
      buildings: { [lane5[0]!]: { owner: me, city: false } },
      sea: { ...s.sea!, ships: Object.fromEntries(es.slice(0, 4).map((e) => [e, me])) },
    } as CatanState;
    const four = recountRoads(base);
    expect(four.longest.lengths[me]).toBe(4);
    expect(four.longest.holder).toBeNull();
    const five = give(withShips(four, {}), me, { lumber: 1, wool: 1 });
    const t = act(five, me, { type: 'build', kind: 'ship', at: es[4]! });
    expect(t.longest).toMatchObject({ holder: me });
    expect(t.longest.lengths[me]).toBe(5);
    expect(pts(t, me)).toBe(1 + 2);
    expect(t.award).toMatchObject({ kind: 'road', from: null, to: me });
    // A rival's settlement on the route's corner cuts it.
    const cut = recountRoads({
      ...t,
      buildings: { ...t.buildings, [lane5[3]!]: { owner: other, city: false } },
    });
    expect(cut.longest.lengths[me]).toBeLessThan(5);
    expect(cut.longest.holder).toBeNull();
  });
});

// ---------- With Cities & Knights ----------

describe('Seafarers + Cities & Knights', () => {
  const both = () => sea(BOTH_NAME);

  it('the second opening piece is a city on the main island; the target is 17', () => {
    const s = expansion(BOTH_NAME);
    const L = layoutOf(s);
    expect(s.target).toBe(17);
    for (const p of s.seats) {
      const mine = Object.entries(s.buildings).filter(([, b]) => b.owner === p);
      expect(mine.filter(([, b]) => b.city)).toHaveLength(1);
      expect(mine.filter(([, b]) => !b.city)).toHaveLength(1);
      for (const [c] of mine) expect(islandOf(L, s.board, c)).toBe(0);
    }
    expect(s.ck).toBeDefined();
    expect(s.sea).toBeDefined();
    expect(s.board.map).toBe('seaClassic');
    expect(s.bank.paper).toBe(12);
    const first = start(['a', 'b', 'c'], { expansion: BOTH_NAME });
    const pid = first.setup!.order[0]!;
    const at = settleSpotsOf(first, pid, true)[0]!;
    refused(() => act(first, pid, { type: 'build', kind: 'city', at }));
  });

  it('the robber and the pirate sleep until the barbarians land', () => {
    const { s, me } = both();
    const seven = seedWhere((r, w, f) => r + w === 7 && f !== 'ship');
    const asleep = act(rolling(s), me, { type: 'roll' }, seven);
    expect(asleep.phase).toBe('main');
    expect(asleep.sea!.pirate).toBeNull();
    const awake = act(rolling(ckOf(s, { attacks: 1 })), me, { type: 'roll' }, seven);
    expect(awake.phase).toBe('robber');
    const tile = awake.board.tiles.findIndex((x) => x.terrain === 'sea');
    expect(act(awake, me, { type: 'pirate', tile, victim: null }).sea!.pirate).toBe(tile);
  });

  it('the Bishop can’t put the robber in the sea', () => {
    const { s, me } = both();
    const sailTile = s.board.tiles.findIndex((x) => x.terrain === 'sea');
    const base = ckOf(s, { attacks: 1, hands: { ...s.ck!.hands, [me]: ['bishop' as Progress] } });
    refused(() =>
      act(base, me, { type: 'progress', card: 'bishop', tile: sailTile } as CatanAction),
    );
    const land = base.board.tiles.findIndex((x, i) => i !== base.robber && x.terrain === 'forest');
    const t = act(base, me, { type: 'progress', card: 'bishop', tile: land } as CatanAction);
    expect(t.robber).toBe(land);
  });

  it('a settled island still pays 2 points, and ships give knights no place', () => {
    const { s, me } = both();
    const L = layoutOf(s);
    const x = L.cornerIds.find(
      (c) => islandOf(L, s.board, c) === 1 && L.corners[c]!.edges.some(seaEdge(s)),
    )!;
    const e = L.corners[x]!.edges.find(seaEdge(s))!;
    const base = give(withShips(s, { [e]: me }), me, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    const t = act(base, me, { type: 'build', kind: 'settlement', at: x });
    expect(t.sea!.bonus[me]).toEqual([1]);
    expect(pts(t, me)).toBe(3);
    // Knights: a knight needs a land road, so ships don't give a knight a place.
    expect(Object.keys(t.ck!.knights)).toEqual([]);
  });

  it('improvements and commodities work on a sea map', () => {
    const { s, me } = both();
    const base = give(s, me, { paper: 1 });
    // No city on this stripped board: improvements are refused until there is one.
    refused(() => act(base, me, { type: 'improve', track: 'science' }));
    const L = layoutOf(s);
    const c = L.cornerIds.find((x) => islandOf(L, s.board, x) === 0)!;
    const withCity = { ...base, buildings: { [c]: { owner: me, city: true } } };
    const t = act(withCity, me, { type: 'improve', track: 'science' });
    expect(t.ck!.levels[me]!.science).toBe(1);
    expect(improveCost(t.ck!, me, 'science')).toBe(2);
    expect(countCards(t.hands[me]!)).toBe(0);
  });
});

describe('the turn timer in Seafarers', () => {
  it('finishes the opening with a road or ship beside each settlement', () => {
    let s = start(['a', 'b', 'c'], { expansion: SEA_NAME, turnTimer: '1 minute' });
    for (let i = 0; i < 40 && s.phase === 'setup'; i++) {
      const t = game.nextTimer!(s)!;
      s = game.onTimer!(s, t.id, createRng(i + 1), t.at);
    }
    expect(s.phase).toBe('roll');
    expect(Object.keys(s.roads).length + Object.keys(s.sea!.ships).length).toBe(6);
    const L = layoutOf(s);
    for (const c of Object.keys(s.buildings)) expect(islandOf(L, s.board, c)).toBe(0);
  });

  it('ending early waits for a build past the opening', () => {
    const s = expansion(SEA_NAME);
    expect(game.partialResult!(s)).toBeNull();
  });
});
