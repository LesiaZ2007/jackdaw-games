import type { Rng } from '@jackdaw/engine';
import { pips } from './board';
import {
  COSTS,
  bankRatio,
  canAfford,
  citySpots,
  harboursOf,
  piecesLeft,
  roadSpots,
  settlementSpots,
} from './build';
import {
  actor,
  applyMove,
  canPlay,
  layoutOf,
  robberTiles,
  victimsAt,
  waitingOn,
  type CatanAction,
  type CatanState,
} from './rules';
import { RESOURCES, countCards, type Cards, type Resource } from './types';

/**
 * Moves a player could make now: used to play random games in tests, and to finish a step for a
 * player whose time ran out. Not every move, but always at least one for whoever the game waits
 * on, best-looking first (building before trading before ending the turn).
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
        ? roadSpots(L, s.buildings, s.roads, pid, s.setup!.corner).map((at) => build('road', at))
        : best(settlementSpots(L, s.buildings, s.roads, pid, true))
            .slice(0, 3)
            .map((at) => build('settlement', at));
    case 'roll':
      return [
        { type: 'roll' },
        ...playable(s, pid).filter((m) => m.type === 'play' && m.card === 'knight'),
      ];
    case 'discard':
      return [{ type: 'discard', cards: largest(s.hands[pid]!, s.discards[pid]!) }];
    case 'robber':
      return robberMoves(s, pid);
    case 'roadBuilding':
      return [
        ...roadSpots(L, s.buildings, s.roads, pid)
          .slice(0, 3)
          .map((at) => build('road', at)),
        { type: 'endRoads' },
      ];
    case 'main':
      return mainMoves(s, pid);
  }
}

const build = (kind: 'road' | 'settlement' | 'city', at: string): CatanAction => ({
  type: 'build',
  kind,
  at,
});

/** `n` cards taken from the biggest piles. */
function largest(hand: Cards, n: number): Partial<Cards> {
  const left = { ...hand };
  const out: Partial<Cards> = {};
  for (let k = 0; k < n; k++) {
    const r = RESOURCES.reduce((a, b) => (left[b] > left[a] ? b : a));
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
  return moves.slice(0, 4);
}

function playable(s: CatanState, pid: string): CatanAction[] {
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

function mainMoves(s: CatanState, pid: string): CatanAction[] {
  const L = layoutOf(s);
  const hand = s.hands[pid]!;
  const left = piecesLeft(s.buildings, s.roads, pid);
  const moves: CatanAction[] = [];
  const cities = canAfford(hand, COSTS.city) && left.city > 0 ? citySpots(s.buildings, pid) : [];
  const settles = left.settlement > 0 ? settlementSpots(L, s.buildings, s.roads, pid, false) : [];
  const roads =
    canAfford(hand, COSTS.road) && left.road > 0 ? roadSpots(L, s.buildings, s.roads, pid) : [];
  moves.push(...cities.slice(0, 2).map((at) => build('city', at)));
  if (canAfford(hand, COSTS.settlement))
    moves.push(...settles.slice(0, 2).map((at) => build('settlement', at)));
  if (!settles.length) moves.push(...roads.slice(0, 2).map((at) => build('road', at)));
  if (canAfford(hand, COSTS.dev) && s.deck.length) moves.push({ type: 'buy' });
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
  const kinds = harboursOf(L, s.board, s.buildings, pid);
  const give = RESOURCES.find((r) => hand[r] >= bankRatio(kinds, r) + 1);
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

const covers = (hand: Cards, c: Partial<Cards>) => RESOURCES.every((r) => hand[r] >= (c[r] ?? 0));

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
  const L = layoutOf(s);
  const who = actor(s);
  switch (s.phase) {
    case 'setup': {
      let next = s;
      if (!s.setup!.corner)
        next = applyMove(
          next,
          who,
          build('settlement', rng.pick(settlementSpots(L, s.buildings, s.roads, who, true))),
          rng,
        );
      return applyMove(
        next,
        who,
        build('road', rng.pick(roadSpots(L, next.buildings, next.roads, who, next.setup!.corner!))),
        rng,
      );
    }
    case 'roll':
      return applyMove(s, who, { type: 'roll' }, rng);
    case 'discard':
      return Object.keys(s.discards).reduce((next, p) => {
        const pool = RESOURCES.flatMap((r) => Array<Resource>(next.hands[p]![r]).fill(r));
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
