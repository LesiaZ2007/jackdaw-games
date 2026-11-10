import { botChoose, botSlips, type BotContext, type BotLevel, type Rng } from '@jackdaw/engine';
import { pips } from './board';
import { COSTS, canAfford, distanceOk, missing, piecesLeft, type Piece } from './build';
import {
  CK_COSTS,
  TRACKS,
  TRACK_GOOD,
  WALLS_EACH,
  canAct,
  knightsLeft,
  openRoad,
  type Knight,
  type Progress,
  type Track,
} from './ck';
import type { Layout } from './geometry';
import {
  layoutOf,
  rateFor,
  robberSpots,
  victimsAt,
  type CatanAction,
  type CatanTableView,
  type CatanView,
  type Offer,
} from './rules';
import {
  SHIP_COST,
  islandOf,
  isLand,
  isSea,
  pirateSpots,
  sailMoves,
  shipOwnersAt,
  shipsLeft,
} from './sea';
import {
  citySpotsOf,
  knightSpotsOf,
  roadSpotsOf,
  settleSpotsOf,
  shipSpotsOf,
  wallSpotsOf,
} from './spots';
import {
  CARDS,
  RESOURCES,
  YIELD,
  countCards,
  isCommodity,
  type Card,
  type Cards,
  type Resource,
} from './types';

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
 * It plays the expansions too (2026-11-08: "add the option to select the expansion pack").
 * Seafarers: it builds ships toward islands nobody has settled (each first settlement there is
 * worth two points) and gold fields, sails a loose end ship toward a better coast, and moves the
 * pirate instead of the robber when ships are the better target. Cities & Knights: it raises
 * city improvements on the track it can finish, keeps active knights in step with the cities as
 * the barbarian ship nears, promotes and walls when it has the cards, chases the robber off its
 * own tiles, and plays the progress cards that are simple to use well.
 *
 * By level: below Hard it sometimes opens, settles or builds on a lesser spot, and robs a lesser
 * tile (see botChoose), and now and then skips a trade or a side move it could have made.
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
        ? {
            type: 'discard',
            cards: toDiscard(v.hand, owe, goal(L, t, me, v.hand), reserve(t, me)),
          }
        : null;
    }
    case 'robber':
      return t.robberBy === me ? robber(L, t, me, pick) : null;
    case 'pick': {
      const owed = t.owed[me]?.[0];
      if (!owed) return null;
      if (owed === 'progress' && t.ck) {
        const d = t.ck.deckLeft;
        const track = TRACKS.reduce((x, y) => (d[y] > d[x] ? y : x));
        return { type: 'pick', track };
      }
      const g = goal(L, t, me, v.hand);
      const need = missing(v.hand, costOf(g));
      const want = RESOURCES.filter((r) => t.bank[r] > 0);
      const r =
        want.find((x) => (need[x] ?? 0) > 0) ??
        want.reduce((x, y) => (v.hand[y] < v.hand[x] ? y : x), want[0] ?? 'grain');
      return { type: 'pick', resource: r };
    }
    case 'roll': {
      if (t.actor !== me) return null;
      if (t.ck) {
        const alchemy = alchemist(L, t, v, me, ctx.level, ctx.rng);
        if (alchemy) return alchemy;
      } else if (v.dev.some((d) => d.card === 'knight' && d.playable) && robbed(L, t, me))
        return { type: 'play', card: 'knight' };
      return { type: 'roll' };
    }
    case 'roadBuilding': {
      if (t.actor !== me) return null;
      const at = pick(expandPlan(L, t, me), (c) => c.score);
      return at ? build(at.kind, at.at) : { type: 'endRoads' };
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
type Goal = Piece | 'ship' | 'knight' | 'dev' | null;
type ProgressAction = Extract<CatanAction, { type: 'progress' }>;

const build = (
  kind: 'road' | 'settlement' | 'city' | 'ship' | 'wall' | 'knight',
  at: string,
): CatanAction => ({
  type: 'build',
  kind,
  at,
});

const covers = (hand: Cards, c: Partial<Cards>) => CARDS.every((r) => hand[r] >= (c[r] ?? 0));

const landCorner = (L: Layout, t: T, c: string) =>
  L.corners[c]!.tiles.some((i) => isLand(t.board, i));

/** How many of the player's buildings' tiles show this number (a city counts twice). */
function producing(L: Layout, t: T, owner: string, n: number): number {
  let k = 0;
  for (const [c, b] of Object.entries(t.buildings))
    if (b.owner === owner)
      for (const i of L.corners[c]!.tiles)
        if (t.board.tiles[i]!.number === n && i !== t.robber) k += b.city ? 2 : 1;
  return k;
}

/** How much a corner produces: the dots on the numbers round it. */
function yieldOf(L: Layout, t: T, corner: string): number {
  return L.corners[corner]!.tiles.reduce((n, i) => {
    const tile = t.board.tiles[i]!;
    return n + (tile.number && i !== t.robber ? pips(tile.number) : 0);
  }, 0);
}

/** Seafarers: a corner on a small island this player hasn't settled yet is worth two points. */
function newIsland(L: Layout, t: T, me: string, corner: string): boolean {
  if (!t.sea) return false;
  const isle = islandOf(L, t.board, corner);
  return isle > 0 && !t.sea.bonus[me]?.includes(isle);
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
    if (tile.terrain === 'gold' && tile.number) {
      // A gold field pays whatever is wanted: a little less than its dots, plus a fresh resource.
      score += pips(tile.number) * 0.9 + 0.5;
      continue;
    }
    const r = YIELD[tile.terrain];
    if (!r || !tile.number) continue;
    score += pips(tile.number);
    if (!have.has(r)) fresh.add(r);
  }
  const harbour = t.board.harbours.some((h) => {
    const e = L.edges[h.edge]!;
    return e.a === corner || e.b === corner;
  });
  return score + fresh.size * 1.5 + (harbour ? 0.5 : 0) + (newIsland(L, t, me, corner) ? 7 : 0);
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

/** Opening placements: the best corner, then a road (or ship) pointing at the best site beyond it. */
function opening(L: Layout, t: T, me: string, pick: Pick): CatanAction | null {
  const corner = t.setup?.corner;
  if (!corner) {
    const at = pick(settleSpotsOf(t, me, true), (c) => cornerScore(L, t, me, c));
    if (!at) return null;
    // Cities & Knights: the second opening piece is a city.
    const second = !!t.setup && t.setup.step >= t.setup.order.length / 2;
    return build(t.ck && second ? 'city' : 'settlement', at);
  }
  const reach = t.sea ? seaReach(L, t, me) : null;
  const spots: Spot[] = [
    ...roadSpotsOf(t, me, corner).map((at) => ({
      kind: 'road' as const,
      at,
      score: roadScore(L, t, me, at),
    })),
    ...shipSpotsOf(t, me, corner).map((at) => ({
      kind: 'ship' as const,
      at,
      score: shipScore(L, t, me, at, reach!),
    })),
  ];
  const best = bestBy(spots, (s) => s.score);
  return best ? build(best.kind, best.at) : null;
}

/** A road's worth: the best site it opens, now or one road further on. */
function roadScore(L: Layout, t: T, me: string, edge: string): number {
  const { a, b } = L.edges[edge]!;
  const roads = { ...t.roads, [edge]: me };
  const open = (c: string) =>
    distanceOk(L, t.buildings, c) && landCorner(L, t, c) && !t.ck?.knights[c];
  let best = 0;
  for (const end of [a, b]) {
    if (t.buildings[end] && t.buildings[end]!.owner !== me) continue;
    if (open(end)) best = Math.max(best, cornerScore(L, t, me, end) + 2);
    for (const next of L.corners[end]!.corners)
      if (open(next) && !roadOwnedByOther(L, roads, end, next, me))
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

// ---------- Seafarers: where ships should go ----------

interface Spot {
  kind: 'road' | 'ship';
  at: string;
  score: number;
}

/**
 * For each corner, how much the best settlement site still out of reach is worth when you sail
 * from there: the site's score, discounted by a quarter for every ship it takes to get there.
 * Sites you could settle now are left out.
 */
function seaReach(L: Layout, t: T, me: string): Map<string, number> {
  const sea = t.sea!;
  const out = new Map<string, number>();
  const connected = new Set(settleSpotsOf(t, me, false));
  const pirate = sea.pirate;
  const usable = (e: string) => {
    const o = sea.ships[e];
    if (o) return o === me;
    return (
      !t.roads[e] &&
      L.edges[e]!.tiles.some((i) => isSea(t.board, i)) &&
      !(pirate != null && L.tiles[pirate]!.edges.includes(e))
    );
  };
  for (const c of L.cornerIds) {
    if (connected.has(c) || !distanceOk(L, t.buildings, c) || !landCorner(L, t, c)) continue;
    if (t.ck?.knights[c]) continue;
    const value = cornerScore(L, t, me, c);
    if (value <= 3) continue;
    const dist = new Map<string, number>([[c, 0]]);
    const queue = [c];
    while (queue.length) {
      const x = queue.shift()!;
      const d = dist.get(x)!;
      const here = t.buildings[x];
      if (x !== c && here && here.owner !== me) continue; // can't sail on through a rival's building
      for (const e of L.corners[x]!.edges) {
        if (!usable(e)) continue;
        const nd = d + (sea.ships[e] === me ? 0 : 1);
        if (nd > 5) continue;
        const { a, b } = L.edges[e]!;
        const n = a === x ? b : a;
        if (dist.has(n) && dist.get(n)! <= nd) continue;
        dist.set(n, nd);
        queue.push(n);
      }
    }
    for (const [x, d] of dist) out.set(x, Math.max(out.get(x) ?? 0, value * 0.75 ** d));
  }
  return out;
}

/** A ship's worth: what lies beyond its far end (the end not joined to your own pieces). */
function shipScore(
  L: Layout,
  t: T,
  me: string,
  edge: string,
  reach: Map<string, number>,
  ships: Record<string, string> = t.sea!.ships,
): number {
  const { a, b } = L.edges[edge]!;
  const mine = (c: string) =>
    t.buildings[c]?.owner === me || L.corners[c]!.edges.some((f) => f !== edge && ships[f] === me);
  const [ma, mb] = [mine(a), mine(b)];
  if (ma === mb) return ma ? 0.1 : 0;
  return reach.get(ma ? b : a) ?? 0;
}

const planCache = new WeakMap<object, Map<string, Spot[]>>();

/** Every road and ship `me` could build now (free pieces left), with its worth. */
function expandPlan(L: Layout, t: T, me: string): Spot[] {
  let byMe = planCache.get(t);
  if (!byMe) planCache.set(t, (byMe = new Map()));
  const hit = byMe.get(me);
  if (hit) return hit;
  const left = piecesLeft(t.buildings, t.roads, me);
  const out: Spot[] = [];
  if (left.road > 0)
    for (const at of roadSpotsOf(t, me))
      out.push({ kind: 'road', at, score: roadScore(L, t, me, at) });
  if (t.sea && shipsLeft(t.sea, me) > 0) {
    const reach = seaReach(L, t, me);
    for (const at of shipSpotsOf(t, me))
      out.push({ kind: 'ship', at, score: shipScore(L, t, me, at, reach) });
  }
  byMe.set(me, out);
  return out;
}

/** Sails the loose end of a line toward a clearly better coast, once a turn. */
function sailMove(L: Layout, t: T, me: string): CatanAction | null {
  if (!t.sea || t.paired || t.sea.moved) return null;
  const moves = sailMoves(L, t, me);
  const froms = Object.keys(moves);
  if (!froms.length) return null;
  const reach = seaReach(L, t, me);
  const settleNow = new Set(settleSpotsOf(t, me, false));
  let best: { from: string; to: string } | null = null;
  let top = 2.5;
  for (const from of froms) {
    const { a, b } = L.edges[from]!;
    const joined = (c: string) =>
      t.buildings[c]?.owner === me ||
      L.corners[c]!.edges.some((f) => f !== from && t.sea!.ships[f] === me);
    const far = joined(a) ? b : a;
    if (settleNow.has(far)) continue;
    const here = reach.get(far) ?? 0;
    const rest = { ...t.sea.ships };
    delete rest[from];
    for (const to of moves[from]!) {
      const sc = shipScore(L, t, me, to, reach, rest);
      if (sc >= 3 && sc - here > top) [best, top] = [{ from, to }, sc - here];
    }
  }
  return best ? { type: 'sail', from: best.from, to: best.to } : null;
}

/** The robber sits on a tile where `me` builds. */
function robbed(L: Layout, t: T, me: string): boolean {
  return (
    L.tiles[t.robber]!.corners.some((c) => t.buildings[c]?.owner === me) &&
    t.board.tiles[t.robber]!.number !== null
  );
}

/** How much moving the robber onto `i` hurts the others and spares `me`. */
function robberHarm(L: Layout, t: T, me: string, i: number): number {
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
}

/** How much moving the pirate onto the sea tile `i` hurts the others' ships (and spares ours). */
function pirateHarm(L: Layout, t: T, me: string, i: number): number {
  const ships = t.sea!.ships;
  let n = 0;
  const count: Record<string, number> = {};
  for (const e of L.tiles[i]!.edges) {
    const o = ships[e];
    if (o) count[o] = (count[o] ?? 0) + 1;
  }
  for (const [p, k] of Object.entries(count))
    n += p === me ? -5 * k - 8 : (k * 4 + 2) * (1 + (t.points[p] ?? 0) / 4);
  if (shipOwnersAt(L, ships, i, me).some((p) => (t.handCounts[p] ?? 0) > 0)) n += 3;
  return n;
}

/** Robber (or, at sea, pirate): the move that hurts the leaders most and spares `me`. */
function robber(L: Layout, t: T, me: string, pick: Pick): CatanAction | null {
  const tiles = robberSpots(t, me, (p) => t.points[p] ?? 0);
  const options: { pirate: boolean; tile: number; harm: number }[] = tiles.map((tile) => ({
    pirate: false,
    tile,
    harm: robberHarm(L, t, me, tile),
  }));
  if (t.sea)
    for (const tile of pirateSpots(t.board, t.sea.pirate))
      options.push({ pirate: true, tile, harm: pirateHarm(L, t, me, tile) });
  const choice = pick(options, (o) => o.harm);
  if (choice === null) return null;
  const victims = choice.pirate
    ? shipOwnersAt(L, t.sea!.ships, choice.tile, me)
    : victimsAt(t, choice.tile, me);
  const rich = victims.filter((p) => (t.handCounts[p] ?? 0) > 0);
  const victim = bestBy(rich, (p) => (t.points[p] ?? 0) * 10 + (t.handCounts[p] ?? 0));
  return choice.pirate
    ? { type: 'pirate', tile: choice.tile, victim }
    : { type: 'robber', tile: choice.tile, victim };
}

// ---------- Cities & Knights ----------

const limitOf = (t: T, me: string): number =>
  7 + (t.ck ? 2 * t.ck.walls.filter((c) => t.buildings[c]?.owner === me).length : 0);

const hasCity = (t: T, me: string) =>
  Object.values(t.buildings).some((b) => b.owner === me && b.city);

const myKnights = (t: T, me: string): [string, Knight][] =>
  Object.entries(t.ck!.knights).filter(([, k]) => k.owner === me);

/** The levels of a player's active knights. */
const defenceOf = (t: T, me: string): number =>
  myKnights(t, me).reduce((n, [, k]) => n + (k.active ? k.level : 0), 0);

const totalDefence = (t: T): number => t.seats.reduce((n, p) => n + defenceOf(t, p), 0);

const citiesOnIsland = (t: T): number => Object.values(t.buildings).filter((b) => b.city).length;

interface TrackOption {
  track: Track;
  cost: number;
  good: 'paper' | 'cloth' | 'coin';
  score: number;
}

/** City improvements worth raising, best first (those that reach a level 3 ability or a metropolis). */
function trackOptions(t: T, me: string): TrackOption[] {
  const ck = t.ck;
  if (!ck || !hasCity(t, me)) return [];
  const out: TrackOption[] = [];
  for (const track of TRACKS) {
    const lvl = ck.levels[me]![track];
    if (lvl >= 5) continue;
    const next = lvl + 1;
    const cost = Math.max(0, next - (ck.crane ? 1 : 0));
    const metro = ck.metros[track];
    const holder = metro ? t.buildings[metro]?.owner : undefined;
    const holderLvl = holder ? ck.levels[holder]![track] : 0;
    if (next === 4 && holder && holder !== me) continue;
    if (next === 5 && (holder === me || (holder && holderLvl >= 5))) continue;
    let score = lvl * 1.2 + 1 - next * 0.4;
    if (next === 3) score += 3;
    if (next === 4 && !metro) score += 6;
    if (next === 5) score += 4;
    out.push({ track, cost, good: TRACK_GOOD[track], score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Commodities kept back for the next city improvement. */
function reserve(t: T, me: string): Partial<Cards> {
  const best = trackOptions(t, me)[0];
  return best ? { [best.good]: best.cost } : {};
}

/** Knights one could promote now, level 1 and 2, the weakest active first. */
function promotable(t: T, me: string, hand: Cards): string[] {
  const ck = t.ck!;
  const free = ck.smith > 0 || covers(hand, CK_COSTS.promote);
  if (!free) return [];
  const left = knightsLeft(ck, me);
  return myKnights(t, me)
    .filter(([, k]) => {
      if (k.level === 3 || k.promoted === t.turnSeq) return false;
      const to = (k.level + 1) as 2 | 3;
      return left[to] > 0 && (to !== 3 || ck.levels[me]!.politics >= 3);
    })
    .sort(([, x], [, y]) => Number(y.active) - Number(x.active) || x.level - y.level)
    .map(([c]) => c);
}

/** Active knight strength `me` wants by now: more as the barbarian ship nears. */
function defenceTarget(t: T): number {
  const ck = t.ck!;
  const need = citiesOnIsland(t) + 1;
  const share = Math.ceil(need / t.seats.length);
  if (ck.ship >= 5) return share + Math.max(0, Math.ceil((need - totalDefence(t)) / 2));
  if (ck.ship >= 3) return share;
  if (ck.ship >= 1) return Math.ceil(share / 2);
  return 0;
}

/** One move to raise defense: wake a knight, promote one, or raise a new one. */
function defend(
  L: Layout,
  t: T,
  me: string,
  hand: Cards,
  target: number,
  pick: Pick,
): CatanAction | null {
  if (defenceOf(t, me) >= target) return null;
  const sleeping = myKnights(t, me)
    .filter(([, k]) => !k.active)
    .sort(([, x], [, y]) => y.level - x.level);
  if (sleeping.length && hand.grain >= CK_COSTS.activate.grain)
    return { type: 'activate', at: sleeping[0]![0] };
  const up = promotable(t, me, hand);
  if (up.length) return { type: 'promote', at: up[0]! };
  if (covers(hand, CK_COSTS.knight) && knightsLeft(t.ck!, me)[1] > 0) {
    const spots = knightSpotsOf(t, me);
    const own = new Set(settleSpotsOf(t, me, false));
    const near = new Set(L.tiles[t.robber]!.corners);
    const at = pick(
      spots,
      (c) => (own.has(c) ? -5 : 0) + (near.has(c) ? 3 : 0) + yieldOf(L, t, c) * 0.1,
    );
    if (at) return build('knight', at);
  }
  return null;
}

/** An active knight beside the robber on one of our tiles chases it off. */
function chaseMove(L: Layout, t: T, me: string): CatanAction | null {
  if (t.paired || !t.ck?.robberLive || !robbed(L, t, me)) return null;
  const beside = new Set(L.tiles[t.robber]!.corners);
  const k = myKnights(t, me).find(([c, kn]) => beside.has(c) && canAct(kn, t.turnSeq));
  return k ? { type: 'chase', from: k[0] } : null;
}

/** The corner with the most of this terrain's tiles beside `pid`'s buildings (each tile once). */
function besideCount(L: Layout, t: T, me: string, terrain: string): number {
  const out = new Set<number>();
  for (const [c, b] of Object.entries(t.buildings))
    if (b.owner === me)
      for (const i of L.corners[c]!.tiles) if (t.board.tiles[i]!.terrain === terrain) out.add(i);
  return out.size;
}

/** Whether the Alchemist should set the dice before this roll, and to what. */
function alchemist(
  L: Layout,
  t: T,
  v: CatanView,
  me: string,
  level: BotLevel,
  rng: Rng,
): CatanAction | null {
  if (!v.progress.some((p) => p.card === 'alchemist' && p.playable) || botSlips(level, rng, 1.5))
    return null;
  let best = 0;
  let total = 0;
  for (let n = 2; n <= 12; n++) {
    if (n === 7) continue;
    const mine = producing(L, t, me, n);
    const others = t.seats.reduce((k, p) => k + (p === me ? 0 : producing(L, t, p, n)), 0);
    const s = mine - 0.4 * others;
    if (mine >= 2 && s > best) [best, total] = [s, n];
  }
  if (!total) return null;
  // The red die first, kept low: a city gate draws a progress card for it.
  const red = Math.max(1, total - 6);
  return { type: 'progress', card: 'alchemist', dice: [red, total - red] };
}

/** A progress card worth playing now, with what it needs. */
function progressMove(
  L: Layout,
  t: T,
  v: CatanView,
  me: string,
  g: Goal,
  pick: Pick,
): CatanAction | null {
  const ck = t.ck!;
  const hand = v.hand;
  const can = new Set(v.progress.filter((p) => p.playable).map((p) => p.card));
  if (!can.size) return null;
  const play = (card: Progress, extra: Partial<ProgressAction> = {}): CatanAction => ({
    type: 'progress',
    card,
    ...extra,
  });
  const rivals = t.seats.filter((p) => p !== me);
  const mine = t.points[me] ?? 0;
  const others = rivals.reduce((n, p) => n + (t.handCounts[p] ?? 0), 0);
  const left = piecesLeft(t.buildings, t.roads, me);
  const leader = bestBy(rivals, (p) => (t.points[p] ?? 0) * 100 + (t.handCounts[p] ?? 0));
  const short = missing(hand, costOf(g));

  if (can.has('medicine') && covers(hand, CK_COSTS.medicine) && left.city > 0) {
    const at = pick(citySpotsOf(t, me), (c) => yieldOf(L, t, c));
    if (at) return play('medicine', { at });
  }
  if (can.has('irrigation') && besideCount(L, t, me, 'fields') > 0 && t.bank.grain >= 2)
    return play('irrigation');
  if (can.has('mining') && besideCount(L, t, me, 'mountains') > 0 && t.bank.ore >= 2)
    return play('mining');
  if (can.has('engineer')) {
    const walls = wallSpotsOf(t, me);
    const built = ck.walls.filter((c) => t.buildings[c]?.owner === me).length;
    const at = bestBy(walls, (c) => yieldOf(L, t, c));
    if (at && built < WALLS_EACH) return play('engineer', { at });
  }
  if (can.has('warlord')) {
    const asleep = myKnights(t, me).filter(([, k]) => !k.active).length;
    if (asleep >= 2 || (asleep >= 1 && ck.ship >= 3 && hand.grain < 1)) return play('warlord');
  }
  if (can.has('smith') && promotableFree(t, me).length >= 1) return play('smith');
  if (can.has('crane')) {
    const opt = trackOptions(t, me).find(
      (o) => !ck.crane && hand[o.good] >= o.cost - 1 && o.cost >= 1,
    );
    if (opt) return play('crane');
  }
  if (can.has('merchantFleet')) {
    const card = CARDS.find(
      (c) =>
        hand[c] >= 4 &&
        rateFor(t, me, c) > 2 &&
        (c !== 'grain' || !g) &&
        hand[c] - (costOf(g)[c] ?? 0) >= 3,
    );
    if (card) return play('merchantFleet', { resource: card });
  }
  if (
    can.has('wedding') &&
    rivals.some((p) => (t.points[p] ?? 0) > mine && (t.handCounts[p] ?? 0) >= 2)
  )
    return play('wedding');
  if (can.has('saboteur')) {
    const hit = rivals.filter((p) => (t.points[p] ?? 0) >= mine && (t.handCounts[p] ?? 0) >= 4);
    const top = Math.max(...rivals.map((p) => t.points[p] ?? 0));
    if (hit.length >= 2 && mine < top) return play('saboteur');
  }
  if (can.has('masterMerchant')) {
    const victim = bestBy(
      rivals.filter((p) => (t.points[p] ?? 0) > mine && (t.handCounts[p] ?? 0) >= 2),
      (p) => (t.points[p] ?? 0) * 100 + (t.handCounts[p] ?? 0),
    );
    if (victim) return play('masterMerchant', { victim });
  }
  if (can.has('spy')) {
    const victim = bestBy(
      rivals.filter((p) => (ck.progressCounts[p] ?? 0) > 0),
      (p) => (t.points[p] ?? 0) * 10 + (ck.progressCounts[p] ?? 0),
    );
    if (victim) return play('spy', { victim });
  }
  if (can.has('bishop') && ck.robberLive) {
    const tile = bestBy(
      robberSpots(t, me, (p) => t.points[p] ?? 0),
      (i) => robberHarm(L, t, me, i),
    );
    if (tile !== null && robberHarm(L, t, me, tile) >= 8) return play('bishop', { tile });
  }
  if (can.has('deserter') && leader) {
    const victim = bestBy(
      rivals.filter((p) => myKnights(t, p).length > 0),
      (p) => (t.points[p] ?? 0) * 10 + myKnights(t, p).length,
    );
    if (victim && (t.points[victim] ?? 0) >= mine) return play('deserter', { victim });
  }
  if (can.has('merchant') && ck.merchant?.owner !== me) {
    const mineTiles = new Set<number>();
    for (const [c, b] of Object.entries(t.buildings))
      if (b.owner === me) for (const i of L.corners[c]!.tiles) mineTiles.add(i);
    const tile = bestBy(
      [...mineTiles].filter((i) => YIELD[t.board.tiles[i]!.terrain]),
      (i) => {
        const n = t.board.tiles[i]!.number;
        return (n ? pips(n) : 0) + (hand[YIELD[t.board.tiles[i]!.terrain]!] >= 2 ? 1 : 0);
      },
    );
    if (tile !== null) return play('merchant', { tile });
  }
  if (can.has('resourceMonopoly') && others >= 6) {
    const wanted = RESOURCES.filter((r) => (short[r] ?? 0) > 0);
    const resource =
      wanted[0] ?? RESOURCES.reduce((a, b) => (hand[b] < hand[a] ? b : a), RESOURCES[0]!);
    return play('resourceMonopoly', { resource });
  }
  if (can.has('tradeMonopoly') && others >= 5) {
    const opt = trackOptions(t, me).find((o) => hand[o.good] < o.cost);
    if (opt) return play('tradeMonopoly', { resource: opt.good });
  }
  if (
    can.has('roadBuilding') &&
    (g === 'road' || g === 'settlement' || g === 'ship') &&
    expandPlan(L, t, me).some((s) => s.score > 0)
  )
    return play('roadBuilding');
  if (can.has('inventor')) {
    const tiles = inventorSwap(L, t, me);
    if (tiles) return play('inventor', { tiles });
  }
  if (can.has('commercialHarbor') && rivals.length) {
    const r = RESOURCES.find((x) => hand[x] - (costOf(g)[x] ?? 0) >= rivals.length + 1);
    if (r) return play('commercialHarbor', { resource: r });
  }
  // A full hand of cards that wait on nothing: use the simple ones so new draws aren't blocked.
  if (v.progress.length >= 3) {
    if (can.has('intrigue')) {
      const at = Object.entries(ck.knights).find(
        ([c, k]) => k.owner !== me && L.corners[c]!.edges.some((e) => t.roads[e] === me),
      )?.[0];
      if (at) return play('intrigue', { at });
    }
    if (can.has('diplomat')) {
      const at = Object.keys(t.roads).find((e) => t.roads[e] !== me && openRoad(L, t, e));
      if (at) return play('diplomat', { at });
    }
  }
  return null;
}

/** Knights a Smith could promote for free (the cost aside). */
function promotableFree(t: T, me: string): string[] {
  const probe = { ...t, ck: { ...t.ck!, smith: 2 } };
  return promotable(probe, me, emptyHand());
}

const emptyHand = (): Cards => ({
  lumber: 0,
  brick: 0,
  wool: 0,
  grain: 0,
  ore: 0,
  paper: 0,
  cloth: 0,
  coin: 0,
});

/** Swapping two number tokens (never 2, 12, 6 or 8) that helps `me` most, if it helps. */
function inventorSwap(L: Layout, t: T, me: string): [number, number] | null {
  const ok = (i: number) => {
    const n = t.board.tiles[i]!.number;
    return n !== null && ![2, 12, 6, 8].includes(n);
  };
  const tiles = t.board.tiles.flatMap((_, i) => (ok(i) ? [i] : []));
  const stake = (i: number) =>
    L.tiles[i]!.corners.reduce((n, c) => {
      const b = t.buildings[c];
      if (!b) return n;
      return n + (b.owner === me ? 1 : -0.5) * (b.city ? 2 : 1);
    }, 0);
  let best: [number, number] | null = null;
  let top = 2;
  for (const x of tiles)
    for (const y of tiles) {
      if (x >= y) continue;
      const nx = t.board.tiles[x]!.number!;
      const ny = t.board.tiles[y]!.number!;
      if (nx === ny) continue;
      const gain = stake(x) * (pips(ny) - pips(nx)) + stake(y) * (pips(nx) - pips(ny));
      if (gain > top) [best, top] = [[x, y], gain];
    }
  return best;
}

// ---------- Goals, discards, trades ----------

/** What `me` is saving for next: the nearer of a settlement and a city, else a road or ship, else a card. */
function goal(L: Layout, t: T, me: string, hand: Cards): Goal {
  const left = piecesLeft(t.buildings, t.roads, me);
  const settle = left.settlement > 0 && settleSpotsOf(t, me, false).length > 0;
  const city = left.city > 0 && citySpotsOf(t, me).length > 0;
  const short = (p: Piece) => countCards(missing(hand, COSTS[p]));
  if (settle && city) return short('city') < short('settlement') ? 'city' : 'settlement';
  if (settle) return 'settlement';
  if (city) return 'city';
  if (left.settlement > 0) {
    const best = bestBy(expandPlan(L, t, me), (s) => s.score);
    if (best && best.score > 0) return best.kind;
  }
  if (left.road > 0 && left.settlement > 0 && roadSpotsOf(t, me).length) return 'road';
  if (t.ck) return 'knight';
  return t.deckLeft > 0 ? 'dev' : null;
}

function costOf(g: Goal): Partial<Cards> {
  if (!g) return {};
  if (g === 'ship') return SHIP_COST;
  if (g === 'knight') return CK_COSTS.knight;
  return COSTS[g];
}

/** `n` cards to give up, keeping what the goal needs: from the biggest piles of the rest. */
function toDiscard(hand: Cards, n: number, g: Goal, keep: Partial<Cards> = {}): Partial<Cards> {
  const left = { ...hand };
  const need = costOf(g);
  const out: Partial<Cards> = {};
  const spare = (r: Card) => left[r] - (need[r] ?? 0) - (keep[r] ?? 0);
  for (let k = 0; k < n; k++) {
    const r = CARDS.filter((x) => left[x] > 0).reduce((a, b) => (spare(b) > spare(a) ? b : a));
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

/** What one more card of `r` is worth to a hand saving for `g`. */
function worth(hand: Cards, r: Card, g: Goal): number {
  if (isCommodity(r)) return hand[r] < 3 ? 1 : 0.4;
  const need = costOf(g)[r] ?? 0;
  if (hand[r] < need) return 2;
  if (hand[r] === 0) return 1.2;
  return hand[r] >= 3 ? 0.4 : 0.8;
}

/** How much better off a trade leaves `me`: getting `get` for `give`. */
function gain(hand: Cards, give: Partial<Cards>, get: Partial<Cards>, g: Goal): number {
  let h = { ...hand };
  let n = 0;
  for (const r of CARDS)
    for (let k = 0; k < (give[r] ?? 0); k++) {
      h = { ...h, [r]: h[r] - 1 };
      n -= worth(h, r, g);
    }
  for (const r of CARDS)
    for (let k = 0; k < (get[r] ?? 0); k++) {
      n += worth(h, r, g);
      h = { ...h, [r]: h[r] + 1 };
    }
  return n;
}

/** Off its turn: say yes or no to each open offer made to it, once each. */
function answer(L: Layout, t: T, hand: Cards, me: string): CatanAction | null {
  if (t.paired || t.turn === me) return null;
  const o = t.offers.find(
    (x) => x.from === t.turn && (x.to === null || x.to === me) && !x.replies[me],
  );
  if (!o) return null;
  const g = goal(L, t, me, hand);
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

// ---------- The turn ----------

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
  const slip = () => botSlips(level, rng, 1);

  const offer = goodProposal(t, hand, me, g);
  if (offer) return { type: 'accept', offer: offer.id, with: offer.from };

  // Its own offer to the table: close it with a yes, take it back, or wait for answers.
  const mine = t.offers.find((o) => o.from === me);
  if (mine) return settleOffer(t, hand, me, mine, now);

  if (t.ck) {
    const chase = chaseMove(L, t, me);
    if (chase && !slip()) return chase;
    const card = progressMove(L, t, v, me, g, pick);
    if (card && !slip()) return card;
    // The barbarians are close: knights before anything else.
    if (t.ck.ship >= 4 && !slip()) {
      const guard = defend(L, t, me, hand, defenceTarget(t), pick);
      if (guard) return guard;
    }
  } else {
    const card = devToPlay(L, t, v, me, g);
    if (card) return card;
  }

  if (canAfford(hand, COSTS.city) && left.city > 0) {
    const at = pick(citySpotsOf(t, me), (c) => yieldOf(L, t, c));
    if (at) return build('city', at);
  }
  const sites = left.settlement > 0 ? settleSpotsOf(t, me, false) : [];
  if (canAfford(hand, COSTS.settlement) && sites.length)
    return build(
      'settlement',
      pick(sites, (c) => cornerScore(L, t, me, c))!,
    );

  if (t.ck) {
    const up = trackOptions(t, me).find((o) => hand[o.good] >= o.cost);
    if (up) return { type: 'improve', track: up.track };
  }

  // Roads and ships when there's nowhere to settle yet (or to spend a big hand before a 7 takes it).
  const limit = limitOf(t, me);
  const plan = expandPlan(L, t, me).filter((s) =>
    s.kind === 'road' ? canAfford(hand, COSTS.road) : canAfford(hand, SHIP_COST),
  );
  if (plan.length) {
    // A ship that points at a far island is worth building even while land sites remain.
    const far = plan.some((s) => s.kind === 'ship' && s.score >= 8);
    const reach = left.settlement > 0 && (!sites.length || far);
    const flush = countCards(hand) > limit && g !== 'settlement';
    const worthIt = plan.filter((s) => s.kind === 'road' || s.score > 0 || flush);
    const at = reach || flush ? pick(worthIt, (s) => s.score) : null;
    if (at) return build(at.kind, at.at);
  }

  if (t.ck) {
    // Cities & Knights spends the rest on its defense, walls and promotions.
    const spare = countCards(hand) > limit - 2;
    if (!slip()) {
      const target = defenceTarget(t) + (spare ? 2 : 0);
      const guard = defend(L, t, me, hand, target, pick);
      if (guard) return guard;
    }
    if (spare && hand.brick >= 2 && left.city < 4) {
      const wall = wallMove(L, t, me);
      if (wall) return wall;
    }
  } else if (
    canAfford(hand, COSTS.dev) &&
    t.deckLeft > 0 &&
    (g === 'dev' || g === 'road' || g === null || countCards(hand) > limit)
  )
    return { type: 'buy' };

  if (t.sea && !slip()) {
    const sail = sailMove(L, t, me);
    if (sail) return sail;
  }

  const ask = tradeOffer(t, hand, g);
  if (ask && !botSlips(level, rng, 2)) return ask;
  const swap = bankTrade(t, hand, me, g);
  if (swap) return swap;
  return { type: 'endTurn' };
}

/** A wall for a city: only where it is free of one and we have the bricks. */
function wallMove(L: Layout, t: T, me: string): CatanAction | null {
  const built = t.ck!.walls.filter((c) => t.buildings[c]?.owner === me).length;
  if (built >= WALLS_EACH) return null;
  const at = bestBy(wallSpotsOf(t, me), (c) => yieldOf(L, t, c));
  return at ? build('wall', at) : null;
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
  const need = costOf(g);
  const short = missing(hand, need);
  if (countCards(short) < 1 || countCards(short) > 2) return null;
  const want = RESOURCES.find((r) => (short[r] ?? 0) > 0);
  if (!want) return null;
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
    expandPlan(L, t, me).length > 0 &&
    (g === 'road' || g === 'settlement' || g === 'ship')
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
function bankTrade(t: T, hand: Cards, me: string, g: Goal): CatanAction | null {
  if (!g) return null;
  const need = costOf(g);
  const keep = reserve(t, me);
  const short = missing(hand, need);
  const get = RESOURCES.filter((r) => (short[r] ?? 0) > 0 && t.bank[r] > 0).sort(
    (a, b) => (short[b] ?? 0) - (short[a] ?? 0),
  )[0];
  if (!get) return null;
  const cards: readonly Card[] = t.ck ? CARDS : RESOURCES;
  const spare = (r: Card) => hand[r] - (need[r] ?? 0) - (keep[r] ?? 0);
  const give = bestBy(
    cards.filter((r) => r !== get && spare(r) >= rateFor(t, me, r)),
    (r) => spare(r) - rateFor(t, me, r) + (isCommodity(r) ? 0.5 : 0),
  );
  return give ? { type: 'bank', give, get, n: 1 } : null;
}
