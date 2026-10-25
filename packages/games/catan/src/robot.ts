import { botChoose, botSlips, type BotContext, type BotLevel, type Rng } from '@jackdaw/engine';
import { pips } from './board';
import {
  COSTS,
  bankRatio,
  canAfford,
  citySpots,
  distanceOk,
  harboursOf,
  missing,
  piecesLeft,
  roadSpots,
  settlementSpots,
  type Piece,
} from './build';
import type { Layout } from './geometry';
import {
  layoutOf,
  robberSpots,
  victimsAt,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from './rules';
import { RESOURCES, YIELD, countCards, type Cards, type Resource } from './types';

/**
 * A computer player for Catan (2026-10-24: "play against bots"). It decides from its own
 * view and the public table only, as a person in its seat would: it opens on the richest corners,
 * builds whatever it can afford (cities, settlements, roads toward new sites), buys development
 * cards once the island is full, trades surplus with the bank toward its next build, robs the
 * leader, discards its biggest piles on a 7, and answers every trade offered to it (yes when it
 * gains, no otherwise).
 *
 * It trades with people too (2026-10-24: "make catan bots able to trade"): once a turn,
 * short a card or two for its next build, it offers the table one spare card for one it needs,
 * takes the first yes from someone who can pay, and takes the offer back once everyone has
 * answered or after OFFER_WAIT_MS, so a turn never hangs on a player who looks away.
 *
 * By level: below Hard it sometimes opens, settles or builds on a lesser spot, and robs a lesser
 * tile (see botChoose), and now and then skips a trade it could have made.
 *
 * Function declarations throughout: rules.ts imports this file and this file imports rules.ts.
 */
export function catanBot(ctx: BotContext<CatanView, CatanTableView>): CatanAction | null {
  const { playerId: me, view: v, tableView: t } = ctx;
  if (t.phase === 'over' || !t.seats.includes(me)) return null;
  const L = layoutOf(t);
  const pick: Pick = (items, score) =>
    items.length ? botChoose(items, score, ctx.level, ctx.rng) : null;
  switch (t.phase) {
    case 'setup':
      return t.actor === me ? opening(L, t, me, pick) : null;
    case 'discard': {
      const owe = t.discards[me];
      return owe
        ? { type: 'discard', cards: toDiscard(v.hand, owe, goal(L, t, me, v.hand)) }
        : null;
    }
    case 'robber':
      return t.robberBy === me ? robber(L, t, me, pick) : null;
    case 'roll': {
      if (t.actor !== me) return null;
      if (v.dev.some((d) => d.card === 'knight' && d.playable) && robbed(L, t, me))
        return { type: 'play', card: 'knight' };
      return { type: 'roll' };
    }
    case 'roadBuilding': {
      if (t.actor !== me) return null;
      const at = piecesLeft(t.buildings, t.roads, me).road > 0 ? bestRoad(L, t, me, pick) : null;
      return at ? build('road', at) : { type: 'endRoads' };
    }
    case 'main':
      return t.actor === me
        ? turn(L, t, v, me, pick, ctx.now, ctx.level, ctx.rng)
        : answer(L, t, v.hand, me);
  }
}

type T = CatanTableView;

/** How long a bot waits for answers to its offer before taking it back. */
export const OFFER_WAIT_MS = 20_000;

/** Chooses among scored spots by the bot's level (see botChoose); null when there are none. */
type Pick = <X>(items: readonly X[], score: (x: X) => number) => X | null;
type Goal = Piece | 'dev' | null;

const build = (kind: Piece, at: string): CatanAction => ({ type: 'build', kind, at });

const covers = (hand: Cards, c: Partial<Cards>) => RESOURCES.every((r) => hand[r] >= (c[r] ?? 0));

/** How much a corner produces: the dots on the numbers round it. */
function yieldOf(L: Layout, t: T, corner: string): number {
  return L.corners[corner]!.tiles.reduce((n, i) => {
    const tile = t.board.tiles[i]!;
    return n + (tile.number && i !== t.robber ? pips(tile.number) : 0);
  }, 0);
}

/** A corner's worth to `me`: its yield, more for resources they don't produce yet. */
function cornerScore(L: Layout, t: T, me: string, corner: string): number {
  const have = new Set<Resource>();
  for (const [c, b] of Object.entries(t.buildings))
    if (b.owner === me)
      for (const i of L.corners[c]!.tiles) {
        const r = YIELD[t.board.tiles[i]!.terrain];
        if (r) have.add(r);
      }
  let score = 0;
  const fresh = new Set<Resource>();
  for (const i of L.corners[corner]!.tiles) {
    const tile = t.board.tiles[i]!;
    const r = YIELD[tile.terrain];
    if (!r || !tile.number) continue;
    score += pips(tile.number);
    if (!have.has(r)) fresh.add(r);
  }
  const harbour = t.board.harbours.some((h) => {
    const e = L.edges[h.edge]!;
    return e.a === corner || e.b === corner;
  });
  return score + fresh.size * 1.5 + (harbour ? 0.5 : 0);
}

function bestBy<X>(items: readonly X[], score: (x: X) => number): X | null {
  let best: X | null = null;
  let top = -Infinity;
  for (const x of items) {
    const s = score(x);
    if (s > top) [best, top] = [x, s];
  }
  return best;
}

/** Opening placements: the best corner, then a road pointing at the best site beyond it. */
function opening(L: Layout, t: T, me: string, pick: Pick): CatanAction | null {
  const corner = t.setup?.corner;
  if (!corner) {
    const at = pick(settlementSpots(L, t.buildings, t.roads, me, true), (c) =>
      cornerScore(L, t, me, c),
    );
    return at ? build('settlement', at) : null;
  }
  const at = bestBy(roadSpots(L, t.buildings, t.roads, me, corner), (e) => roadScore(L, t, me, e));
  return at ? build('road', at) : null;
}

/** A road's worth: the best site it opens, now or one road further on. */
function roadScore(L: Layout, t: T, me: string, edge: string): number {
  const { a, b } = L.edges[edge]!;
  const roads = { ...t.roads, [edge]: me };
  let best = 0;
  for (const end of [a, b]) {
    if (t.buildings[end] && t.buildings[end]!.owner !== me) continue;
    if (distanceOk(L, t.buildings, end)) best = Math.max(best, cornerScore(L, t, me, end) + 2);
    for (const next of L.corners[end]!.corners)
      if (distanceOk(L, t.buildings, next) && !roadOwnedByOther(L, roads, end, next, me))
        best = Math.max(best, cornerScore(L, t, me, next));
  }
  return best;
}

function roadOwnedByOther(
  L: Layout,
  roads: Record<string, string>,
  a: string,
  b: string,
  me: string,
): boolean {
  const e = L.corners[a]!.edges.find((x) => L.edges[x]!.a === b || L.edges[x]!.b === b);
  return !!e && !!roads[e] && roads[e] !== me;
}

function bestRoad(L: Layout, t: T, me: string, pick: Pick): string | null {
  return pick(roadSpots(L, t.buildings, t.roads, me), (e) => roadScore(L, t, me, e));
}

/** The robber sits on a tile where `me` builds. */
function robbed(L: Layout, t: T, me: string): boolean {
  return (
    L.tiles[t.robber]!.corners.some((c) => t.buildings[c]?.owner === me) &&
    t.board.tiles[t.robber]!.number !== null
  );
}

/** Robber: the tile that hurts the leaders most and spares `me`; rob its richest leader. */
function robber(L: Layout, t: T, me: string, pick: Pick): CatanAction | null {
  const tiles = robberSpots(t, me, (p) => t.points[p] ?? 0);
  const harm = (i: number) => {
    const tile = t.board.tiles[i]!;
    const dots = tile.number ? pips(tile.number) : 0;
    let n = 0;
    for (const c of L.tiles[i]!.corners) {
      const b = t.buildings[c];
      if (!b) continue;
      const w = (b.city ? 2 : 1) * dots;
      n += b.owner === me ? -3 * w - 10 : w * (1 + (t.points[b.owner] ?? 0) / 4);
    }
    if (victimsAt(t, i, me).some((p) => (t.handCounts[p] ?? 0) > 0)) n += 3;
    return n;
  };
  const tile = pick(tiles, harm);
  if (tile === null) return null;
  const rich = victimsAt(t, tile, me).filter((p) => (t.handCounts[p] ?? 0) > 0);
  const victim = bestBy(rich, (p) => (t.points[p] ?? 0) * 10 + (t.handCounts[p] ?? 0));
  return { type: 'robber', tile, victim };
}

/** What `me` is saving for next: the nearer of a settlement and a city, else a road, else a card. */
function goal(L: Layout, t: T, me: string, hand: Cards): Goal {
  const left = piecesLeft(t.buildings, t.roads, me);
  const settle =
    left.settlement > 0 && settlementSpots(L, t.buildings, t.roads, me, false).length > 0;
  const city = left.city > 0 && citySpots(t.buildings, me).length > 0;
  const short = (p: Piece) => countCards(missing(hand, COSTS[p]));
  if (settle && city) return short('city') < short('settlement') ? 'city' : 'settlement';
  if (settle) return 'settlement';
  if (city) return 'city';
  if (left.road > 0 && left.settlement > 0 && roadSpots(L, t.buildings, t.roads, me).length)
    return 'road';
  return t.deckLeft > 0 ? 'dev' : null;
}

const costOf = (g: Goal): Partial<Cards> => (g ? COSTS[g] : {});

/** `n` cards to give up, keeping what the goal needs: from the biggest piles of the rest. */
function toDiscard(hand: Cards, n: number, g: Goal): Partial<Cards> {
  const left = { ...hand };
  const need = costOf(g);
  const out: Partial<Cards> = {};
  for (let k = 0; k < n; k++) {
    const r = RESOURCES.filter((x) => left[x] > 0).reduce((a, b) => {
      const spareA = left[a] - (need[a] ?? 0);
      const spareB = left[b] - (need[b] ?? 0);
      return spareB > spareA ? b : a;
    });
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

/** What one more card of `r` is worth to a hand saving for `g`. */
function worth(hand: Cards, r: Resource, g: Goal): number {
  const need = costOf(g)[r] ?? 0;
  if (hand[r] < need) return 2;
  if (hand[r] === 0) return 1.2;
  return hand[r] >= 3 ? 0.4 : 0.8;
}

/** How much better off a trade leaves `me`: getting `get` for `give`. */
function gain(hand: Cards, give: Partial<Cards>, get: Partial<Cards>, g: Goal): number {
  let h = { ...hand };
  let n = 0;
  for (const r of RESOURCES)
    for (let k = 0; k < (give[r] ?? 0); k++) {
      h = { ...h, [r]: h[r] - 1 };
      n -= worth(h, r, g);
    }
  for (const r of RESOURCES)
    for (let k = 0; k < (get[r] ?? 0); k++) {
      n += worth(h, r, g);
      h = { ...h, [r]: h[r] + 1 };
    }
  return n;
}

/** Off its turn: say yes or no to each open offer made to it, once each. */
function answer(L: Layout, t: T, hand: Cards, me: string): CatanAction | null {
  if (t.paired || t.turn === me) return null;
  const g = goal(L, t, me, hand);
  const o = t.offers.find(
    (x) => x.from === t.turn && (x.to === null || x.to === me) && !x.replies[me],
  );
  if (!o) return null;
  // The offer's maker gives `give` and wants `want`: we'd give `want` and get `give`.
  const ok =
    covers(hand, o.want) &&
    (t.points[o.from] ?? 0) < t.target - 2 &&
    gain(hand, o.want, o.give, g) > 0.1;
  return { type: 'answer', offer: o.id, reply: ok ? 'accept' : 'decline' };
}

/** A counter or proposal made to `me` on its turn that leaves it better off. */
function goodProposal(t: T, hand: Cards, me: string, g: Goal): Offer | null {
  if (t.paired) return null;
  return (
    t.offers.find(
      (o) =>
        o.to === me &&
        o.from !== me &&
        covers(hand, o.want) &&
        (t.handCounts[o.from] ?? 0) >= countCards(o.give) &&
        (t.points[o.from] ?? 0) < t.target - 2 &&
        gain(hand, o.want, o.give, g) > 0.1,
    ) ?? null
  );
}

/** On its turn (or paired phase): trade, play a card, build, buy, then end the turn. */
function turn(
  L: Layout,
  t: T,
  v: CatanView,
  me: string,
  pick: Pick,
  now: number,
  level: BotLevel,
  rng: Rng,
): CatanAction | null {
  const hand = v.hand;
  const left = piecesLeft(t.buildings, t.roads, me);
  const g = goal(L, t, me, hand);

  const offer = goodProposal(t, hand, me, g);
  if (offer) return { type: 'accept', offer: offer.id, with: offer.from };

  // Its own offer to the table: close it with a yes, take it back, or wait for answers.
  const mine = t.offers.find((o) => o.from === me);
  if (mine) return settleOffer(t, hand, me, mine, now);

  const card = devToPlay(L, t, v, me, g);
  if (card) return card;

  if (canAfford(hand, COSTS.city) && left.city > 0) {
    const at = pick(citySpots(t.buildings, me), (c) => yieldOf(L, t, c));
    if (at) return build('city', at);
  }
  const sites = left.settlement > 0 ? settlementSpots(L, t.buildings, t.roads, me, false) : [];
  if (canAfford(hand, COSTS.settlement) && sites.length)
    return build(
      'settlement',
      pick(sites, (c) => cornerScore(L, t, me, c))!,
    );
  // Roads when there's nowhere to settle yet (or to spend a big hand before a 7 takes it).
  if (canAfford(hand, COSTS.road) && left.road > 0) {
    const reach = !sites.length && left.settlement > 0;
    const flush = countCards(hand) > 7 && g !== 'settlement';
    const at = reach || flush ? bestRoad(L, t, me, pick) : null;
    if (at) return build('road', at);
  }
  if (
    canAfford(hand, COSTS.dev) &&
    t.deckLeft > 0 &&
    (g === 'dev' || g === 'road' || g === null || countCards(hand) > 7)
  )
    return { type: 'buy' };

  const ask = tradeOffer(t, hand, g);
  if (ask && !botSlips(level, rng, 2)) return ask;
  const swap = bankTrade(L, t, hand, me, g);
  if (swap) return swap;
  return { type: 'endTurn' };
}

/**
 * What to do with its own open offer: trade with the first who said yes and can pay, take it back
 * once all have answered (or it can't pay any more, or it has waited long enough), else wait.
 */
function settleOffer(t: T, hand: Cards, me: string, o: Offer, now: number): CatanAction | null {
  const others = t.seats.filter((p) => p !== me && (o.to === null || o.to === p));
  const yes = others.find(
    (p) => o.replies[p] === 'accept' && (t.handCounts[p] ?? 0) >= countCards(o.want),
  );
  if (yes && covers(hand, o.give)) return { type: 'accept', offer: o.id, with: yes };
  const answered = others.every((p) => o.replies[p]);
  if (answered || !covers(hand, o.give) || now - (o.at ?? 0) >= OFFER_WAIT_MS)
    return { type: 'withdraw', offer: o.id };
  return null;
}

/**
 * Once a turn, when its goal is a card or two short: one spare card (the one it has most to
 * spare) to the table for one it needs. Never in a paired phase, where there's no trading.
 */
function tradeOffer(t: T, hand: Cards, g: Goal): CatanAction | null {
  if (t.paired || !g || t.tradeTries > 0) return null;
  const need = COSTS[g];
  const short = missing(hand, need);
  if (countCards(short) < 1 || countCards(short) > 2) return null;
  const want = RESOURCES.find((r) => (short[r] ?? 0) > 0)!;
  const spare = bestBy(
    RESOURCES.filter((r) => r !== want && hand[r] - (need[r] ?? 0) >= 1),
    (r) => hand[r] - (need[r] ?? 0),
  );
  if (!spare) return null;
  return { type: 'offer', give: { [spare]: 1 }, want: { [want]: 1 }, to: null };
}

/** A development card worth playing now, if any. */
function devToPlay(L: Layout, t: T, v: CatanView, me: string, g: Goal): CatanAction | null {
  const can = (c: string) => v.dev.some((d) => d.card === c && d.playable);
  const hand = v.hand;
  if (can('knight')) {
    const army = t.army ? (t.knights[t.army] ?? 0) : 2;
    const takesArmy = t.army !== me && (t.knights[me] ?? 0) + 1 > army;
    if (robbed(L, t, me) || takesArmy) return { type: 'play', card: 'knight' };
  }
  if (
    can('roadBuilding') &&
    piecesLeft(t.buildings, t.roads, me).road > 0 &&
    roadSpots(L, t.buildings, t.roads, me).length > 0 &&
    (g === 'road' || g === 'settlement')
  )
    return { type: 'play', card: 'roadBuilding' };
  const short = missing(hand, costOf(g));
  const wanted = RESOURCES.filter((r) => (short[r] ?? 0) > 0).sort(
    (a, b) => (short[b] ?? 0) - (short[a] ?? 0),
  );
  if (can('yearOfPlenty') && wanted.length) {
    const first = wanted[0]!;
    const second =
      (short[first] ?? 0) > 1
        ? first
        : (wanted[1] ?? [...RESOURCES].sort((a, b) => hand[a] - hand[b])[0]!);
    return { type: 'play', card: 'yearOfPlenty', take: [first, second] };
  }
  const others = t.seats.reduce((n, p) => n + (p === me ? 0 : (t.handCounts[p] ?? 0)), 0);
  if (can('monopoly') && wanted.length && others >= 4)
    return { type: 'play', card: 'monopoly', resource: wanted[0]! };
  return null;
}

/** Spare cards to the bank (at the best rate) for one the goal is short of. */
function bankTrade(L: Layout, t: T, hand: Cards, me: string, g: Goal): CatanAction | null {
  if (!g) return null;
  const need = COSTS[g];
  const short = missing(hand, need);
  const get = RESOURCES.filter((r) => (short[r] ?? 0) > 0 && t.bank[r] > 0).sort(
    (a, b) => (short[b] ?? 0) - (short[a] ?? 0),
  )[0];
  if (!get) return null;
  const kinds = harboursOf(L, t.board, t.buildings, me);
  const give = bestBy(
    RESOURCES.filter((r) => r !== get && hand[r] - (need[r] ?? 0) >= bankRatio(kinds, r)),
    (r) => hand[r] - (need[r] ?? 0) - bankRatio(kinds, r),
  );
  return give ? { type: 'bank', give, get, n: 1 } : null;
}
