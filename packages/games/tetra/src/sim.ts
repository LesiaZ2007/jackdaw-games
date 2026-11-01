import { createRng } from '@jackdaw/engine';

/**
 * The falling-stone mechanics, pure and shared: phones run them sixty times a second for their own
 * well, bots run them on the server, and the rules only read what they report. A well is ten wide
 * and twenty deep, with two rows over the wall where stones appear. Rows are numbered from the
 * top (row 0 is the highest), and a well travels as one string of W×H cells.
 *
 * The stones are the seven shapes of four squares. They turn by the usual modern rotation system
 * (with wall kicks), come in shuffled sets of seven, and one can be held back. Clearing lines
 * throws rubble at the others: more for four lines at once, a twist (a T turned into a slot),
 * clears back to back, a chain of clears, or emptying the well. Rubble you're owed is cancelled
 * by what you clear first, and the rest rises from the floor after you next place a stone without
 * clearing.
 */

export const W = 10;
/** Two rows over the wall, then twenty in the well. */
export const H = 22;
export const HIDDEN = 2;

export const KINDS = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'] as const;
export type Kind = (typeof KINDS)[number];
/** '.' is empty, a kind is a placed stone of that shape, 'G' is rubble. */
export type Cell = '.' | Kind | 'G';
export type Rot = 0 | 1 | 2 | 3;
export type Spin = 'none' | 'mini' | 'full';

export interface Piece {
  kind: Kind;
  rot: Rot;
  /** Top-left of the piece's box, in cells. */
  x: number;
  y: number;
}

export const EMPTY_WELL = '.'.repeat(W * H);

/** Each shape in its spawn orientation, inside an n×n box. */
const SHAPES: Record<Kind, { n: number; cells: [number, number][] }> = {
  I: {
    n: 4,
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 1],
    ],
  },
  J: {
    n: 3,
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  L: {
    n: 3,
    cells: [
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  O: {
    n: 2,
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ],
  },
  S: {
    n: 3,
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
  },
  T: {
    n: 3,
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  Z: {
    n: 3,
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
  },
};

const ROTATED = new Map<string, [number, number][]>();

/** The cells a shape covers in its box, turned `rot` quarter turns clockwise. */
export function cellsOf(kind: Kind, rot: Rot): [number, number][] {
  const key = kind + rot;
  let cells = ROTATED.get(key);
  if (!cells) {
    const { n, cells: base } = SHAPES[kind];
    cells = base;
    for (let r = 0; r < rot; r++) cells = cells.map(([x, y]) => [n - 1 - y, x]);
    ROTATED.set(key, cells);
  }
  return cells;
}

export function boxSize(kind: Kind): number {
  return SHAPES[kind].n;
}

/** Where a new stone appears: centred, in the rows over the wall. */
export function spawn(kind: Kind): Piece {
  return { kind, rot: 0, x: kind === 'O' ? 4 : 3, y: 0 };
}

export function cellAt(well: string, x: number, y: number): Cell {
  return well[y * W + x] as Cell;
}

/** True when the piece sits inside the well on empty cells. */
export function fits(well: string, p: Piece): boolean {
  for (const [cx, cy] of cellsOf(p.kind, p.rot)) {
    const x = p.x + cx;
    const y = p.y + cy;
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
    if (well[y * W + x] !== '.') return false;
  }
  return true;
}

export function shift(well: string, p: Piece, dx: number, dy: number): Piece | null {
  const q = { ...p, x: p.x + dx, y: p.y + dy };
  return fits(well, q) ? q : null;
}

/** As far down as the piece can fall: where it would land, and its ghost. */
export function dropped(well: string, p: Piece): Piece {
  let q = p;
  for (;;) {
    const r = shift(well, q, 0, 1);
    if (!r) return q;
    q = r;
  }
}

// Wall kicks, as (dx, dy) with y pointing DOWN (the usual tables have y up; signs are flipped).
type Kick = [number, number];
const k = (pairs: Kick[]): Kick[] => pairs.map(([x, y]) => [x, -y]);
const KICKS: Record<string, Kick[]> = {
  '01': k([
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ]),
  '10': k([
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ]),
  '12': k([
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ]),
  '21': k([
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ]),
  '23': k([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ]),
  '32': k([
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ]),
  '30': k([
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ]),
  '03': k([
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ]),
};
const I_KICKS: Record<string, Kick[]> = {
  '01': k([
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ]),
  '10': k([
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ]),
  '12': k([
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ]),
  '21': k([
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ]),
  '23': k([
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ]),
  '32': k([
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ]),
  '30': k([
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ]),
  '03': k([
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ]),
};
/** Half turns: straight, then a nudge up, sideways, or down. */
const HALF_KICKS: Kick[] = [
  [0, 0],
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
];

/**
 * The piece turned clockwise (1), anticlockwise (-1) or halfway round (2), kicked to the first
 * spot that fits, with which kick it took (0 is no kick). Null when nothing fits.
 */
export function rotate(
  well: string,
  p: Piece,
  dir: 1 | -1 | 2,
): { piece: Piece; kick: number } | null {
  if (p.kind === 'O') return { piece: p, kick: 0 };
  const to = ((((p.rot + dir) % 4) + 4) % 4) as Rot;
  const kicks = dir === 2 ? HALF_KICKS : (p.kind === 'I' ? I_KICKS : KICKS)[`${p.rot}${to}`]!;
  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i]!;
    const q: Piece = { kind: p.kind, rot: to, x: p.x + dx, y: p.y + dy };
    if (fits(well, q)) return { piece: q, kick: i };
  }
  return null;
}

/**
 * Whether a T that just turned into place is a twist: three of the four corners round its
 * centre are filled (walls count). It's a mini twist unless both corners in front of its point
 * are filled, or it took the last, farthest kick to get there.
 */
export function twist(well: string, p: Piece, lastWasTurn: boolean, kick: number): Spin {
  if (p.kind !== 'T' || !lastWasTurn) return 'none';
  const filled = (dx: number, dy: number) => {
    const x = p.x + 1 + dx;
    const y = p.y + 1 + dy;
    return x < 0 || x >= W || y >= H || (y >= 0 && well[y * W + x] !== '.');
  };
  // Corners in order: top-left, top-right, bottom-right, bottom-left.
  const corners = [filled(-1, -1), filled(1, -1), filled(1, 1), filled(-1, 1)];
  if (corners.filter(Boolean).length < 3) return 'none';
  // The two corners on the side the T points to, for each rotation.
  const front = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ][p.rot]!;
  if (corners[front[0]!] && corners[front[1]!]) return 'full';
  return kick === 4 ? 'full' : 'mini';
}

/** The well with the piece set into it. */
export function place(well: string, p: Piece): string {
  const cells = well.split('');
  for (const [cx, cy] of cellsOf(p.kind, p.rot)) cells[(p.y + cy) * W + p.x + cx] = p.kind;
  return cells.join('');
}

/** Removes full rows, dropping everything above; returns the new well and how many went. */
export function clearRows(well: string): { well: string; cleared: number } {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) rows.push(well.slice(y * W, y * W + W));
  const kept = rows.filter((r) => r.includes('.'));
  const cleared = H - kept.length;
  if (cleared === 0) return { well, cleared };
  return { well: '.'.repeat(W * cleared) + kept.join(''), cleared };
}

// ---------------------------------------------------------------------------------------------
// The sequence: shuffled sets of all seven, the same for everyone in a round.

const SEQUENCES = new Map<number, { state: number; kinds: Kind[] }>();

/** The `i`th stone (from 0) of the round with this seed. */
export function pieceAt(seed: number, i: number): Kind {
  let seq = SEQUENCES.get(seed);
  if (!seq) {
    if (SEQUENCES.size > 32) SEQUENCES.delete(SEQUENCES.keys().next().value!);
    seq = { state: seed >>> 0, kinds: [] };
    SEQUENCES.set(seed, seq);
  }
  while (seq.kinds.length <= i) {
    const rng = createRng(seq.state);
    seq.kinds.push(...rng.shuffle(KINDS));
    seq.state = rng.state;
  }
  return seq.kinds[i]!;
}

// ---------------------------------------------------------------------------------------------
// Clears, rubble and score.

/** Extra rubble for each clear in a chain: the first clear is index 0. */
export const COMBO_BONUS = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
export const PERFECT_BONUS = 10;

export interface ClearOutcome {
  lines: number;
  spin: Spin;
  /** The well is empty after this clear. */
  perfect: boolean;
  /** Rubble thrown, before cancelling what you're owed. */
  attack: number;
  /** Back-to-back chain after this clear: -1 none, 0 the first hard clear, 1+ a chain. */
  b2b: number;
  /** Clear chain after this piece: -1 none, 0 the first clear, 1+ a chain. */
  combo: number;
  /** Points, for Blitz. */
  points: number;
  /** "Quad", "T-twist double"… or null for nothing special. */
  name: string | null;
}

const LINE_ATTACK = [0, 0, 1, 2, 4];
const TWIST_ATTACK = [0, 2, 4, 6, 6];
const MINI_ATTACK = [0, 0, 1, 1, 1];
const LINE_POINTS = [0, 100, 300, 500, 800];
const TWIST_POINTS = [400, 800, 1200, 1600, 1600];
const MINI_POINTS = [100, 200, 400, 400, 400];
const PERFECT_POINTS = [0, 800, 1200, 1800, 2000];
const LINE_NAMES = ['', 'Single', 'Double', 'Triple', 'Quad'];

export function clearOutcome(input: {
  lines: number;
  spin: Spin;
  perfect: boolean;
  b2b: number;
  combo: number;
  level: number;
}): ClearOutcome {
  const { lines, spin, perfect, level } = input;
  const lineIx = Math.min(lines, 4);
  const spinPoints = spin === 'full' ? TWIST_POINTS : spin === 'mini' ? MINI_POINTS : LINE_POINTS;
  if (lines === 0) {
    return {
      lines,
      spin,
      perfect: false,
      attack: 0,
      b2b: input.b2b,
      combo: -1,
      points: spin === 'none' ? 0 : spinPoints[0]! * level,
      name: spin === 'full' ? 'T-twist' : spin === 'mini' ? 'Mini T-twist' : null,
    };
  }
  const hard = lines >= 4 || spin !== 'none';
  const chained = hard && input.b2b >= 0;
  const combo = input.combo + 1;
  const base =
    spin === 'full'
      ? TWIST_ATTACK[lineIx]!
      : spin === 'mini'
        ? MINI_ATTACK[lineIx]!
        : LINE_ATTACK[lineIx]!;
  const attack =
    base +
    (chained ? 1 : 0) +
    COMBO_BONUS[Math.min(combo, COMBO_BONUS.length - 1)]! +
    (perfect ? PERFECT_BONUS : 0);
  const points =
    Math.round(spinPoints[lineIx]! * level * (chained ? 1.5 : 1)) +
    50 * combo * level +
    (perfect ? PERFECT_POINTS[lineIx]! * level : 0);
  const named =
    spin === 'full'
      ? `T-twist ${LINE_NAMES[lineIx]!.toLowerCase()}`
      : spin === 'mini'
        ? `Mini T-twist ${LINE_NAMES[lineIx]!.toLowerCase()}`
        : lines >= 4
          ? 'Quad'
          : null;
  const name = perfect ? 'Perfect clear' : named;
  return {
    lines,
    spin,
    perfect,
    attack,
    b2b: hard ? input.b2b + 1 : -1,
    combo,
    points,
    name,
  };
}

/** Rubble owed to a player: one throw, with one gap column, rising together. */
export interface Incoming {
  id: number;
  /** Rows still owed. */
  lines: number;
  /** The gap column. */
  hole: number;
  /** Server time it was thrown. */
  at: number;
}

/** Rubble waits this long before it can rise, so there's a moment to cancel it. */
export const GARBAGE_DELAY_MS = 500;
/** At most this many rows rise after one stone. */
export const GARBAGE_CAP = 8;

/** Rows taken from each throw: by cancelling, or by rising into the well. */
export type Used = { id: number; n: number }[];

/** Cancels an attack against what's owed, oldest first. Returns what's left to throw. */
export function cancel(attack: number, owed: Incoming[]): { out: number; used: Used } {
  let left = attack;
  const used: Used = [];
  for (const g of owed) {
    if (left <= 0) break;
    const n = Math.min(left, g.lines);
    if (n > 0) used.push({ id: g.id, n });
    left -= n;
  }
  return { out: left, used };
}

/** Owed rubble minus what's been used. */
export function afterUse(owed: Incoming[], used: Used): Incoming[] {
  return owed
    .map((g) => ({
      ...g,
      lines: g.lines - used.filter((u) => u.id === g.id).reduce((a, u) => a + u.n, 0),
    }))
    .filter((g) => g.lines > 0);
}

/**
 * Raises rubble that's ready (thrown at least GARBAGE_DELAY_MS ago), oldest first and at most
 * GARBAGE_CAP rows. Anything pushed over the top of the well tops the player out.
 */
export function raise(
  well: string,
  owed: Incoming[],
  now: number,
): { well: string; used: Used; rows: number; toppedOut: boolean } {
  let out = well;
  let rows = 0;
  let toppedOut = false;
  const used: Used = [];
  for (const g of owed) {
    if (rows >= GARBAGE_CAP) break;
    if (now - g.at < GARBAGE_DELAY_MS) break;
    const n = Math.min(g.lines, GARBAGE_CAP - rows);
    if (n <= 0) continue;
    if (out.slice(0, n * W).replace(/\./g, '') !== '') toppedOut = true;
    const row = 'G'.repeat(g.hole) + '.' + 'G'.repeat(W - g.hole - 1);
    out = out.slice(n * W) + row.repeat(n);
    used.push({ id: g.id, n });
    rows += n;
  }
  return { well: out, used, rows, toppedOut };
}

// ---------------------------------------------------------------------------------------------
// A player's well, as kept between stones and reported to the server.

export interface Stack {
  /** W×H cells, row 0 at the top. */
  well: string;
  hold: Kind | null;
  /** How many stones have been drawn from the sequence so far. */
  next: number;
  combo: number;
  b2b: number;
  lines: number;
  pieces: number;
  /** Rubble thrown at others (after cancelling), all round. */
  sent: number;
  /** Rubble cancelled by clears, all round. */
  blocked: number;
  score: number;
  topped: boolean;
  quads: number;
  twists: number;
  perfects: number;
  bestCombo: number;
  bestThrow: number;
}

export function freshStack(): Stack {
  return {
    well: EMPTY_WELL,
    hold: null,
    next: 0,
    combo: -1,
    b2b: -1,
    lines: 0,
    pieces: 0,
    sent: 0,
    blocked: 0,
    score: 0,
    topped: false,
    quads: 0,
    twists: 0,
    perfects: 0,
    bestCombo: 0,
    bestThrow: 0,
  };
}

/** Blitz speeds up every ten lines. */
export function levelOf(lines: number): number {
  return 1 + Math.floor(lines / 10);
}

export interface LockResult {
  stack: Stack;
  clear: ClearOutcome;
  /** Rubble thrown by this stone, after cancelling. */
  out: number;
  /** Owed rubble used by this stone (cancelled, then risen). */
  used: Used;
  /** Rubble rows that rose after this stone. */
  rose: number;
}

/**
 * Sets a stone where it is and works out everything that follows: cleared rows, the clear's
 * rubble (cancelling what's owed first), and owed rubble rising if nothing cleared. A stone
 * locked wholly over the wall, or rubble pushing the stack over the top, tops the player out.
 * `dropPoints` is what the drop itself scored (1 a cell soft, 2 a cell hard).
 */
export function lockPiece(
  stack: Stack,
  p: Piece,
  opts: { spin: Spin; dropPoints: number; owed: Incoming[]; now: number },
): LockResult {
  const placed = place(stack.well, p);
  const lockedOut = cellsOf(p.kind, p.rot).every(([, cy]) => p.y + cy < HIDDEN);
  const { well: clearedWell, cleared } = clearRows(placed);
  const perfect = cleared > 0 && clearedWell === EMPTY_WELL;
  const clear = clearOutcome({
    lines: cleared,
    spin: opts.spin,
    perfect,
    b2b: stack.b2b,
    combo: stack.combo,
    level: levelOf(stack.lines),
  });
  const { out, used } = cancel(clear.attack, opts.owed);
  let well = clearedWell;
  let rose = 0;
  let toppedOut = lockedOut;
  const allUsed = [...used];
  if (cleared === 0) {
    const r = raise(well, afterUse(opts.owed, used), opts.now);
    well = r.well;
    rose = r.rows;
    allUsed.push(...r.used);
    toppedOut ||= r.toppedOut;
  }
  const next: Stack = {
    ...stack,
    well,
    combo: clear.combo,
    b2b: clear.b2b,
    lines: stack.lines + cleared,
    pieces: stack.pieces + 1,
    sent: stack.sent + out,
    blocked: stack.blocked + (clear.attack - out),
    score: stack.score + clear.points + opts.dropPoints,
    topped: stack.topped || toppedOut,
    quads: stack.quads + (cleared >= 4 ? 1 : 0),
    twists: stack.twists + (opts.spin !== 'none' && cleared > 0 ? 1 : 0),
    perfects: stack.perfects + (perfect ? 1 : 0),
    bestCombo: Math.max(stack.bestCombo, clear.combo),
    bestThrow: Math.max(stack.bestThrow, clear.attack),
  };
  return { stack: next, clear, out, used: allUsed, rose };
}

/** The next stone from the sequence, and the stack with it drawn. */
export function draw(stack: Stack, seed: number): { kind: Kind; stack: Stack } {
  return { kind: pieceAt(seed, stack.next), stack: { ...stack, next: stack.next + 1 } };
}

/**
 * Holding: the current stone goes to the hold and the held one comes out (or the next from the
 * sequence, if the hold was empty).
 */
export function holdSwap(stack: Stack, current: Kind, seed: number): { kind: Kind; stack: Stack } {
  if (stack.hold) return { kind: stack.hold, stack: { ...stack, hold: current } };
  const d = draw({ ...stack, hold: current }, seed);
  return d;
}

/** The next `count` stones after what's been drawn. */
export function preview(stack: Stack, seed: number, count = 5): Kind[] {
  return Array.from({ length: count }, (_, i) => pieceAt(seed, stack.next + i));
}

// ---------------------------------------------------------------------------------------------
// Speed.

export type Pace = 'Gentle' | 'Steady' | 'Fierce';

/**
 * How fast stones fall, in rows a second. In Versus it picks up every 30 seconds; in Blitz every
 * ten lines; Sprint keeps one gentle pace.
 */
export function gravity(
  mode: 'versus' | 'sprint' | 'blitz',
  pace: Pace,
  elapsedMs: number,
  lines: number,
): number {
  if (mode === 'sprint') return 1.5;
  if (mode === 'blitz') return Math.min(20, 1 + (levelOf(lines) - 1) * 0.9);
  const start = pace === 'Gentle' ? 1 : pace === 'Steady' ? 1.5 : 3;
  const step = pace === 'Gentle' ? 0.4 : pace === 'Steady' ? 0.8 : 1.5;
  return Math.min(20, start + Math.floor(Math.max(0, elapsedMs) / 30_000) * step);
}

/** How long a stone can rest on the stack before it locks, and how many moves reset that. */
export const LOCK_DELAY_MS = 500;
export const LOCK_RESETS = 15;
