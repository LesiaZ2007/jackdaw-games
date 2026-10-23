import { createRng } from '@jackdaw/engine';
import { roadSpots, settlementSpots } from './build';
import { layout } from './geometry';
import { catan, type CatanAction, type CatanOptions, type CatanState } from './rules';
import { RESOURCES, emptyCards, type Cards, type DevCard } from './types';

/** Helpers for the rules tests: start a game, act, play the opening, fix the dice. */

export function start(players: string[], o: Partial<CatanOptions> = {}, seed = 1): CatanState {
  return catan.setup({
    playerIds: players,
    options: { ...catan.defaultOptions(players.length), ...o },
    rng: createRng(seed),
    now: 0,
  });
}

export const act = (s: CatanState, pid: string, a: CatanAction, seed = 1, now = 0) =>
  catan.applyAction(s, pid, a, createRng(seed), now);

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

/** After the opening, with every card back in the bank, ready to roll. */
export function ready(players = ['a', 'b', 'c'], seed = 1): CatanState {
  const s = playSetup(start(players, {}, seed));
  const bank = { ...s.bank };
  for (const p of s.seats) for (const r of RESOURCES) bank[r] += s.hands[p]![r];
  return { ...s, hands: Object.fromEntries(s.seats.map((p) => [p, emptyCards()])), bank };
}

/** Rolled (not a 7) and in the main phase, with these hands. */
export function main(
  hands: Record<string, Partial<Cards>> = {},
  players = ['a', 'b', 'c'],
): CatanState {
  const s0 = ready(players);
  const s = act(s0, s0.turn, { type: 'roll' }, seedFor(6));
  return { ...s, hands: Object.fromEntries(s.seats.map((p) => [p, hand(hands[p] ?? {})])) };
}

export const withDev = (s: CatanState, pid: string, cards: DevCard[], bought = 0): CatanState => ({
  ...s,
  dev: { ...s.dev, [pid]: cards.map((card) => ({ card, bought })) },
});
