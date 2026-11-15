import { createRng } from '@jackdaw/engine';
import type { Rng } from '@jackdaw/engine';
import { MAZE_LAYOUTS, SIZE_DIMS, layoutsOf } from './layouts';
import type { MazeLayout, MazeSize } from './layouts';
import { layoutProblems } from './validate';
import type { Dir, Vec } from './walker';

/**
 * Random mazes. A maze starts as a lattice of one-tile corridors with randomly spaced lines (so
 * blocks are one to three tiles across), with the ghost house stamped in the middle and a
 * corridor ring around it. Then corridor pieces between two junctions are filled in at random,
 * always as a mirrored pair, which merges the blocks either side into L, T and longer shapes. A
 * piece stays open when filling it would leave a dead end, cut the maze in two or grow a block
 * past a size cap. Every corridor is one tile wide and every junction keeps two or more ways out,
 * so the result has loops everywhere and no open areas.
 *
 * Everything is integer math driven by `createRng(seed)`, so every phone, bot and server builds
 * the same maze from the same seed.
 */

const WALL = 0;
const PATH = 1;
const EMPTY = 2;
const DOOR = 3;

const STEPS: Dir[] = ['up', 'left', 'down', 'right'];
const STEP: Record<Dir, Vec> = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };

/** Splits `d` into steps of 2 to 4 (corridor lines 2 to 4 apart: blocks 1 to 3 tiles). */
function split(rng: Rng, d: number): number[] {
  const out: number[] = [];
  while (d > 0) {
    const ok = [2, 3, 4].filter((s) => s === d || d - s >= 2);
    // Mostly short steps: more corridors, more choices.
    const weights = ok.map((s) => (s === 2 ? 5 : s === 3 ? 4 : 1));
    let r = rng.int(weights.reduce((a, b) => a + b, 0));
    let i = 0;
    while (r >= weights[i]!) r -= weights[i++]!;
    out.push(ok[i]!);
    d -= ok[i]!;
  }
  return out;
}

/** Lines from `from` to `to`, `from` included, spaced by `split`. */
function lines(rng: Rng, from: number, to: number): number[] {
  const out = [from];
  for (const s of split(rng, to - from)) out.push(out[out.length - 1]! + s);
  return out;
}

/** Column lines between the house ring and the middle, as offsets from the middle column. */
const MIDDLES: number[][] = [[-3, -1], [-3, 0], [-2, 0], [-2], [-1]];

interface Segment {
  tiles: number[];
  ends: number[];
}

/** One attempt; null when the maze it made breaks a rule (the caller tries again). */
function build(rng: Rng, seed: number, size: MazeSize): MazeLayout | null {
  const { w, h } = SIZE_DIMS[size];
  const mid = (w - 1) / 2;
  const hy = Math.floor(h / 2) - 1 + rng.int(3);
  const ys = [...lines(rng, 1, hy - 2), ...lines(rng, hy + 2, h - 2)];
  const leftXs = [...lines(rng, 1, mid - 5), ...rng.pick(MIDDLES).map((d) => mid + d)];
  const xs = [...new Set([...leftXs, ...leftXs.map((x) => w - 1 - x)])].sort((a, b) => a - b);
  const uniqYs = [...new Set(ys)].sort((a, b) => a - b);

  const g = new Uint8Array(w * h);
  const id = (x: number, y: number) => y * w + x;
  for (const y of uniqYs) for (let x = 1; x < w - 1; x++) g[id(x, y)] = PATH;
  for (const x of xs) for (let y = 1; y < h - 1; y++) g[id(x, y)] = PATH;
  // The ghost house: a walled room 7 wide with the door on top in the middle.
  for (let y = hy - 1; y <= hy + 1; y++)
    for (let x = mid - 4; x <= mid + 4; x++) g[id(x, y)] = WALL;
  for (let x = mid - 3; x <= mid + 3; x++) g[id(x, hy)] = EMPTY;
  g[id(mid, hy - 1)] = DOOR;

  // A side tunnel, most of the time.
  let mouths = 0;
  const tunnelRows = uniqYs.filter((y) => y >= 3 && y <= h - 4);
  if (rng.int(10) < 6 && tunnelRows.length) {
    const t = rng.pick(tunnelRows);
    g[id(0, t)] = EMPTY;
    g[id(w - 1, t)] = EMPTY;
    mouths = 2;
  }

  const ways = (i: number): number => {
    const x = i % w;
    const y = (i - x) / w;
    let n = 0;
    for (const d of STEPS) {
      const ny = y + STEP[d][1];
      if (ny < 0 || ny >= h) continue;
      const v = g[id((x + STEP[d][0] + w) % w, ny)]!;
      if (v === PATH || v === EMPTY) n++;
    }
    return n;
  };

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let pathCount = 0;
  for (let i = 0; i < g.length; i++) if (g[i] === PATH) pathCount++;
  /** Whether a chomper can still reach every open tile from the top-left corner. */
  const connected = (): boolean => {
    seen.fill(0);
    let head = 0;
    let tail = 0;
    queue[tail++] = id(1, 1);
    seen[id(1, 1)] = 1;
    while (head < tail) {
      const i = queue[head++]!;
      const x = i % w;
      const y = (i - x) / w;
      for (const d of STEPS) {
        const ny = y + STEP[d][1];
        if (ny < 0 || ny >= h) continue;
        const j = id((x + STEP[d][0] + w) % w, ny);
        const v = g[j]!;
        if (seen[j] || (v !== PATH && v !== EMPTY)) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    return tail === pathCount + mouths;
  };
  /** Size of the wall block holding tile `i`, not counting the outer wall. */
  const blockSize = (i: number, cap: number): number => {
    seen.fill(0);
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    seen[i] = 1;
    while (head < tail && tail <= cap) {
      const k = queue[head++]!;
      const x = k % w;
      const y = (k - x) / w;
      for (const d of STEPS) {
        const nx = x + STEP[d][0];
        const ny = y + STEP[d][1];
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const j = id(nx, ny);
        if (seen[j] || g[j] !== WALL) continue;
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    return tail;
  };

  // Corridor pieces between neighbouring junctions.
  const segs: Segment[] = [];
  const corner = new Set([id(1, 1), id(w - 2, 1), id(1, h - 2), id(w - 2, h - 2)]);
  const onRing = (x: number, y: number) =>
    ((y === hy - 2 || y === hy + 2) && Math.abs(x - mid) <= 5) ||
    (Math.abs(x - mid) === 5 && y >= hy - 2 && y <= hy + 2);
  const add = (pts: Vec[], a: Vec, b: Vec) => {
    if (pts.some(([x, y]) => g[id(x, y)] !== PATH || onRing(x, y))) return;
    const ends = [id(a[0], a[1]), id(b[0], b[1])];
    if (ends.some((e) => g[e] !== PATH || corner.has(e))) return;
    segs.push({ tiles: pts.map(([x, y]) => id(x, y)), ends });
  };
  for (const y of uniqYs)
    for (let k = 0; k + 1 < xs.length; k++) {
      const pts: Vec[] = [];
      for (let x = xs[k]! + 1; x < xs[k + 1]!; x++) pts.push([x, y]);
      add(pts, [xs[k]!, y], [xs[k + 1]!, y]);
    }
  for (const x of xs)
    for (let k = 0; k + 1 < uniqYs.length; k++) {
      const pts: Vec[] = [];
      for (let y = uniqYs[k]! + 1; y < uniqYs[k + 1]!; y++) pts.push([x, y]);
      add(pts, [x, uniqYs[k]!], [x, uniqYs[k + 1]!]);
    }

  // Pair each piece with its mirror image (a piece across the middle is its own mirror).
  const mirrorTile = (i: number) => {
    const x = i % w;
    return i - x + (w - 1 - x);
  };
  const keyOf = (tiles: number[]) => [...tiles].sort((a, b) => a - b).join(',');
  const byKey = new Map(segs.map((s) => [keyOf(s.tiles), s]));
  const pairs: Segment[][] = [];
  for (const s of segs) {
    const k = keyOf(s.tiles);
    const mk = keyOf(s.tiles.map(mirrorTile));
    const m = byKey.get(mk);
    if (!m) continue;
    if (k === mk) pairs.push([s]);
    else if (k < mk) pairs.push([s, m]);
  }

  const fillPct = 55 + rng.int(26);
  const cap = { Small: 8, Medium: 10, Large: 12 }[size] + rng.int(4);
  for (const pair of rng.shuffle(pairs)) {
    if (rng.int(100) >= fillPct) continue;
    const tiles = pair.flatMap((s) => s.tiles);
    if (tiles.some((t) => g[t] !== PATH)) continue;
    for (const t of tiles) g[t] = WALL;
    pathCount -= tiles.length;
    const filled: number[] = [];
    let ok = true;
    for (const e of new Set(pair.flatMap((s) => s.ends))) {
      if (g[e] !== PATH) continue;
      const n = ways(e);
      if (n === 1) ok = false;
      else if (n === 0) filled.push(e);
    }
    for (const e of filled) g[e] = WALL;
    pathCount -= filled.length;
    if (ok) ok = blockSize(tiles[0]!, cap + 1) <= cap && connected();
    if (!ok) {
      for (const t of [...tiles, ...filled]) g[t] = PATH;
      pathCount += tiles.length + filled.length;
    }
  }

  const open = (x: number, y: number) => g[id(x, y)] === PATH;
  // Power spots: one pair up top, one pair below the house, near the sides when possible.
  const spot = (y0: number, y1: number): Vec | null => {
    const all: Vec[] = [];
    for (let y = y0; y <= y1; y++)
      for (let x = 1; x < mid - 1; x++) if (open(x, y)) all.push([x, y]);
    const near = all.filter(([x]) => x <= 3);
    return near.length ? rng.pick(near) : all.length ? rng.pick(all) : null;
  };
  const top = spot(2, hy - 3);
  const low = spot(hy + 3, h - 3);
  if (!top || !low) return null;
  const powers: Vec[] = [top, [w - 1 - top[0], top[1]], low, [w - 1 - low[0], low[1]]];

  // Starts, in seat order: under the house, the four corners, then the two sides.
  const taken = new Set<number>(corner);
  const pickOpen = (cands: Vec[]): Vec | null => {
    for (const [x, y] of cands)
      if (x > 0 && x < w - 1 && open(x, y) && !taken.has(id(x, y))) {
        taken.add(id(x, y));
        return [x, y];
      }
    return null;
  };
  const under: Vec[] = [];
  for (let y = hy + 3; y <= h - 3; y++) under.push([mid, y]);
  under.push([mid, hy + 2]);
  const floor: Vec[] = [];
  for (let y = h - 2; y > hy + 2; y--)
    for (let d = 0; d < mid; d++) floor.push([mid - d, y], [mid + d, y]);
  const side: Vec[] = [];
  for (let d = 0; d < h; d++) side.push([1, hy - d], [1, hy + d]);
  const s0 = pickOpen(under);
  const s3 = pickOpen(floor);
  const s6 = pickOpen(side.filter(([, y]) => y > 1 && y < h - 2));
  if (!s0 || !s3 || !s6) return null;
  const facing = (p: Vec, prefs: Dir[]): Dir =>
    prefs.find((d) => open(p[0] + STEP[d][0], p[1] + STEP[d][1])) ?? prefs[0]!;
  const starts: [number, number, Dir][] = (
    [
      [s0, ['left', 'right', 'up', 'down']],
      [[1, 1], ['right']],
      [[w - 2, 1], ['left']],
      [s3, ['right', 'left', 'up', 'down']],
      [[1, h - 2], ['right']],
      [[w - 2, h - 2], ['left']],
      [s6, ['right', 'down', 'up']],
      [
        [w - 1 - s6[0], s6[1]],
        ['left', 'down', 'up'],
      ],
    ] as [Vec, Dir[]][]
  ).map(([p, prefs]) => [p[0], p[1], facing(p, prefs)]);

  const spots = new Set(powers.map(([x, y]) => id(x, y)));
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      const v = g[id(x, y)]!;
      r +=
        v === WALL ? '#' : v === EMPTY ? ' ' : v === DOOR ? '-' : spots.has(id(x, y)) ? 'o' : '.';
    }
    rows.push(r);
  }
  return {
    id: `gen-${size[0]!.toLowerCase()}${seed}`,
    name: nameOf(seed),
    size,
    w,
    h,
    rows,
    starts,
    house: [mid, hy],
    exit: [mid, hy - 2],
    fruit: [mid, hy + 2],
    powers,
  };
}

const FIRST = [
  'Bramble',
  'Copper',
  'Velvet',
  'Thistle',
  'Lantern',
  'Marble',
  'Pepper',
  'Willow',
  'Cobble',
  'Saffron',
  'Clover',
  'Juniper',
  'Tinder',
  'Hazel',
  'Pickle',
  'Quartz',
];
const SECOND = [
  'Run',
  'Loop',
  'Warren',
  'Knot',
  'Hollow',
  'Weave',
  'Tangle',
  'Alley',
  'Circuit',
  'Burrow',
  'Garden',
  'Yard',
  'Spiral',
];

/** A generated maze's name, like "Bramble Run 4821". */
function nameOf(seed: number): string {
  const s = Math.abs(Math.trunc(seed));
  return `${FIRST[s % FIRST.length]} ${SECOND[Math.floor(s / FIRST.length) % SECOND.length]} ${s}`;
}

/** The name to show for a maze: a generated maze's own name, or a handmade maze's id. */
export function mazeName(m: MazeLayout): string {
  return m.name ?? m.id.charAt(0).toUpperCase() + m.id.slice(1);
}

/**
 * A random maze of `size` built from `seed` that passes every rule the handmade mazes do. The
 * same seed and size always give the same maze, on every device.
 */
export function generateLayout(seed: number, size: MazeSize): MazeLayout {
  const rng = createRng(seed >>> 0);
  for (let attempt = 0; attempt < 12; attempt++) {
    const m = build(rng, seed, size);
    if (m && layoutProblems(m).length === 0) return m;
  }
  // Never seen in testing; a handmade maze keeps the game going all the same.
  const pool = layoutsOf(size);
  return { ...pool[(seed >>> 0) % pool.length]!, id: `gen-${size[0]!.toLowerCase()}${seed}` };
}

/**
 * One maze of a run as stored in state and the table view: an index into MAZE_LAYOUTS, or the
 * seed and size of a generated maze.
 */
export type MazeRef = number | { gen: number; size: MazeSize };

const CACHE_MAX = 48;
const cache = new Map<string, MazeLayout>();

/** The maze a ref stands for. Generated mazes are cached (by seed and size), so callers get the same object back. */
export function resolveMaze(ref: MazeRef): MazeLayout {
  if (typeof ref === 'number') return MAZE_LAYOUTS[ref] ?? MAZE_LAYOUTS[0]!;
  const key = `${ref.size}:${ref.gen}`;
  const hit = cache.get(key);
  if (hit) {
    // Most recently used goes to the back.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = generateLayout(ref.gen, ref.size);
  cache.set(key, made);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return made;
}

/** Maze `maze` of a run (the first one when out of range). Every consumer goes through this. */
export function layoutAt(s: { layouts: readonly MazeRef[] }, maze: number): MazeLayout {
  return resolveMaze(s.layouts[maze] ?? s.layouts[0] ?? 0);
}
