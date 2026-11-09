import type { Rng } from '@jackdaw/engine';
import { pips } from './board';
import { COSTS, canAfford, piecesLeft } from './build';
import {
  CK_COSTS,
  TRACKS,
  TRACK_GOOD,
  WALLS_EACH,
  canAct,
  canPlayProgress,
  knightsLeft,
  wallsOf,
  type Progress,
} from './ck';
import {
  actor,
  applyMove,
  canPlay,
  layoutOf,
  points,
  rateFor,
  robberTiles,
  victimsAt,
  waitingOn,
  type CatanAction,
  type CatanState,
} from './rules';
import { SHIP_COST, pirateSpots, sailMoves, shipOwnersAt, shipsLeft } from './sea';
import {
  citySpotsOf,
  knightSpotsOf,
  roadSpotsOf,
  settleSpotsOf,
  shipSpotsOf,
  wallSpotsOf,
} from './spots';
import { CARDS, RESOURCES, YIELD, countCards, type Card, type Cards, type Resource } from './types';

/**
 * Moves a player could make now: used to play random games in tests, and to finish a step for a
 * player whose time ran out. Not every move, but always at least one for whoever the game waits
 * on, best-looking first (building before trading before ending the turn). With the expansions
 * (2026-11-08: "add the option to select the expansion pack") it also offers a sample of ships,
 * sailing, the pirate, knights, city improvements, walls and progress cards.
 */
export function legalMoves(s: CatanState, pid: string): CatanAction[] {
  if (s.phase === 'over' || !s.seats.includes(pid)) return [];
  if (!waitingOn(s).includes(pid)) return responses(s, pid);
  const L = layoutOf(s);
  const score = (corner: string) =>
    L.corners[corner]!.tiles.reduce(
      (n, t) => n + (s.board.tiles[t]!.number ? pips(s.board.tiles[t]!.number!) : 0),
      0,
    );
  const best = (corners: string[]) => [...corners].sort((a, b) => score(b) - score(a));
  switch (s.phase) {
    case 'setup':
      return s.setup!.corner
        ? [
            ...roadSpotsOf(s, pid, s.setup!.corner).map((at) => build('road', at)),
            ...shipSpotsOf(s, pid, s.setup!.corner).map((at) => build('ship', at)),
          ]
        : best(settleSpotsOf(s, pid, true))
            .slice(0, 3)
            .map((at) => build(openingKind(s), at));
    case 'pick':
      return [pickFor(s, pid)];
    case 'roll':
      return [
        { type: 'roll' },
        ...playable(s, pid).filter((m) => m.type === 'play' && m.card === 'knight'),
        ...(s.ck?.hands[pid]?.includes('alchemist') && canPlayProgress(s, pid, 'alchemist')
          ? [{ type: 'progress', card: 'alchemist', dice: [1, 5] } satisfies CatanAction]
          : []),
      ];
    case 'discard':
      return [{ type: 'discard', cards: largest(s.hands[pid]!, s.discards[pid]!) }];
    case 'robber':
      return robberMoves(s, pid);
    case 'roadBuilding':
      // Only pieces still in the supply: with the roads gone, a free build may still be a ship.
      return [
        ...(piecesLeft(s.buildings, s.roads, pid).road > 0 ? roadSpotsOf(s, pid) : [])
          .slice(0, 3)
          .map((at) => build('road', at)),
        ...(s.sea && shipsLeft(s.sea, pid) > 0 ? shipSpotsOf(s, pid) : [])
          .slice(0, 2)
          .map((at) => build('ship', at)),
        { type: 'endRoads' },
      ];
    case 'main':
      return mainMoves(s, pid);
  }
}

/** The opening piece: a settlement, or (Cities & Knights) a city the second time round. */
export const openingKind = (s: CatanState): 'settlement' | 'city' =>
  s.ck && s.setup && s.setup.step >= s.setup.order.length / 2 ? 'city' : 'settlement';

/** A fair choice for what `pid` owes: the resource they hold least of, or the fullest deck. */
export function pickFor(s: CatanState, pid: string): CatanAction {
  const owed = s.owed?.[pid]?.[0];
  if (owed === 'progress') {
    const decks = s.ck!.decks;
    const track = TRACKS.reduce((a, b) => (decks[b].length > decks[a].length ? b : a));
    return { type: 'pick', track };
  }
  const hand = s.hands[pid]!;
  const stocked = RESOURCES.filter((r) => s.bank[r] > 0);
  const resource = (stocked.length ? stocked : RESOURCES).reduce((a, b) =>
    hand[b] < hand[a] ? b : a,
  );
  return { type: 'pick', resource };
}

const build = (
  kind: 'road' | 'settlement' | 'city' | 'ship' | 'wall' | 'knight',
  at: string,
): CatanAction => ({
  type: 'build',
  kind,
  at,
});

/** `n` cards taken from the biggest piles (commodities too). */
function largest(hand: Cards, n: number): Partial<Cards> {
  const left = { ...hand };
  const out: Partial<Cards> = {};
  for (let k = 0; k < n; k++) {
    const r = CARDS.reduce((a, b) => (left[b] > left[a] ? b : a));
    left[r]--;
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

function robberMoves(s: CatanState, pid: string): CatanAction[] {
  const moves: CatanAction[] = [];
  for (const tile of robberTiles(s, pid)) {
    const rich = victimsAt(s, tile, pid).filter((p) => countCards(s.hands[p]!) > 0);
    if (rich.length) for (const victim of rich) moves.unshift({ type: 'robber', tile, victim });
    else moves.push({ type: 'robber', tile, victim: null });
  }
  const out = moves.slice(0, 4);
  if (s.sea) {
    const L = layoutOf(s);
    const ships: CatanAction[] = [];
    for (const tile of pirateSpots(s.board, s.sea.pirate)) {
      const rich = shipOwnersAt(L, s.sea.ships, tile, pid).filter(
        (p) => countCards(s.hands[p]!) > 0,
      );
      if (rich.length) ships.unshift({ type: 'pirate', tile, victim: rich[0]! });
      else ships.push({ type: 'pirate', tile, victim: null });
    }
    out.push(...ships.slice(0, 3));
  }
  return out;
}

function playable(s: CatanState, pid: string): CatanAction[] {
  if (s.ck) return [];
  const seen = new Set<string>();
  const out: CatanAction[] = [];
  for (const d of s.dev[pid]!) {
    if (!canPlay(s, pid, d) || seen.has(d.card)) continue;
    seen.add(d.card);
    const hand = s.hands[pid]!;
    const scarce = [...RESOURCES].sort((a, b) => hand[a] - hand[b]);
    if (d.card === 'knight') out.push({ type: 'play', card: 'knight' });
    if (d.card === 'roadBuilding') out.push({ type: 'play', card: 'roadBuilding' });
    if (d.card === 'yearOfPlenty')
      out.push({ type: 'play', card: 'yearOfPlenty', take: [scarce[0]!, scarce[1]!] });
    if (d.card === 'monopoly') out.push({ type: 'play', card: 'monopoly', resource: scarce[0]! });
  }
  return out;
}

/** Cities & Knights moves for the main phase: improvements, knights, walls, chasing, cards. */
function ckMoves(s: CatanState, pid: string): CatanAction[] {
  const ck = s.ck!;
  const L = layoutOf(s);
  const hand = s.hands[pid]!;
  const moves: CatanAction[] = [];
  const cities = Object.values(s.buildings).some((b) => b.owner === pid && b.city);
  if (cities)
    for (const track of TRACKS) {
      const lvl = ck.levels[pid]![track];
      const cost = Math.max(0, lvl + 1 - (ck.crane ? 1 : 0));
      if (lvl < 5 && hand[TRACK_GOOD[track]] >= cost) moves.push({ type: 'improve', track });
    }
  const mine = Object.entries(ck.knights).filter(([, k]) => k.owner === pid);
  for (const [at, k] of mine) {
    if (!k.active && hand.grain >= CK_COSTS.activate.grain) moves.push({ type: 'activate', at });
    const to = k.level + 1;
    if (
      k.level < 3 &&
      k.promoted !== s.turnSeq &&
      (ck.smith > 0 || canAfford(hand, CK_COSTS.promote)) &&
      knightsLeft(ck, pid)[to as 2 | 3] > 0 &&
      (to < 3 || ck.levels[pid]!.politics >= 3)
    )
      moves.push({ type: 'promote', at });
    if (
      !s.paired &&
      ck.attacks > 0 &&
      canAct(k, s.turnSeq) &&
      L.tiles[s.robber]!.corners.includes(at)
    )
      moves.push({ type: 'chase', from: at });
  }
  if (canAfford(hand, CK_COSTS.knight) && knightsLeft(ck, pid)[1] > 0)
    for (const at of knightSpotsOf(s, pid).slice(0, 2)) moves.push(build('knight', at));
  if (canAfford(hand, CK_COSTS.wall) && wallsOf(s, ck.walls, pid) < WALLS_EACH)
    for (const at of wallSpotsOf(s, pid).slice(0, 1)) moves.push(build('wall', at));
  moves.push(...progressMoves(s, pid));
  return moves;
}

/** A few progress cards with parameters the rules accept. */
function progressMoves(s: CatanState, pid: string): CatanAction[] {
  const ck = s.ck!;
  const L = layoutOf(s);
  const hand = s.hands[pid]!;
  const rivals = s.seats.filter((p) => p !== pid);
  const out: CatanAction[] = [];
  const play = (card: Progress, extra: Record<string, unknown> = {}) =>
    out.push({ type: 'progress', card, ...extra } as CatanAction);
  const pts = (p: string) => points(s, p, false);
  const seen = new Set<Progress>();
  for (const card of ck.hands[pid]!) {
    if (seen.has(card) || !canPlayProgress(s, pid, card)) continue;
    seen.add(card);
    switch (card) {
      case 'irrigation':
      case 'mining':
      case 'warlord':
      case 'smith':
      case 'crane':
      case 'saboteur':
      case 'wedding':
      case 'roadBuilding':
        play(card);
        break;
      case 'merchantFleet':
        play(card, { resource: CARDS.reduce((a, b) => (hand[b] > hand[a] ? b : a)) });
        break;
      case 'resourceMonopoly':
        play(card, { resource: RESOURCES.reduce((a, b) => (hand[b] < hand[a] ? b : a)) });
        break;
      case 'tradeMonopoly':
        play(card, { resource: 'coin' });
        break;
      case 'commercialHarbor': {
        const r = RESOURCES.find((x) => hand[x] > 0);
        if (r) play(card, { resource: r });
        break;
      }
      case 'engineer': {
        const at = wallSpotsOf(s, pid)[0];
        if (at && wallsOf(s, ck.walls, pid) < WALLS_EACH) play(card, { at });
        break;
      }
      case 'medicine': {
        const at = citySpotsOf(s, pid)[0];
        const cities = Object.values(s.buildings).filter((b) => b.owner === pid && b.city).length;
        if (at && cities < 4 && canAfford(hand, CK_COSTS.medicine)) play(card, { at });
        break;
      }
      case 'merchant': {
        const tile = L.cornerIds
          .filter((c) => s.buildings[c]?.owner === pid)
          .flatMap((c) => L.corners[c]!.tiles)
          .find((i) => YIELD[s.board.tiles[i]!.terrain]);
        if (tile !== undefined) play(card, { tile });
        break;
      }
      case 'bishop': {
        const tile = s.board.tiles.findIndex((t, i) => i !== s.robber && YIELD[t.terrain] !== null);
        if (ck.attacks > 0 && tile >= 0) play(card, { tile });
        break;
      }
      case 'masterMerchant': {
        const victim = rivals.find((p) => pts(p) > pts(pid));
        if (victim) play(card, { victim });
        break;
      }
      case 'spy': {
        const victim = rivals.find((p) => ck.hands[p]!.length > 0);
        if (victim) play(card, { victim });
        break;
      }
      case 'deserter': {
        const victim = rivals.find((p) => Object.values(ck.knights).some((k) => k.owner === p));
        if (victim) play(card, { victim });
        break;
      }
      case 'inventor': {
        const ok = s.board.tiles.flatMap((t, i) =>
          t.number !== null && ![2, 12, 6, 8].includes(t.number) ? [i] : [],
        );
        const a = ok[0];
        const b = ok.find((i) => s.board.tiles[i]!.number !== s.board.tiles[a!]!.number);
        if (a !== undefined && b !== undefined) play(card, { tiles: [a, b] });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** Seafarers moves for the main phase: ships and sailing. */
function seaMoves(s: CatanState, pid: string): CatanAction[] {
  const sea = s.sea!;
  const hand = s.hands[pid]!;
  const moves: CatanAction[] = [];
  if (canAfford(hand, SHIP_COST) && shipsLeft(sea, pid) > 0)
    moves.push(
      ...shipSpotsOf(s, pid)
        .slice(0, 2)
        .map((at) => build('ship', at)),
    );
  if (!s.paired) {
    const sail = sailMoves(layoutOf(s), s, pid);
    for (const [from, tos] of Object.entries(sail).slice(0, 2))
      moves.push({ type: 'sail', from, to: tos[0]! });
  }
  return moves;
}

function mainMoves(s: CatanState, pid: string): CatanAction[] {
  const hand = s.hands[pid]!;
  const left = piecesLeft(s.buildings, s.roads, pid);
  const moves: CatanAction[] = [];
  const cities = canAfford(hand, COSTS.city) && left.city > 0 ? citySpotsOf(s, pid) : [];
  const settles = left.settlement > 0 ? settleSpotsOf(s, pid, false) : [];
  const roads = canAfford(hand, COSTS.road) && left.road > 0 ? roadSpotsOf(s, pid) : [];
  moves.push(...cities.slice(0, 2).map((at) => build('city', at)));
  if (canAfford(hand, COSTS.settlement))
    moves.push(...settles.slice(0, 2).map((at) => build('settlement', at)));
  if (s.ck) moves.push(...ckMoves(s, pid));
  if (s.sea) moves.push(...seaMoves(s, pid));
  if (!settles.length) moves.push(...roads.slice(0, 2).map((at) => build('road', at)));
  if (!s.ck && canAfford(hand, COSTS.dev) && s.deck.length) moves.push({ type: 'buy' });
  moves.push(...playable(s, pid));
  if (!s.paired) {
    for (const o of s.offers) {
      if (o.from === pid && covers(hand, o.give))
        for (const [p, reply] of Object.entries(o.replies))
          if (reply === 'accept' && covers(s.hands[p]!, o.want))
            moves.push({ type: 'accept', offer: o.id, with: p });
      if (o.to === pid && covers(hand, o.want) && covers(s.hands[o.from]!, o.give))
        moves.push({ type: 'accept', offer: o.id, with: o.from });
    }
  }
  const give = RESOURCES.find((r) => hand[r] >= rateFor(s, pid, r) + 1);
  if (give) {
    const get = RESOURCES.filter((r) => r !== give && s.bank[r] > 0).sort(
      (a, b) => hand[a] - hand[b],
    )[0];
    if (get) moves.push({ type: 'bank', give, get, n: 1 });
  }
  const swap = trade(hand);
  if (!s.paired && swap && !s.offers.some((o) => o.from === pid))
    moves.push({ type: 'offer', give: { [swap[0]]: 1 }, want: { [swap[1]]: 1 }, to: null });
  if (settles.length) moves.push(...roads.slice(0, 1).map((at) => build('road', at)));
  moves.push({ type: 'endTurn' });
  return moves;
}

const covers = (hand: Cards, c: Partial<Cards>) => CARDS.every((r) => hand[r] >= (c[r] ?? 0));

/** One of what you have most of, for one of what you have least of. */
function trade(hand: Cards): [Resource, Resource] | null {
  const most = RESOURCES.reduce((a, b) => (hand[b] > hand[a] ? b : a));
  const least = RESOURCES.reduce((a, b) => (hand[b] < hand[a] ? b : a));
  return hand[most] > 0 && most !== least ? [most, least] : null;
}

/** What a player off their turn can do with trades: answer offers to them, or propose one. */
function responses(s: CatanState, pid: string): CatanAction[] {
  if (s.phase !== 'main' || s.paired || pid === s.turn) return [];
  const hand = s.hands[pid]!;
  const moves: CatanAction[] = [];
  for (const o of s.offers)
    if (o.from === s.turn && (o.to === null || o.to === pid) && !o.replies[pid])
      moves.push({
        type: 'answer',
        offer: o.id,
        reply: covers(hand, o.want) ? 'accept' : 'decline',
      });
  const swap = trade(hand);
  if (swap && !s.offers.some((o) => o.from === pid))
    moves.push({ type: 'propose', give: { [swap[0]]: 1 }, want: { [swap[1]]: 1 } });
  return moves;
}

/**
 * Out of time: the server finishes the step. A random opening piece (settlement and road), the
 * roll, random discards for everyone still owing, a random robber move, or the end of the turn
 * (ending road building first).
 */
export function timeUp(s: CatanState, rng: Rng): CatanState {
  const who = actor(s);
  switch (s.phase) {
    case 'setup': {
      let next = s;
      if (!s.setup!.corner)
        next = applyMove(
          next,
          who,
          build(openingKind(s), rng.pick(settleSpotsOf(s, who, true))),
          rng,
        );
      const corner = next.setup!.corner!;
      const roads = roadSpotsOf(next, who, corner);
      return roads.length
        ? applyMove(next, who, build('road', rng.pick(roads)), rng)
        : applyMove(next, who, build('ship', rng.pick(shipSpotsOf(next, who, corner))), rng);
    }
    case 'pick':
      return Object.keys(s.owed ?? {}).reduce((next, p) => {
        let out = next;
        while (out.phase === 'pick' && out.owed?.[p]?.length)
          out = applyMove(out, p, pickFor(out, p), rng);
        return out;
      }, s);
    case 'roll':
      return applyMove(s, who, { type: 'roll' }, rng);
    case 'discard':
      return Object.keys(s.discards).reduce((next, p) => {
        const pool = CARDS.flatMap((r) => Array<Card>(next.hands[p]![r]).fill(r));
        const cards: Partial<Cards> = {};
        for (const r of rng.shuffle(pool).slice(0, next.discards[p]!))
          cards[r] = (cards[r] ?? 0) + 1;
        return applyMove(next, p, { type: 'discard', cards }, rng);
      }, s);
    case 'robber': {
      const by = s.robberBy!;
      const tile = rng.pick(robberTiles(s, by));
      const rich = victimsAt(s, tile, by).filter((p) => countCards(s.hands[p]!) > 0);
      return applyMove(
        s,
        by,
        { type: 'robber', tile, victim: rich.length ? rng.pick(rich) : null },
        rng,
      );
    }
    case 'roadBuilding':
      return applyMove(applyMove(s, who, { type: 'endRoads' }, rng), who, { type: 'endTurn' }, rng);
    case 'main':
      return applyMove(s, who, { type: 'endTurn' }, rng);
    case 'over':
      return s;
  }
}
