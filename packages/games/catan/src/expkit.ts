import { createRng } from '@jackdaw/engine';
import { EVENT_FACES, type EventFace } from './ck';
import type { Layout } from './geometry';
import type { CatanOptions, CatanState } from './rules';
import { hand, playSetup, start } from './testkit';
import { CARDS, emptyCards, type Cards } from './types';

/** Helpers for the Seafarers and Cities & Knights tests. */

export const CK_NAME = 'Cities & Knights' as const;
export const SEA_NAME = 'Seafarers' as const;
export const BOTH_NAME = 'Seafarers + Cities & Knights' as const;

/** After the opening of an expansion game, ready to roll. */
export const expansion = (
  name: CatanOptions['expansion'],
  players = ['a', 'b', 'c'],
  seed = 1,
  o: Partial<CatanOptions> = {},
): CatanState => playSetup(start(players, { expansion: name, ...o }, seed));

/** Every card back in the bank, every hand empty. */
export function blank(s: CatanState): CatanState {
  const bank = { ...s.bank };
  for (const p of s.seats) for (const r of CARDS) bank[r] += s.hands[p]![r];
  return { ...s, hands: Object.fromEntries(s.seats.map((p) => [p, emptyCards()])), bank };
}

/** The player on their turn has rolled; nobody holds anything but `hands`. */
export function inMain(s: CatanState, hands: Record<string, Partial<Cards>> = {}): CatanState {
  const b = blank(s);
  return {
    ...b,
    phase: 'main',
    dice: [3, 4],
    rollSeq: Math.max(1, b.rollSeq),
    hands: Object.fromEntries(b.seats.map((p) => [p, hand(hands[p] ?? {})])),
  };
}

/** A seed whose first two dice and event die satisfy `want` (Cities & Knights rolls). */
export function seedWhere(want: (red: number, white: number, face: EventFace) => boolean): number {
  for (let seed = 1; seed < 100_000; seed++) {
    const r = createRng(seed);
    const red = r.int(6) + 1;
    const white = r.int(6) + 1;
    if (want(red, white, EVENT_FACES[r.int(6)]!)) return seed;
  }
  throw new Error('no such seed');
}

/** The edge joining two corners. */
export const edgeOf = (L: Layout, a: string, b: string): string =>
  L.corners[a]!.edges.find((e) => L.edges[e]!.a === b || L.edges[e]!.b === b)!;

/** A trail of `n` edges through distinct corners, every edge passing `ok`: its corners in order. */
export function trail(
  L: Layout,
  n: number,
  ok: (edge: string) => boolean = () => true,
  from: (corner: string) => boolean = () => true,
): string[] {
  const walk = (path: string[]): string[] | null => {
    if (path.length === n + 1) return path;
    const here = path[path.length - 1]!;
    for (const e of L.corners[here]!.edges) {
      if (!ok(e)) continue;
      const { a, b } = L.edges[e]!;
      const next = a === here ? b : a;
      if (path.includes(next)) continue;
      const found = walk([...path, next]);
      if (found) return found;
    }
    return null;
  };
  for (const c of L.cornerIds.filter(from)) {
    const found = walk([c]);
    if (found) return found;
  }
  throw new Error('no trail');
}
