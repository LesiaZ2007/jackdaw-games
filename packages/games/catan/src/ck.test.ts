import { GameError, createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { legalMoves } from './bot';
import {
  DECKS,
  PROGRESS_NAME,
  SHIP_STEPS,
  TRACKS,
  type CkState,
  type Knight,
  type Progress,
  type Track,
} from './ck';
import { CK_NAME, blank, edgeOf, expansion, inMain, seedWhere, trail } from './expkit';
import { catan, rateFor, recountRoads, type CatanAction, type CatanState } from './rules';
import { knightSpotsOf, layoutOf, roadSpotsOf } from './spots';
import { act, hand, playSetup, seedFor, start } from './testkit';
import { COMMODITIES, countCards, emptyCards, type Cards } from './types';

const game = catan;
const refused = (f: () => unknown) => expect(f).toThrow(GameError);

const classic = () => layoutOf({ size: 'classic' });

// ---------- Small builders ----------

const ckOf = (s: CatanState, patch: Partial<CkState>): CatanState => ({
  ...s,
  ck: { ...s.ck!, ...patch },
});
const give = (s: CatanState, p: string, c: Partial<Cards>): CatanState => ({
  ...s,
  hands: { ...s.hands, [p]: hand(c) },
});
const withProgress = (s: CatanState, p: string, cards: Progress[]): CatanState =>
  ckOf(s, { hands: { ...s.ck!.hands, [p]: cards } });
const withLevels = (s: CatanState, p: string, l: Partial<Record<Track, number>>): CatanState =>
  ckOf(s, { levels: { ...s.ck!.levels, [p]: { ...s.ck!.levels[p]!, ...l } } });
const withKnights = (s: CatanState, k: Record<string, Knight>): CatanState =>
  ckOf(s, { knights: { ...s.ck!.knights, ...k } });
const cityOf = (s: CatanState, p: string) =>
  Object.keys(s.buildings).find((c) => s.buildings[c]!.owner === p && s.buildings[c]!.city)!;
const settlementOf = (s: CatanState, p: string) =>
  Object.keys(s.buildings).find((c) => s.buildings[c]!.owner === p && !s.buildings[c]!.city)!;
const progress = (
  s: CatanState,
  p: string,
  a: Omit<Extract<CatanAction, { type: 'progress' }>, 'type'>,
  seed = 1,
) => act(s, p, { type: 'progress', ...a } as CatanAction, seed);
const pts = (s: CatanState, p: string) => game.getTableView(s).points[p]!;
const empties = (s: CatanState, n: number) =>
  classic()
    .cornerIds.filter((c) => !s.buildings[c])
    .slice(0, n);

/** In the main phase, `me` on turn, with two rivals. */
function table() {
  const s = inMain(expansion(CK_NAME));
  const me = s.turn;
  const [other, third] = s.seats.filter((p) => p !== me) as [string, string];
  return { s, me, other, third };
}

/** Roll phase for `me`, with nothing but `buildings` on the island. */
const rolling = (s: CatanState): CatanState => ({ ...s, phase: 'roll', dice: null });

// ---------- Setup ----------

describe('setup', () => {
  it('stocks commodities, decks of 18 and a target of points + 3', () => {
    const s = start(['a', 'b', 'c'], { expansion: CK_NAME });
    expect(s.target).toBe(13);
    for (const g of COMMODITIES) expect(s.bank[g]).toBe(12);
    expect(start(['a', 'b', 'c', 'd', 'e'], { expansion: CK_NAME }).bank.paper).toBe(18);
    for (const t of TRACKS) {
      expect(s.ck!.decks[t]).toHaveLength(18);
      expect(Object.values(DECKS[t]).reduce((n, k) => n + k!, 0)).toBe(18);
    }
    expect(s.deck).toEqual([]);
    expect(start(['a', 'b', 'c'], { expansion: CK_NAME, points: '12' }).target).toBe(15);
    expect(start(['a', 'b', 'c']).target).toBe(10);
    expect(start(['a', 'b', 'c']).ck).toBeUndefined();
  });

  it('the first opening piece is a settlement, the second a city that pays resources only', () => {
    let s = start(['a', 'b', 'c'], { expansion: CK_NAME });
    const first = s.setup!.order[0]!;
    const spot = (st: CatanState, p: string) => legalMoves(st, p).find((m) => m.type === 'build')!;
    const at = (spot(s, first) as { at: string }).at;
    refused(() => act(s, first, { type: 'build', kind: 'city', at }));
    while (s.setup!.step < 3) {
      const p = s.setup!.order[s.setup!.step]!;
      s = act(s, p, legalMoves(s, p)[0]!);
    }
    // Now the second round: a settlement is refused, a city accepted.
    const p = s.setup!.order[3]!;
    const m = spot(s, p) as { at: string };
    expect(m).toMatchObject({ kind: 'city' });
    refused(() => act(s, p, { type: 'build', kind: 'settlement', at: m.at }));
    const done = playSetup(s);
    for (const q of done.seats) {
      const mine = Object.values(done.buildings).filter((b) => b.owner === q);
      expect(mine.filter((b) => b.city)).toHaveLength(1);
      expect(mine.filter((b) => !b.city)).toHaveLength(1);
      for (const g of COMMODITIES) expect(done.hands[q]![g]).toBe(0);
      const L = layoutOf(done);
      const corner = cityOf(done, q);
      const n = L.corners[corner]!.tiles.filter(
        (t) => done.board.tiles[t]!.terrain !== 'desert',
      ).length;
      expect(countCards(done.hands[q]!)).toBe(n);
    }
    expect(done.phase).toBe('roll');
  });
});

// ---------- Production ----------

describe('production', () => {
  const pays: Record<string, Partial<Cards>> = {
    forest: { lumber: 1, paper: 1 },
    pasture: { wool: 1, cloth: 1 },
    mountains: { ore: 1, coin: 1 },
    fields: { grain: 2 },
    hills: { brick: 2 },
  };
  it.each(Object.keys(pays))('a city on %s pays its resource and commodity', (terrain) => {
    const s0 = rolling(blank(expansion(CK_NAME)));
    const L = layoutOf(s0);
    const t = s0.board.tiles.findIndex((x) => x.terrain === terrain && x.number);
    const n = s0.board.tiles[t]!.number!;
    const corner = L.tiles[t]!.corners[0]!;
    const robber = s0.board.tiles.findIndex((x) => x.terrain === 'desert');
    const me = s0.turn;
    const mk = (city: boolean) => ({ ...s0, robber, buildings: { [corner]: { owner: me, city } } });
    // What the corner's tiles with that number pay a city.
    const want = emptyCards();
    const one = emptyCards();
    for (const u of L.corners[corner]!.tiles) {
      if (s0.board.tiles[u]!.number !== n) continue;
      const p = pays[s0.board.tiles[u]!.terrain]!;
      for (const r of Object.keys(p) as (keyof Cards)[]) want[r] += p[r]!;
      const first = Object.keys(p)[0] as keyof Cards;
      one[first] += 1;
    }
    const city = act(mk(true), me, { type: 'roll' }, seedFor(n));
    expect(city.hands[me]).toEqual(want);
    expect(city.produced[me]).toEqual(
      Object.fromEntries(Object.entries(want).filter(([, k]) => k)),
    );
    for (const g of COMMODITIES) expect(city.bank[g]).toBe(s0.bank[g] - want[g]);
    const settlement = act(mk(false), me, { type: 'roll' }, seedFor(n));
    expect(settlement.hands[me]).toEqual(one);
  });
});

// ---------- Improvements ----------

describe('city improvements', () => {
  it('science uses paper, trade cloth, politics coin; a second level costs two', () => {
    const { s, me } = table();
    const rich = give(s, me, { paper: 2, cloth: 2, coin: 2 });
    let t = act(rich, me, { type: 'improve', track: 'science' });
    expect(t.ck!.levels[me]!.science).toBe(1);
    expect(t.hands[me]!.paper).toBe(1);
    expect(t.bank.paper).toBe(rich.bank.paper + 1);
    t = act(t, me, { type: 'improve', track: 'trade' });
    expect(t.ck!.levels[me]!.trade).toBe(1);
    expect(t.hands[me]!.cloth).toBe(1);
    t = act(t, me, { type: 'improve', track: 'politics' });
    expect(t.hands[me]!.coin).toBe(1);
    // Level 2 of science needs 2 paper; there's 1 left.
    refused(() => act(t, me, { type: 'improve', track: 'science' }));
    const t2 = act(give(t, me, { paper: 2 }), me, { type: 'improve', track: 'science' });
    expect(t2.ck!.levels[me]!.science).toBe(2);
    expect(t2.hands[me]!.paper).toBe(0);
  });

  it('needs a city and a turn of your own', () => {
    const { s, me, other } = table();
    const noCity = {
      ...give(s, me, { paper: 3 }),
      buildings: Object.fromEntries(
        Object.entries(s.buildings).map(([c, b]) => [
          c,
          b.owner === me ? { ...b, city: false } : b,
        ]),
      ),
    };
    refused(() => act(noCity, me, { type: 'improve', track: 'science' }));
    refused(() => act(give(s, other, { paper: 3 }), other, { type: 'improve', track: 'science' }));
    refused(() =>
      act(rolling(give(s, me, { paper: 3 })), me, { type: 'improve', track: 'science' }),
    );
  });

  it('stops at level 5', () => {
    const { s, me } = table();
    const top = give(withLevels(s, me, { science: 5 }), me, { paper: 9 });
    refused(() => act(top, me, { type: 'improve', track: 'science' }));
  });

  it('the Crane takes one off the next improvement only', () => {
    const { s, me } = table();
    const base = give(withLevels(s, me, { science: 1, trade: 1 }), me, { paper: 2, cloth: 2 });
    const t = act(withProgress(base, me, ['crane']), me, { type: 'progress', card: 'crane' });
    expect(t.ck!.crane).toBe(true);
    const a = act(t, me, { type: 'improve', track: 'science' });
    expect(a.hands[me]!.paper).toBe(1); // level 2 costs 2, less one
    expect(a.ck!.crane).toBe(false);
    const b = act(a, me, { type: 'improve', track: 'trade' });
    expect(b.hands[me]!.cloth).toBe(0); // full price: 2
  });

  it('the Crane lapses at the end of the turn', () => {
    const { s, me } = table();
    const t = ckOf(s, { crane: true, fleet: 'ore', smith: 2 });
    const next = act(t, me, { type: 'endTurn' });
    expect(next.ck).toMatchObject({ crane: false, fleet: null, smith: 0 });
  });
});

describe('metropolises', () => {
  it('the first player to level 4 raises it on their best plain city, for 2 points', () => {
    const { s, me } = table();
    const base = give(withLevels(s, me, { science: 3 }), me, { paper: 4 });
    const before = pts(base, me);
    const t = act(base, me, { type: 'improve', track: 'science' });
    expect(t.ck!.metros.science).toBe(cityOf(s, me));
    expect(pts(t, me)).toBe(before + 2);
    expect(t.award).toMatchObject({ kind: 'science', from: null, to: me });
    expect(game.announce!(base, t)).toContain(`{${me}} raises a metropolis`);
  });

  it('later players at level 4 don’t take it; level 5 over a lower holder steals it', () => {
    const { s, me, other } = table();
    const held = ckOf(withLevels(withLevels(s, other, { science: 4 }), me, { science: 3 }), {
      metros: { science: cityOf(s, other) },
    });
    const four = act(give(held, me, { paper: 4 }), me, { type: 'improve', track: 'science' });
    expect(four.ck!.metros.science).toBe(cityOf(s, other));
    const five = act(give({ ...four }, me, { paper: 5 }), me, {
      type: 'improve',
      track: 'science',
    });
    expect(five.ck!.levels[me]!.science).toBe(5);
    expect(five.ck!.metros.science).toBe(cityOf(s, me));
    expect(pts(five, me)).toBe(pts(four, me) + 2);
    expect(pts(five, other)).toBe(pts(four, other) - 2);
    expect(five.award).toMatchObject({ kind: 'science', from: other, to: me });
  });

  it('a holder already at level 5 keeps it', () => {
    const { s, me, other } = table();
    const held = ckOf(withLevels(withLevels(s, other, { trade: 5 }), me, { trade: 4 }), {
      metros: { trade: cityOf(s, other) },
    });
    const t = act(give(held, me, { cloth: 5 }), me, { type: 'improve', track: 'trade' });
    expect(t.ck!.levels[me]!.trade).toBe(5);
    expect(t.ck!.metros.trade).toBe(cityOf(s, other));
  });

  it('each metropolis needs a plain city of its own', () => {
    const { s, me } = table();
    // The only city already holds the Trade metropolis.
    const held = ckOf(withLevels(s, me, { science: 3 }), { metros: { trade: cityOf(s, me) } });
    const t = act(give(held, me, { paper: 4 }), me, { type: 'improve', track: 'science' });
    expect(t.ck!.levels[me]!.science).toBe(4);
    expect(t.ck!.metros.science).toBeUndefined();
  });
});

// ---------- Knights ----------

describe('knights', () => {
  it('a basic knight costs wool and ore and stands inactive on an empty corner of your road', () => {
    const { s, me, other } = table();
    const at = knightSpotsOf(s, me)[0]!;
    const rich = give(s, me, { wool: 2, ore: 2 });
    const t = act(rich, me, { type: 'build', kind: 'knight', at });
    expect(t.ck!.knights[at]).toMatchObject({ owner: me, level: 1, active: false });
    expect(t.hands[me]).toMatchObject({ wool: 1, ore: 1 });
    // Not on a building, not far from your roads, not without the cards.
    refused(() => act(rich, me, { type: 'build', kind: 'knight', at: settlementOf(s, me) }));
    const far = classic().cornerIds.find(
      (c) => !knightSpotsOf(s, me).includes(c) && !s.buildings[c],
    )!;
    refused(() => act(rich, me, { type: 'build', kind: 'knight', at: far }));
    refused(() => act(s, me, { type: 'build', kind: 'knight', at }));
    refused(() =>
      act(give(s, other, { wool: 2, ore: 2 }), other, { type: 'build', kind: 'knight', at }),
    );
    // A corner already holding a knight is taken.
    refused(() => act(t, me, { type: 'build', kind: 'knight', at }));
  });

  it('only two basic knights each', () => {
    const { s, me } = table();
    const [x, y] = knightSpotsOf(s, me).slice(0, 3);
    const full = give(
      withKnights(s, {
        [x!]: { owner: me, level: 1, active: false },
        [y!]: { owner: me, level: 1, active: false },
      }),
      me,
      { wool: 3, ore: 3 },
    );
    const z = knightSpotsOf(full, me)[0]!;
    refused(() => act(full, me, { type: 'build', kind: 'knight', at: z }));
  });

  it('a rival’s knight on a corner splits a longest road and blocks new roads through it', () => {
    const L = classic();
    const { s, me, other } = table();
    const T = trail(L, 5);
    const roads = Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), other]));
    const line = { ...s, buildings: {}, roads };
    expect(recountRoads(line).longest.lengths[other]).toBe(5);
    const split = withKnights(line, { [T[2]!]: { owner: me, level: 1, active: false } });
    expect(recountRoads(split).longest.lengths[other]).toBe(3);
    // A knight at the end stops the road growing past it.
    const beyond = L.corners[T[5]!]!.edges.find((e) => !roads[e])!;
    expect(roadSpotsOf(line, other)).toContain(beyond);
    const guarded = withKnights(line, { [T[5]!]: { owner: me, level: 1, active: false } });
    expect(roadSpotsOf(guarded, other)).not.toContain(beyond);
  });

  it('activating costs a grain, and the knight can’t act on the turn it woke', () => {
    const L = classic();
    const { s, me } = table();
    const T = trail(L, 3);
    const roads = Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), me]));
    const at = T[0]!;
    const dest = T[2]!;
    const base = give(
      withKnights({ ...s, buildings: {}, roads }, { [at]: { owner: me, level: 1, active: false } }),
      me,
      { grain: 2 },
    );
    refused(() => act(s, me, { type: 'activate', at }));
    // Not yet active: can't move.
    refused(() => act(base, me, { type: 'knight', from: at, to: dest }));
    const awake = act(base, me, { type: 'activate', at });
    expect(awake.ck!.knights[at]).toMatchObject({ active: true, woke: awake.turnSeq });
    expect(awake.hands[me]!.grain).toBe(1);
    refused(() => act(awake, me, { type: 'activate', at })); // already
    refused(() => act(awake, me, { type: 'knight', from: at, to: dest })); // woke this turn
    refused(() => act(awake, me, { type: 'chase', from: at }));
    // Next turn it can go.
    const later = { ...awake, turnSeq: awake.turnSeq + 1 };
    expect(() => act(later, me, { type: 'knight', from: at, to: dest })).not.toThrow();
  });

  it('promotes once a turn for wool and ore; mighty knights need Politics at 3', () => {
    const { s, me } = table();
    const [x, y] = knightSpotsOf(s, me) as [string, string];
    const base = give(
      withKnights(s, {
        [x]: { owner: me, level: 1, active: true },
        [y]: { owner: me, level: 2, active: true },
      }),
      me,
      { wool: 4, ore: 4 },
    );
    const up = act(base, me, { type: 'promote', at: x });
    expect(up.ck!.knights[x]).toMatchObject({ level: 2, active: true });
    expect(up.hands[me]).toMatchObject({ wool: 3, ore: 3 });
    refused(() => act(up, me, { type: 'promote', at: x })); // once a turn
    // Level 3 needs the fortress.
    refused(() => act(base, me, { type: 'promote', at: y }));
    const forted = withLevels(base, me, { politics: 3 });
    expect(act(forted, me, { type: 'promote', at: y }).ck!.knights[y]!.level).toBe(3);
    refused(() => act(give(forted, me, {}), me, { type: 'promote', at: y }));
  });

  it('limits strong knights to two, and a mighty knight is the top', () => {
    const { s, me } = table();
    const [x, y, z] = knightSpotsOf(s, me) as [string, string, string];
    const base = give(
      withLevels(
        withKnights(s, {
          [x]: { owner: me, level: 2, active: false },
          [y]: { owner: me, level: 2, active: false },
          [z]: { owner: me, level: 3, active: false },
        }),
        me,
        { politics: 3 },
      ),
      me,
      { wool: 3, ore: 3 },
    );
    refused(() => act(base, me, { type: 'promote', at: z }));
  });

  it('moves along your own road, ends inactive, and can’t pass a rival knight', () => {
    const L = classic();
    const { s, me, other } = table();
    const T = trail(L, 4);
    const roads = Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), me]));
    const line = withKnights(
      { ...s, buildings: {}, roads },
      { [T[0]!]: { owner: me, level: 1, active: true } },
    );
    const t = act(line, me, { type: 'knight', from: T[0]!, to: T[3]! });
    expect(t.ck!.knights[T[3]!]).toMatchObject({ owner: me, active: false });
    expect(t.ck!.knights[T[0]!]).toBeUndefined();
    refused(() => act(t, me, { type: 'knight', from: T[3]!, to: T[4]! })); // inactive now
    // Off the road, or through a rival's knight of the same strength.
    refused(() =>
      act(line, me, {
        type: 'knight',
        from: T[0]!,
        to: empties(line, 40).find((c) => !T.includes(c))!,
      }),
    );
    const blocked = withKnights(line, { [T[2]!]: { owner: other, level: 1, active: false } });
    refused(() => act(blocked, me, { type: 'knight', from: T[0]!, to: T[3]! }));
    refused(() => act(blocked, me, { type: 'knight', from: T[0]!, to: T[2]! })); // same level
    // Another player can't move your knight.
    refused(() => act(line, other, { type: 'knight', from: T[0]!, to: T[1]! }));
  });

  it('a stronger knight displaces a weaker one, which goes to the nearest free corner of its road', () => {
    const L = classic();
    const { s, me, other } = table();
    const T = trail(L, 3);
    const spare = L.corners[T[2]!]!.corners.find((c) => !T.includes(c))!;
    const roads: Record<string, string> = {
      ...Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), me])),
      [edgeOf(L, T[2]!, spare)]: other,
    };
    const line = withKnights(
      { ...s, buildings: {}, roads },
      {
        [T[0]!]: { owner: me, level: 2, active: true },
        [T[2]!]: { owner: other, level: 1, active: true },
      },
    );
    const t = act(line, me, { type: 'knight', from: T[0]!, to: T[2]! });
    expect(t.ck!.knights[T[2]!]).toMatchObject({ owner: me, level: 2 });
    expect(t.ck!.knights[spare]).toMatchObject({ owner: other, level: 1 });
    // With nowhere to go the knight is lost.
    const lost = act(
      { ...line, roads: Object.fromEntries(Object.entries(roads).filter(([, o]) => o === me)) },
      me,
      { type: 'knight', from: T[0]!, to: T[2]! },
    );
    expect(Object.values(lost.ck!.knights).filter((k) => k.owner === other)).toHaveLength(0);
  });

  it('the robber waits until the barbarians land; then a knight beside it can chase it', () => {
    const { s, me } = table();
    const L = layoutOf(s);
    const at = knightSpotsOf(s, me)[0]!;
    const tile = L.corners[at]!.tiles.find((t) => s.board.tiles[t]!.terrain !== 'desert')!;
    const line = withKnights(
      { ...s, robber: tile },
      { [at]: { owner: me, level: 1, active: true } },
    );
    expect(game.getTableView(line).ck!.robberLive).toBe(false);
    refused(() => act(line, me, { type: 'chase', from: at }));
    const live = ckOf(line, { attacks: 1 });
    expect(game.getTableView(live).ck!.robberLive).toBe(true);
    const chasing = act(live, me, { type: 'chase', from: at });
    expect(chasing.phase).toBe('robber');
    expect(chasing.robberBy).toBe(me);
    expect(chasing.ck!.knights[at]!.active).toBe(false);
    const dest = chasing.board.tiles.findIndex((x, i) => i !== tile && x.terrain === 'desert');
    expect(act(chasing, me, { type: 'robber', tile: dest, victim: null }).phase).toBe('main');
    // Far from the robber, or woken this turn: no.
    const far = L.cornerIds.find((c) => !L.tiles[tile]!.corners.includes(c) && !s.buildings[c])!;
    refused(() =>
      act(withKnights(live, { [far]: { owner: me, level: 1, active: true } }), me, {
        type: 'chase',
        from: far,
      }),
    );
    refused(() =>
      act(
        withKnights(live, { [at]: { owner: me, level: 1, active: true, woke: live.turnSeq } }),
        me,
        {
          type: 'chase',
          from: at,
        },
      ),
    );
  });
});

// ---------- Walls and the hand limit ----------

describe('city walls', () => {
  it('cost 2 brick, go round your own city once, three at most', () => {
    const { s, me, other } = table();
    const c = cityOf(s, me);
    const rich = give(s, me, { brick: 8 });
    const t = act(rich, me, { type: 'build', kind: 'wall', at: c });
    expect(t.ck!.walls).toEqual([c]);
    expect(t.hands[me]!.brick).toBe(6);
    refused(() => act(t, me, { type: 'build', kind: 'wall', at: c })); // already walled
    refused(() => act(rich, me, { type: 'build', kind: 'wall', at: settlementOf(s, me) }));
    refused(() => act(rich, me, { type: 'build', kind: 'wall', at: cityOf(s, other) }));
    refused(() => act(give(s, me, { brick: 1 }), me, { type: 'build', kind: 'wall', at: c }));
    // Three walls: make three cities, wall them, and the fourth city can't be walled.
    const cities = empties(s, 4);
    const four = {
      ...rich,
      buildings: {
        ...s.buildings,
        ...Object.fromEntries(cities.map((x) => [x, { owner: me, city: true }])),
      },
      ck: { ...s.ck!, walls: cities.slice(0, 3) },
    };
    refused(() =>
      act(give(four, me, { brick: 8 }), me, { type: 'build', kind: 'wall', at: cities[3]! }),
    );
  });

  it('each wall lifts the hand limit by 2 on a 7', () => {
    const { s, me, other } = table();
    const sevenSeed = seedWhere((r, w, f) => r + w === 7 && f !== 'ship');
    const roll = (x: CatanState) => act(rolling(x), me, { type: 'roll' }, sevenSeed);
    const eight = give(s, other, { ore: 8 });
    const bare = roll(eight);
    expect(bare.phase).toBe('discard');
    expect(bare.discards).toEqual({ [other]: 4 });
    // The robber still sleeps: after discarding, straight on.
    const done = act(bare, other, { type: 'discard', cards: { ore: 4 } });
    expect(done.phase).toBe('main');
    expect(done.robber).toBe(s.robber);
    // A wall: 8 cards are fine, 10 cards discard 5.
    const walled = ckOf(eight, { walls: [cityOf(s, other)] });
    expect(roll(walled).phase).toBe('main');
    const ten = give(walled, other, { ore: 10 });
    expect(roll(ten).discards).toEqual({ [other]: 5 });
    // Commodities count as cards.
    const goods = give(s, other, { paper: 4, cloth: 4 });
    expect(roll(goods).discards).toEqual({ [other]: 4 });
  });

  it('the robber stays asleep before the first attack, wakes after it', () => {
    const { s, me } = table();
    const sevenSeed = seedWhere((r, w, f) => r + w === 7 && f !== 'ship');
    const asleep = act(rolling(s), me, { type: 'roll' }, sevenSeed);
    expect(asleep.phase).toBe('main');
    expect(asleep.robber).toBe(s.robber);
    const awake = act(ckOf(rolling(s), { attacks: 1 }), me, { type: 'roll' }, sevenSeed);
    expect(awake.phase).toBe('robber');
  });
});

// ---------- The event die and the barbarians ----------

describe('the barbarians', () => {
  const shipSeed = seedWhere((r, w, f) => f === 'ship' && r + w !== 7);

  it('the event die: a ship face sails the ship a step; a gate draws progress cards', () => {
    const { s, me } = table();
    const sail = act(rolling(s), me, { type: 'roll' }, shipSeed);
    expect(sail.ck!.event).toBe('ship');
    expect(sail.ck!.ship).toBe(1);
    const gate = seedWhere((r, w, f) => f === 'science' && r + w !== 7 && r <= 3);
    const lvl2 = rolling(withLevels(s, me, { science: 2 }));
    const drew = act(lvl2, me, { type: 'roll' }, gate);
    expect(drew.ck!.event).toBe('science');
    expect(drew.ck!.ship).toBe(0);
    expect(drew.ck!.decks.science).toHaveLength(17);
    expect(drew.ck!.hands[me]!.length + drew.ck!.shown[me]!.length).toBe(1);
    // A track at 0 never draws; the red die must be within level + 1.
    const none = act(rolling(s), me, { type: 'roll' }, gate);
    expect(none.ck!.decks.science).toHaveLength(18);
    const high = seedWhere((r, w, f) => f === 'science' && r + w !== 7 && r >= 4);
    expect(act(lvl2, me, { type: 'roll' }, high).ck!.decks.science).toHaveLength(18);
  });

  it('a progress card drawn is secret; a victory point card is shown and scores', () => {
    const { s, me } = table();
    const gate = seedWhere((r, w, f) => f === 'politics' && r + w !== 7 && r <= 2);
    const base = withLevels(s, me, { politics: 1 });
    const spy = act(
      rolling(ckOf(base, { decks: { ...s.ck!.decks, politics: ['spy', 'wedding'] } })),
      me,
      { type: 'roll' },
      gate,
    );
    expect(spy.ck!.hands[me]).toEqual(['spy']);
    expect(JSON.stringify(game.getTableView(spy))).not.toMatch(/Drew|"spy"/);
    expect(game.getPlayerView(spy, me).progress).toEqual([{ card: 'spy', playable: true }]);
    const vp = act(
      rolling(ckOf(base, { decks: { ...s.ck!.decks, politics: ['constitution'] } })),
      me,
      { type: 'roll' },
      gate,
    );
    expect(vp.ck!.shown[me]).toEqual(['constitution']);
    expect(vp.ck!.hands[me]).toEqual([]);
    expect(pts(vp, me)).toBe(pts(s, me) + 1);
  });

  it('nobody holds more than 4 progress cards', () => {
    const { s, me } = table();
    const gate = seedWhere((r, w, f) => f === 'science' && r + w !== 7 && r <= 2);
    const full = rolling(
      withProgress(withLevels(s, me, { science: 1 }), me, ['crane', 'crane', 'crane', 'crane']),
    );
    const t = act(full, me, { type: 'roll' }, gate);
    expect(t.ck!.hands[me]).toHaveLength(4);
    expect(t.ck!.decks.science).toHaveLength(18);
  });

  /** A roll that makes the ship land. */
  const lands = (s: CatanState) =>
    act(rolling(ckOf(s, { ship: SHIP_STEPS - 1 })), s.turn, { type: 'roll' }, shipSeed);

  it('beaten back: the strongest defender takes a Defender of Catan point', () => {
    const { s, me } = table();
    const [x] = empties(s, 1);
    // Three cities on the island; one mighty knight makes 3.
    const t = lands(withKnights(s, { [x!]: { owner: me, level: 3, active: true } }));
    expect(t.ck!.attack).toMatchObject({
      won: true,
      strength: 3,
      defender: me,
      tied: [],
      lost: [],
    });
    expect(t.ck!.defenders[me]).toBe(1);
    expect(pts(t, me)).toBe(pts(s, me) + 1);
    expect(t.ck!.ship).toBe(0);
    expect(t.ck!.attacks).toBe(1);
    expect(t.ck!.knights[x!]!.active).toBe(false); // all knights stand down
    expect(game.announce!(s, t)).toContain('The barbarians are beaten back');
    // The robber wakes.
    expect(game.getTableView(t).ck!.robberLive).toBe(true);
  });

  it('beaten back with the best defenders tied: each picks a progress deck', () => {
    const { s, me, other, third } = table();
    const [x, y] = empties(s, 2);
    const t = lands(
      withKnights(s, {
        [x!]: { owner: me, level: 2, active: true },
        [y!]: { owner: other, level: 2, active: true },
      }),
    );
    expect(t.ck!.attack).toMatchObject({ won: true, defender: null });
    expect(t.ck!.attack!.tied.sort()).toEqual([me, other].sort());
    expect(t.phase).toBe('pick');
    expect(game.waitingOn!(t).sort()).toEqual([me, other].sort());
    expect(t.ck!.defenders[me]).toBe(0);
    // A pick needs a deck; the third player owes nothing.
    refused(() => act(t, me, { type: 'pick' }));
    refused(() => act(t, third, { type: 'pick', track: 'trade' }));
    refused(() => act(t, me, { type: 'roll' }));
    const one = act(t, me, { type: 'pick', track: 'trade' });
    expect(one.phase).toBe('pick');
    expect(one.ck!.decks.trade).toHaveLength(17);
    const both = act(one, other, { type: 'pick', track: 'politics' });
    expect(both.phase).toBe('main');
    expect(both.ck!.decks.politics).toHaveLength(17);
  });

  it('lost: the lowest defenders each lose a city, which becomes a settlement', () => {
    const { s, me, other, third } = table();
    const [x] = empties(s, 1);
    // One active basic knight (1) against three cities (3).
    const t = lands(withKnights(s, { [x!]: { owner: me, level: 1, active: true } }));
    expect(t.ck!.attack).toMatchObject({ won: false, strength: 3, defender: null });
    expect(t.ck!.attack!.lost).toEqual(
      [other, third].sort((a, b) => s.seats.indexOf(a) - s.seats.indexOf(b)),
    );
    for (const p of [other, third]) {
      expect(t.buildings[cityOf(s, p)]).toEqual({ owner: p, city: false });
      expect(pts(t, p)).toBe(pts(s, p) - 1);
    }
    expect(t.buildings[cityOf(s, me)]!.city).toBe(true);
    expect(game.announce!(s, t)).toContain('The barbarians pillage the island');
    expect(t.phase).toBe('main');
  });

  it('lost: a metropolis is safe, and a city’s wall falls with it', () => {
    const { s, me, other, third } = table();
    const [x] = empties(s, 1);
    const base = ckOf(withKnights(s, { [x!]: { owner: me, level: 1, active: true } }), {
      metros: { trade: cityOf(s, other) },
      walls: [cityOf(s, third)],
    });
    const t = lands(base);
    expect(t.ck!.attack!.lost).toEqual([third]);
    expect(t.buildings[cityOf(s, other)]!.city).toBe(true);
    expect(t.ck!.walls).toEqual([]);
    expect(t.ck!.attack!.strength).toBe(3);
  });

  it('knights that were not active don’t defend', () => {
    const { s, me } = table();
    const [x] = empties(s, 1);
    const t = lands(withKnights(s, { [x!]: { owner: me, level: 3, active: false } }));
    expect(t.ck!.attack!.won).toBe(false);
    expect(t.ck!.attack!.defence[me]).toBe(0);
  });
});

// ---------- Aqueduct ----------

describe('the aqueduct', () => {
  it('Science 3 owes a free resource on a roll that gave you nothing', () => {
    const s0 = { ...blank(expansion(CK_NAME)), buildings: {} };
    const me = s0.turn;
    const base = withLevels(s0, me, { science: 3 });
    const seed = seedWhere((r, w, f) => r + w === 6 && f === 'trade');
    const t = act(base, me, { type: 'roll' }, seed);
    expect(t.phase).toBe('pick');
    expect(t.owed![me]).toEqual(['aqueduct']);
    expect(game.waitingOn!(t)).toEqual([me]);
    refused(() => act(t, me, { type: 'pick' }));
    const done = act(t, me, { type: 'pick', resource: 'ore' });
    expect(done.hands[me]!.ore).toBe(1);
    expect(done.phase).toBe('main');
    // Nobody else owes; without Science 3 there's no pick.
    const plain = act(s0, me, { type: 'roll' }, seed);
    expect(plain.phase).toBe('main');
  });
});

// ---------- Progress cards ----------

describe('progress cards', () => {
  it('only the player on their turn plays them, after the roll', () => {
    const { s, me, other } = table();
    const held = withProgress(withProgress(s, me, ['crane']), other, ['crane']);
    refused(() => progress(held, other, { card: 'crane' }));
    refused(() => progress(rolling(held), me, { card: 'crane' }));
    refused(() => progress(withProgress(s, me, []), me, { card: 'crane' }));
    expect(() => progress(held, me, { card: 'crane' })).not.toThrow();
    // Victory point cards aren't played.
    refused(() => progress(withProgress(s, me, ['printer']), me, { card: 'printer' }));
    const t = progress(held, me, { card: 'crane' });
    expect(t.ck!.hands[me]).toEqual([]);
    expect(t.ck!.played).toMatchObject({ pid: me, card: 'crane' });
    expect(game.getTableView(t).ck!.played!.card).toBe('crane');
  });

  it('Alchemist: before the roll, choose the dice (the event die still rolls)', () => {
    const s0 = blank(expansion(CK_NAME));
    const me = s0.turn;
    const L = layoutOf(s0);
    const t0 = s0.board.tiles.findIndex((x) => x.terrain === 'fields' && x.number);
    const n = s0.board.tiles[t0]!.number!;
    const corner = L.tiles[t0]!.corners[0]!;
    const robber = s0.board.tiles.findIndex((x) => x.terrain === 'desert');
    const base = withProgress(
      { ...s0, robber, buildings: { [corner]: { owner: me, city: false } } },
      me,
      ['alchemist'],
    );
    const d1 = Math.max(1, n - 6);
    const dice: [number, number] = [d1, n - d1];
    const t = progress(base, me, { card: 'alchemist', dice });
    expect(t.dice).toEqual(dice);
    expect(t.phase).toBe('main');
    expect(t.hands[me]!.grain).toBeGreaterThanOrEqual(1);
    expect(t.ck!.event).not.toBeNull();
    expect(t.ck!.hands[me]).toEqual([]);
    refused(() => progress(base, me, { card: 'alchemist' })); // choose the dice
    refused(() =>
      progress({ ...base, phase: 'main', dice: [3, 4] }, me, { card: 'alchemist', dice }),
    );
    // After rolling it can't be played.
    const rolled = act(base, me, { type: 'roll' }, seedFor(n));
    refused(() =>
      progress(withProgress(rolled, me, ['alchemist']), me, { card: 'alchemist', dice }),
    );
  });

  it('Irrigation takes 2 grain for each fields tile beside your buildings', () => {
    const { s, me } = table();
    const L = layoutOf(s);
    const corner = classicCornerWith(s, 'fields');
    const k = L.corners[corner]!.tiles.filter((t) => s.board.tiles[t]!.terrain === 'fields').length;
    const base = withProgress({ ...s, buildings: { [corner]: { owner: me, city: false } } }, me, [
      'irrigation',
    ]);
    const t = progress(base, me, { card: 'irrigation' });
    expect(t.hands[me]!.grain).toBe(2 * k);
    expect(t.bank.grain).toBe(base.bank.grain - 2 * k);
    // The bank can run short.
    const short = progress({ ...base, bank: { ...base.bank, grain: 1 } }, me, {
      card: 'irrigation',
    });
    expect(short.hands[me]!.grain).toBe(1);
  });

  it('Resource Monopoly: each rival gives up to 2 of a resource; Trade Monopoly, 1 commodity', () => {
    const { s, me, other, third } = table();
    const base = withProgress(
      {
        ...s,
        hands: {
          ...s.hands,
          [other]: hand({ wool: 5, paper: 3 }),
          [third]: hand({ wool: 1, paper: 1 }),
        },
      },
      me,
      ['resourceMonopoly', 'tradeMonopoly'],
    );
    const a = progress(base, me, { card: 'resourceMonopoly', resource: 'wool' });
    expect(a.hands[me]!.wool).toBe(3);
    expect(a.hands[other]!.wool).toBe(3);
    expect(a.hands[third]!.wool).toBe(0);
    expect(a.monopoly).toMatchObject({ pid: me, resource: 'wool', took: 3 });
    refused(() => progress(base, me, { card: 'resourceMonopoly', resource: 'paper' }));
    refused(() => progress(base, me, { card: 'resourceMonopoly' }));
    const b = progress(a, me, { card: 'tradeMonopoly', resource: 'paper' });
    expect(b.hands[me]!.paper).toBe(2);
    expect(b.hands[other]!.paper).toBe(2);
    refused(() => progress(a, me, { card: 'tradeMonopoly', resource: 'wool' }));
  });

  it('Bishop moves the robber (once it’s awake) and takes a card from each player beside it', () => {
    const { s, me, other } = table();
    const L = layoutOf(s);
    const y = settlementOf(s, other);
    const tile = L.corners[y]!.tiles.find(
      (t) =>
        s.board.tiles[t]!.terrain !== 'desert' &&
        L.tiles[t]!.corners.every((c) => s.buildings[c]?.owner !== me),
    )!;
    const base = withProgress(
      { ...s, robber: s.board.tiles.findIndex((x, i) => i !== tile && x.terrain === 'desert') },
      me,
      ['bishop'],
    );
    const stocked = { ...base, hands: { ...base.hands, [other]: hand({ ore: 3 }) } };
    refused(() => progress(stocked, me, { card: 'bishop', tile })); // asleep
    const live = ckOf(stocked, { attacks: 1 });
    const t = progress(live, me, { card: 'bishop', tile });
    expect(t.robber).toBe(tile);
    expect(t.hands[other]!.ore).toBe(2);
    expect(t.hands[me]!.ore).toBe(1);
    refused(() => progress(withProgress(t, me, ['bishop']), me, { card: 'bishop', tile })); // already there
    refused(() => progress(live, me, { card: 'bishop' }));
  });

  it('Spy takes a progress card at random from a rival who has some', () => {
    const { s, me, other } = table();
    const base = withProgress(withProgress(s, me, ['spy']), other, ['wedding', 'crane']);
    const t = progress(base, me, { card: 'spy', victim: other });
    expect(t.ck!.hands[other]).toHaveLength(1);
    expect(t.ck!.hands[me]).toHaveLength(1);
    expect([...t.ck!.hands[me]!, ...t.ck!.hands[other]!].sort()).toEqual(['crane', 'wedding']);
    refused(() => progress(withProgress(s, me, ['spy']), me, { card: 'spy', victim: other })); // none held
    refused(() => progress(base, me, { card: 'spy', victim: me }));
  });

  it('Saboteur: rivals with as many points or more discard half their cards', () => {
    const { s, me, other, third } = table();
    // Everyone has 3 points; `third` has one more card than 1.
    const base = withProgress(
      {
        ...s,
        hands: { ...s.hands, [other]: hand({ ore: 6 }), [third]: hand({ wool: 1 }) },
      },
      me,
      ['saboteur'],
    );
    const t = progress(base, me, { card: 'saboteur' });
    expect(t.phase).toBe('discard');
    expect(t.discards).toEqual({ [other]: 3 });
    const done = act(t, other, { type: 'discard', cards: { ore: 3 } });
    expect(done.phase).toBe('main');
    // A rival behind on points keeps their cards.
    const ahead = {
      ...base,
      buildings: { ...base.buildings, [empties(s, 1)[0]!]: { owner: me, city: true } },
    };
    // (Not adjacent to the road, but the card doesn't care.)
    expect(progress(ahead, me, { card: 'saboteur' }).phase).toBe('main');
  });

  it('Wedding: rivals with more points give you 2 cards, commodities first', () => {
    const { s, me, other, third } = table();
    const base = withProgress(
      ckOf(
        {
          ...s,
          hands: { ...s.hands, [other]: hand({ paper: 1, ore: 3 }), [third]: hand({ ore: 5 }) },
        },
        { shown: { ...s.ck!.shown, [other]: ['printer', 'printer'] } },
      ),
      me,
      ['wedding'],
    );
    const t = progress(base, me, { card: 'wedding' });
    expect(t.hands[me]).toMatchObject({ paper: 1, ore: 1 });
    expect(t.hands[other]).toMatchObject({ paper: 0, ore: 2 });
    expect(t.hands[third]!.ore).toBe(5); // no more points than you
  });

  it('Diplomat removes an open road; your own can be built again', () => {
    const L = classic();
    const { s, me, other } = table();
    const T = trail(L, 4);
    const roads = Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), me]));
    const line = withProgress(
      { ...s, roads, buildings: { [T[0]!]: { owner: me, city: false } }, phase: 'main' as const },
      me,
      ['diplomat'],
    );
    const middle = edgeOf(L, T[1]!, T[2]!);
    const end = edgeOf(L, T[3]!, T[4]!);
    const anchored = edgeOf(L, T[0]!, T[1]!);
    refused(() => progress(line, me, { card: 'diplomat', at: middle }));
    refused(() => progress(line, me, { card: 'diplomat', at: anchored }));
    const t = progress(line, me, { card: 'diplomat', at: end });
    expect(t.roads[end]).toBeUndefined();
    expect(t.phase).toBe('roadBuilding');
    expect(t.roadsToBuild).toBe(1);
    const again = act(t, me, { type: 'build', kind: 'road', at: roadSpotsOf(t, me)[0]! });
    expect(again.phase).toBe('main');
    // A rival's open road is simply removed.
    const theirs = progress(
      {
        ...line,
        roads: {
          ...roads,
          [edgeOf(
            L,
            T[4]!,
            L.corners[T[4]!]!.corners.find((c) => c !== T[3])!,
          )]: other,
        },
      },
      me,
      {
        card: 'diplomat',
        at: edgeOf(
          L,
          T[4]!,
          L.corners[T[4]!]!.corners.find((c) => c !== T[3])!,
        ),
      },
    );
    expect(theirs.phase).toBe('main');
    expect(Object.values(theirs.roads).filter((o) => o === other)).toHaveLength(0);
  });

  it('Merchant: beside your building; 2:1 for that resource, and a point', () => {
    const { s, me } = table();
    const L = layoutOf(s);
    const corner = settlementOf(s, me);
    const tile = L.corners[corner]!.tiles.find((t) => s.board.tiles[t]!.terrain !== 'desert')!;
    const res = {
      forest: 'lumber',
      pasture: 'wool',
      fields: 'grain',
      hills: 'brick',
      mountains: 'ore',
    }[s.board.tiles[tile]!.terrain as 'forest'] as 'lumber';
    const base = withProgress(give(s, me, { [res]: 2 }), me, ['merchant']);
    const t = progress(base, me, { card: 'merchant', tile });
    expect(t.ck!.merchant).toEqual({ tile, owner: me });
    expect(pts(t, me)).toBe(pts(base, me) + 1);
    const other4 = (res as string) === 'ore' ? 'wool' : 'ore';
    const traded = act(t, me, { type: 'bank', give: res, get: other4, n: 1 });
    expect(traded.hands[me]![res]).toBe(0);
    expect(rateFor(t, me, res)).toBe(2);
    // Beside someone else's building only: no. Desert: no.
    const away = s.board.tiles.findIndex(
      (x, i) =>
        x.terrain !== 'desert' && !L.tiles[i]!.corners.some((c) => s.buildings[c]?.owner === me),
    );
    refused(() => progress(base, me, { card: 'merchant', tile: away }));
    const desert = s.board.tiles.findIndex((x) => x.terrain === 'desert');
    refused(() => progress(base, me, { card: 'merchant', tile: desert }));
  });

  it('Merchant Fleet: one kind of card goes 2:1 this turn only', () => {
    const { s: s0, me } = table();
    const s = { ...s0, buildings: {} }; // no harbours
    const base = give(withProgress(s, me, ['merchantFleet']), me, { paper: 2, coin: 4 });
    const t = progress(base, me, { card: 'merchantFleet', resource: 'paper' });
    expect(rateFor(t, me, 'paper')).toBe(2);
    expect(rateFor(t, me, 'coin')).toBe(4);
    const traded = act(t, me, { type: 'bank', give: 'paper', get: 'wool', n: 1 });
    expect(traded.hands[me]!.paper).toBe(0);
    expect(traded.hands[me]!.wool).toBe(1);
    expect(act(t, me, { type: 'endTurn' }).ck!.fleet).toBeNull();
  });

  it('Medicine, Engineer, Smith, Warlord and Mining', () => {
    const { s, me } = table();
    const settle = settlementOf(s, me);
    const med = progress(give(withProgress(s, me, ['medicine']), me, { ore: 2, grain: 1 }), me, {
      card: 'medicine',
      at: settle,
    });
    expect(med.buildings[settle]!.city).toBe(true);
    expect(med.hands[me]).toMatchObject({ ore: 0, grain: 0 });
    refused(() =>
      progress(withProgress(s, me, ['medicine']), me, { card: 'medicine', at: settle }),
    ); // can't pay
    refused(() =>
      progress(give(withProgress(s, me, ['medicine']), me, { ore: 2, grain: 1 }), me, {
        card: 'medicine',
        at: cityOf(s, me),
      }),
    );
    const eng = progress(withProgress(s, me, ['engineer']), me, {
      card: 'engineer',
      at: cityOf(s, me),
    });
    expect(eng.ck!.walls).toEqual([cityOf(s, me)]);
    const [x, y] = knightSpotsOf(s, me) as [string, string];
    const knights = withKnights(s, {
      [x]: { owner: me, level: 1, active: false },
      [y]: { owner: me, level: 1, active: false },
    });
    const smith = progress(withProgress(knights, me, ['smith']), me, { card: 'smith' });
    expect(smith.ck!.smith).toBe(2);
    const p1 = act(smith, me, { type: 'promote', at: x });
    const p2 = act(p1, me, { type: 'promote', at: y });
    expect(p2.ck!.smith).toBe(0);
    expect(p2.hands[me]).toEqual(hand());
    const war = progress(withProgress(knights, me, ['warlord']), me, { card: 'warlord' });
    expect(Object.values(war.ck!.knights).every((k) => k.active)).toBe(true);
    refused(() => act(war, me, { type: 'knight', from: x, to: y })); // woke this turn
    const L = layoutOf(s);
    const mtn = s.board.tiles.findIndex(
      (t, i) => t.terrain === 'mountains' && L.tiles[i]!.corners.length,
    );
    const c = L.tiles[mtn]!.corners[0]!;
    const mine = progress(
      withProgress({ ...s, buildings: { [c]: { owner: me, city: false } } }, me, ['mining']),
      me,
      { card: 'mining' },
    );
    expect(mine.hands[me]!.ore).toBe(
      2 * L.corners[c]!.tiles.filter((t) => s.board.tiles[t]!.terrain === 'mountains').length,
    );
  });

  it('Deserter, Intrigue, Commercial Harbor and Master Merchant', () => {
    const L = classic();
    const { s, me, other } = table();
    const T = trail(L, 3);
    const roads = Object.fromEntries(T.slice(1).map((c, i) => [edgeOf(L, T[i]!, c), me]));
    const stage = (cards: Progress[]) =>
      withProgress(
        withKnights(
          { ...s, buildings: {}, roads },
          { [T[2]!]: { owner: other, level: 2, active: true } },
        ),
        me,
        cards,
      );
    const des = progress(stage(['deserter']), me, { card: 'deserter', victim: other, at: T[0]! });
    expect(des.ck!.knights[T[2]!]).toBeUndefined();
    expect(des.ck!.knights[T[0]!]).toMatchObject({ owner: me, level: 2, active: false });
    const intrigue = progress(stage(['intrigue']), me, { card: 'intrigue', at: T[2]! });
    expect(intrigue.ck!.knights[T[2]!]).toBeUndefined(); // nowhere to go
    const harbour = progress(
      withProgress(
        {
          ...s,
          hands: { ...s.hands, [me]: hand({ ore: 2 }), [other]: hand({ cloth: 2 }) },
        },
        me,
        ['commercialHarbor'],
      ),
      me,
      { card: 'commercialHarbor', resource: 'ore' },
    );
    expect(harbour.hands[me]).toMatchObject({ ore: 1, cloth: 1 });
    expect(harbour.hands[other]).toMatchObject({ ore: 1, cloth: 1 });
    const ahead = ckOf(
      {
        ...s,
        hands: { ...s.hands, [other]: hand({ ore: 4 }) },
      },
      { shown: { ...s.ck!.shown, [other]: ['printer'] } },
    );
    const mm = progress(withProgress(ahead, me, ['masterMerchant']), me, {
      card: 'masterMerchant',
      victim: other,
    });
    expect(mm.hands[me]!.ore).toBe(2);
    refused(() =>
      progress(withProgress(s, me, ['masterMerchant']), me, {
        card: 'masterMerchant',
        victim: other,
      }),
    );
  });
});

/** A corner touching a tile of this terrain with a number. */
function classicCornerWith(s: CatanState, terrain: string): string {
  const L = layoutOf(s);
  const t = s.board.tiles.findIndex((x) => x.terrain === terrain);
  return L.tiles[t]!.corners[0]!;
}

// ---------- Trading ----------

describe('trading commodities', () => {
  it('4:1 for commodities at the bank, 3:1 with a generic harbour, 2:1 with the Trade track at 3', () => {
    const { s, me } = table();
    const L = layoutOf(s);
    const generic = s.board.harbours.find((h) => h.kind === 'any')!;
    const resHarbour = s.board.harbours.find((h) => h.kind === 'ore')!;
    const at = (corner: string, owner = me) => ({
      ...s,
      buildings: { [corner]: { owner, city: false } },
    });
    // Away from every harbour: 4:1 for everything.
    const bare = { ...s, buildings: {} };
    for (const c of ['paper', 'cloth', 'coin', 'wool'] as const)
      expect(rateFor(bare, me, c)).toBe(4);
    const g = at(L.edges[generic.edge]!.a);
    expect(rateFor(g, me, 'paper')).toBe(3);
    expect(rateFor(g, me, 'wool')).toBe(3);
    // A resource harbour does nothing for commodities.
    const r = at(L.edges[resHarbour.edge]!.a);
    expect(rateFor(r, me, 'coin')).toBe(4);
    expect(rateFor(r, me, 'ore')).toBe(2);
    // The Trade track at 3 trades commodities 2:1, resources not.
    const trade = withLevels(bare, me, { trade: 3 });
    expect(rateFor(trade, me, 'cloth')).toBe(2);
    expect(rateFor(trade, me, 'lumber')).toBe(4);
    // And through the bank.
    const t = act(give(trade, me, { cloth: 2 }), me, {
      type: 'bank',
      give: 'cloth',
      get: 'ore',
      n: 1,
    });
    expect(t.hands[me]).toMatchObject({ cloth: 0, ore: 1 });
    expect(t.bank.cloth).toBe(trade.bank.cloth + 2);
    const buy = act(give(bare, me, { ore: 4 }), me, {
      type: 'bank',
      give: 'ore',
      get: 'coin',
      n: 1,
    });
    expect(buy.hands[me]).toMatchObject({ ore: 0, coin: 1 });
    refused(() =>
      act(give(bare, me, { ore: 3 }), me, { type: 'bank', give: 'ore', get: 'coin', n: 1 }),
    );
  });

  it('the base game has no commodities to trade', () => {
    const s = inMain(expansion('Base game'));
    const me = s.turn;
    refused(() =>
      act(give(s, me, { ore: 4 }), me, { type: 'bank', give: 'ore', get: 'paper', n: 1 }),
    );
  });

  it('players can trade commodities too', () => {
    const { s, me, other } = table();
    const base = {
      ...s,
      hands: { ...s.hands, [me]: hand({ paper: 1 }), [other]: hand({ coin: 1 }) },
    };
    const offered = act(base, me, {
      type: 'offer',
      give: { paper: 1 },
      want: { coin: 1 },
      to: other,
    });
    const yes = act(offered, other, {
      type: 'answer',
      offer: offered.offers[0]!.id,
      reply: 'accept',
    });
    const done = act(yes, me, { type: 'accept', offer: offered.offers[0]!.id, with: other });
    expect(done.hands[me]).toMatchObject({ coin: 1, paper: 0 });
    expect(done.hands[other]).toMatchObject({ paper: 1, coin: 0 });
  });
});

// ---------- Paired turns ----------

describe('paired turns (5 and 6 players)', () => {
  it('knights and progress cards act on your own turn only', () => {
    const s = inMain(expansion(CK_NAME, ['a', 'b', 'c', 'd', 'e']));
    const me = s.turn;
    const paired = act(s, me, { type: 'endTurn' });
    expect(paired.paired).not.toBeNull();
    const p = paired.paired!;
    const pat = knightSpotsOf(paired, p)[0]!;
    const k = withKnights(paired, { [pat]: { owner: p, level: 1, active: true } });
    refused(() => act(k, p, { type: 'knight', from: pat, to: knightSpotsOf(k, p)[1] ?? 'c0' }));
    refused(() => act(k, p, { type: 'chase', from: pat }));
    refused(() => progress(withProgress(k, p, ['crane']), p, { card: 'crane' }));
    expect(game.getTableView(paired).ck).not.toBeNull();
  });
});

// ---------- Points and winning ----------

describe('points and winning', () => {
  it('metropolises, defender and victory point cards count; the target is 13', () => {
    const { s, me } = table();
    const base = ckOf(s, {
      metros: { trade: cityOf(s, me) },
      defenders: { ...s.ck!.defenders, [me]: 2 },
      shown: { ...s.ck!.shown, [me]: ['printer', 'constitution'] },
    });
    expect(pts(base, me)).toBe(pts(s, me) + 2 + 2 + 2);
    expect(game.getPlayerView(base, me).points).toBe(pts(base, me));
    expect(s.target).toBe(13);
  });

  it('reaching the target by raising a metropolis wins at once', () => {
    const { s, me } = table();
    const base = give(
      ckOf(withLevels(s, me, { science: 3 }), {
        shown: { ...s.ck!.shown, [me]: Array<Progress>(8).fill('printer') },
      }),
      me,
      { paper: 4 },
    );
    expect(pts(base, me)).toBe(11);
    // The win check runs as the platform applies each move.
    const won = game.applyAction(base, me, { type: 'improve', track: 'science' }, createRng(1), 0);
    expect(won.phase).toBe('over');
    expect(won.winner).toBe(me);
    const result = game.getResult(won)!;
    expect(result.winners).toEqual([me]);
    expect(result.summary).toMatch(/13 points/);
    const reveal = result.reveal as {
      points: Record<string, { metros?: number; defender?: number; progress?: number }>;
    };
    expect(reveal.points[me]).toMatchObject({ metros: 1, defender: 0, progress: 8 });
  });

  it('a player with the points on another player’s turn wins when their own begins', () => {
    const { s, me } = table();
    const next = s.seats[(s.seats.indexOf(me) + 1) % 3]!;
    const later = s.seats.find((p) => p !== me && p !== next)!;
    const rich = (p: string) => ckOf(s, { defenders: { ...s.ck!.defenders, [p]: 10 } });
    const t = act(rich(next), me, { type: 'endTurn' });
    expect(t.phase).toBe('over');
    expect(t.winner).toBe(next);
    // Someone further round just waits for their own turn.
    const w = act(rich(later), me, { type: 'endTurn' });
    expect(w.phase).toBe('roll');
    expect(w.winner).toBeNull();
  });
});

// ---------- Hidden information ----------

describe('hidden information', () => {
  const ids = Object.keys(PROGRESS_NAME);
  const shownIds = new RegExp(`"(${ids.join('|')})"(?!:)`);

  it('other players’ progress cards and the decks never reach the table view or other views', () => {
    const { s, me, other, third } = table();
    const base = ckOf(withProgress(withProgress(s, me, ['spy', 'wedding']), other, ['saboteur']), {
      decks: {
        science: ['alchemist', 'inventor'],
        trade: ['merchant', 'merchantFleet'],
        politics: ['bishop', 'warlord'],
      },
    });
    expect(JSON.stringify(game.getTableView(base))).not.toMatch(shownIds);
    expect(JSON.stringify(game.getPlayerView(base, other))).not.toMatch(/"(spy|wedding)"/);
    expect(JSON.stringify(game.getPlayerView(base, third))).not.toMatch(shownIds);
    expect(JSON.stringify(game.getPlayerView(base, me))).toMatch(/"spy"/);
    expect(JSON.stringify(game.getPlayerView(base, me))).not.toMatch(/saboteur|alchemist/);
    const view = game.getTableView(base);
    expect(view.ck!.progressCounts).toEqual({ [me]: 2, [other]: 1, [third]: 0 });
    expect(view.ck!.deckLeft).toEqual({ science: 2, trade: 2, politics: 2 });
  });

  it('changing everyone else’s progress cards and the decks changes nothing a player sees', () => {
    const { s, me, other, third } = table();
    const real = ckOf(withProgress(withProgress(s, me, ['spy']), other, ['saboteur', 'wedding']), {
      decks: s.ck!.decks,
    });
    const fake = (keep: string): CatanState =>
      ckOf(real, {
        hands: Object.fromEntries(
          real.seats.map((p) => [
            p,
            p === keep ? real.ck!.hands[p]! : real.ck!.hands[p]!.map(() => 'crane' as Progress),
          ]),
        ),
        decks: {
          science: real.ck!.decks.science.map(() => 'crane' as Progress),
          trade: real.ck!.decks.trade.map(() => 'crane' as Progress),
          politics: real.ck!.decks.politics.map(() => 'crane' as Progress),
        },
      });
    expect(game.getTableView(fake(me))).toEqual(game.getTableView(real));
    for (const p of [me, other, third])
      expect(game.getPlayerView(fake(p), p)).toEqual(game.getPlayerView(real, p));
  });

  it('a spied-on card’s identity stays out of the public log until the game is over', () => {
    const { s, me, other } = table();
    const base = withProgress(withProgress(s, me, ['spy']), other, ['wedding']);
    const t = progress(base, me, { card: 'spy', victim: other });
    expect(JSON.stringify(game.getTableView(t))).not.toMatch(/Wedding|"wedding"/);
    expect(t.log.some((e) => e.secret?.includes('Wedding'))).toBe(true); // kept for the recap
  });
});

// ---------- Timers and ending early ----------

describe('the turn timer and ending early', () => {
  /** Fires the turn timer at its deadline. */
  const fire = (s: CatanState, seed = 3): CatanState => {
    const t = game.nextTimer!(s)!;
    return game.onTimer!(s, t.id, createRng(seed), t.at);
  };

  it('finishes a Cities & Knights opening with settlements, then cities', () => {
    let s = start(['a', 'b', 'c'], { expansion: CK_NAME, turnTimer: '1 minute' });
    for (let i = 0; i < 40 && s.phase === 'setup'; i++) s = fire(s);
    expect(s.phase).toBe('roll');
    for (const p of s.seats) {
      const mine = Object.values(s.buildings).filter((b) => b.owner === p);
      expect(mine.map((b) => b.city).sort()).toEqual([false, true]);
    }
  });

  it('makes the picks someone owes', () => {
    const { s, me, other } = table();
    const [x, y] = empties(s, 2);
    const landed = act(
      rolling(
        ckOf(
          withKnights(s, {
            [x!]: { owner: me, level: 2, active: true },
            [y!]: { owner: other, level: 2, active: true },
          }),
          { ship: SHIP_STEPS - 1 },
        ),
      ),
      me,
      { type: 'roll' },
      seedWhere((r, w, f) => f === 'ship' && r + w !== 7),
    );
    expect(landed.phase).toBe('pick');
    const after = fire({ ...landed, turnSecs: 60, actBy: 1000 });
    expect(after.phase).toBe('main');
    expect(after.owed).toEqual({});
  });

  it('ending early: nothing to save before anything is built, then the leader wins', () => {
    const s = expansion(CK_NAME);
    expect(game.partialResult!(s)).toBeNull();
    const ahead = ckOf(s, { defenders: { ...s.ck!.defenders, [s.turn]: 1 } });
    expect(game.partialResult!(ahead)!.winners).toEqual([s.turn]);
  });
});
