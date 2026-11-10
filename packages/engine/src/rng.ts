/**
 * Seeded, serializable random number generators.
 *
 * Game rules never call Math.random: the room creates an Rng from a stored state, passes it to
 * setup/applyAction, then stores `rng.state` again. Same state + same input = same output.
 *
 * Two generators share the `Rng` interface:
 *  - A numeric seed or state (32 bits) runs mulberry32. Hundreds of tests pin sequences made from
 *    numeric seeds, so that sequence never changes.
 *  - A string seed or state (32 hex characters, 128 bits) runs sfc32. The room seeds every real
 *    game with one, because a 32-bit seed can be brute-forced from a few observed cards or dice.
 *    Lobbies saved with a numeric state keep running mulberry32 until their game ends.
 */
export type RngState = number | string;

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** A random element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state; `createRng(rng.state)` continues the same sequence. */
  readonly state: RngState;
}

const SEED_HEX = /^[0-9a-f]{32}$/i;

function words(hex: string): [number, number, number, number] {
  return [0, 8, 16, 24].map((i) => parseInt(hex.slice(i, i + 8), 16) >>> 0) as [
    number,
    number,
    number,
    number,
  ];
}

function hex(ws: readonly number[]): string {
  return ws.map((w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
}

/** A float source and a way to read its state back, for one of the two generators. */
function source(seed: RngState): { next: () => number; state: () => RngState } {
  if (typeof seed === 'string') {
    if (!SEED_HEX.test(seed)) throw new RangeError('A string seed is 32 hex characters');
    let [a, b, c, d] = words(seed);
    // sfc32 must not start all zero.
    if ((a | b | c | d) === 0) d = 1;
    return {
      next: () => {
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
      },
      state: () => hex([a, b, c, d]),
    };
  }
  let s = seed >>> 0;
  return {
    next: () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => s,
  };
}

export function createRng(seed: RngState): Rng {
  const { next, state } = source(seed);
  const int = (maxExclusive: number) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };
  return {
    next,
    int,
    pick(items) {
      if (items.length === 0) throw new RangeError('pick() from an empty array');
      return items[int(items.length)]!;
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    get state() {
      return state();
    },
  };
}

/**
 * A seed derived from `state` and a counter, without touching `state`: for reads that need a
 * stable pseudo-random number (bot pacing) while the session's own sequence stays put.
 */
export function mixSeed(state: RngState, counter: number): RngState {
  const k = Math.imul(counter, 0x9e3779b1);
  if (typeof state === 'number') return (state ^ k) >>> 0;
  if (!SEED_HEX.test(state)) return state;
  const [a, b, c, d] = words(state);
  return hex([a ^ k, b, c, d]);
}

/** A fresh unpredictable 128-bit seed for a new session (server only; not used inside rules). */
export function randomSeed(): string {
  return hex(Array.from(crypto.getRandomValues(new Uint32Array(4))));
}
