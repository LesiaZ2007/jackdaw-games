import type { Size } from './types';

/**
 * The island's shape: pointy-top hexes of side 1, rows 3-4-5-4-3 (classic) or 3-4-5-6-5-4-3
 * (big). Tiles are numbered by row, top to bottom, then left to right. Corners and edges get short
 * ids (`c0…`, `e0…`) in top-to-bottom, left-to-right order of their position, so the same island
 * always has the same ids. Built once per size and cached.
 */

export interface Corner {
  id: string;
  x: number;
  y: number;
  /** Tiles touching this corner (1–3). */
  tiles: number[];
  /** Corners one road away (2–3). */
  corners: string[];
  edges: string[];
}

export interface Edge {
  id: string;
  a: string;
  b: string;
  /** Tiles on either side (1 on the coast, else 2). */
  tiles: number[];
}

export interface LayoutTile {
  x: number;
  y: number;
  row: number;
  /** Its six corners, clockwise from the top. */
  corners: string[];
  edges: string[];
  neighbours: number[];
}

export interface Layout {
  size: Size;
  tiles: LayoutTile[];
  corners: Record<string, Corner>;
  edges: Record<string, Edge>;
  cornerIds: string[];
  edgeIds: string[];
  /** Coastal edges where harbours go, round the coast. */
  harbourSlots: string[];
  /** Tile order for laying number tokens: outer ring first, counter-clockwise, inward. */
  spiral: number[];
  /** The corners' extent: [x0, y0, x1, y1]. */
  bounds: [number, number, number, number];
}

const ROWS: Record<Size, number[]> = { classic: [3, 4, 5, 4, 3], big: [3, 4, 5, 6, 5, 4, 3] };
const HARBOURS: Record<Size, number> = { classic: 9, big: 11 };
const SQ3 = Math.sqrt(3);

const cache = new Map<Size, Layout>();

export function layout(size: Size): Layout {
  const hit = cache.get(size);
  if (hit) return hit;
  const built = build(size);
  cache.set(size, built);
  return built;
}

function build(size: Size): Layout {
  const rows = ROWS[size];
  const mid = (rows.length - 1) / 2;
  const centres: { x: number; y: number; row: number }[] = [];
  rows.forEach((w, row) => {
    for (let j = 0; j < w; j++)
      centres.push({ x: SQ3 * (j - (w - 1) / 2), y: 1.5 * (row - mid), row });
  });

  // Corners by rounded position, then ids in reading order.
  const key = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const points = new Map<string, { x: number; y: number }>();
  const tileKeys = centres.map((c) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (60 * i - 90);
      const p = { x: c.x + Math.cos(a), y: c.y + Math.sin(a) };
      const k = key(p.x, p.y);
      if (!points.has(k)) points.set(k, p);
      return k;
    }),
  );
  const order = [...points.entries()].sort(
    ([, p], [, q]) => Math.round((p.y - q.y) * 100) || p.x - q.x,
  );
  const idOf = new Map(order.map(([k], i) => [k, `c${i}`]));
  const corners: Record<string, Corner> = {};
  for (const [k, p] of order) {
    const id = idOf.get(k)!;
    corners[id] = { id, x: p.x, y: p.y, tiles: [], corners: [], edges: [] };
  }

  // Edges as corner pairs, ids in reading order of their midpoints.
  const pairs = new Map<string, { a: string; b: string; tiles: number[] }>();
  tileKeys.forEach((ks, t) => {
    ks.forEach((k, i) => {
      const a = idOf.get(k)!;
      const b = idOf.get(ks[(i + 1) % 6]!)!;
      corners[a]!.tiles.push(t);
      const pk = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!pairs.has(pk)) pairs.set(pk, { a, b, tiles: [] });
      pairs.get(pk)!.tiles.push(t);
    });
  });
  const midOf = (e: { a: string; b: string }) => ({
    x: (corners[e.a]!.x + corners[e.b]!.x) / 2,
    y: (corners[e.a]!.y + corners[e.b]!.y) / 2,
  });
  const edgeList = [...pairs.values()].sort((e, f) => {
    const p = midOf(e);
    const q = midOf(f);
    return Math.round((p.y - q.y) * 100) || p.x - q.x;
  });
  const edges: Record<string, Edge> = {};
  edgeList.forEach((e, i) => {
    const id = `e${i}`;
    edges[id] = { id, a: e.a, b: e.b, tiles: e.tiles };
    corners[e.a]!.corners.push(e.b);
    corners[e.b]!.corners.push(e.a);
    corners[e.a]!.edges.push(id);
    corners[e.b]!.edges.push(id);
  });

  const edgeId = new Map(Object.values(edges).map((e) => [[e.a, e.b].sort().join('|'), e.id]));
  const tiles: LayoutTile[] = centres.map((c, t) => {
    const cs = tileKeys[t]!.map((k) => idOf.get(k)!);
    const es = cs.map((a, i) => edgeId.get([a, cs[(i + 1) % 6]!].sort().join('|'))!);
    return { ...c, corners: cs, edges: es, neighbours: [] };
  });
  for (const e of Object.values(edges))
    if (e.tiles.length === 2) {
      tiles[e.tiles[0]!]!.neighbours.push(e.tiles[1]!);
      tiles[e.tiles[1]!]!.neighbours.push(e.tiles[0]!);
    }

  const xs = Object.values(corners).map((c) => c.x);
  const ys = Object.values(corners).map((c) => c.y);
  return {
    size,
    tiles,
    corners,
    edges,
    cornerIds: Object.keys(corners),
    edgeIds: Object.keys(edges),
    harbourSlots: harbourSlots(edges, corners, HARBOURS[size]),
    spiral: spiral(tiles),
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

/** `n` coastal edges spread evenly round the coast, never two on one corner. */
function harbourSlots(edges: Record<string, Edge>, corners: Record<string, Corner>, n: number) {
  const coast = Object.values(edges)
    .filter((e) => e.tiles.length === 1)
    .map((e) => ({
      e,
      ang: Math.atan2(
        (corners[e.a]!.y + corners[e.b]!.y) / 2,
        (corners[e.a]!.x + corners[e.b]!.x) / 2,
      ),
    }))
    .sort((p, q) => p.ang - q.ang)
    .map((c) => c.e);
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let k = Math.floor((i * coast.length) / n);
    while (used.has(coast[k % coast.length]!.a) || used.has(coast[k % coast.length]!.b)) k++;
    const e = coast[k % coast.length]!;
    used.add(e.a);
    used.add(e.b);
    out.push(e.id);
  }
  return out;
}

/**
 * Peel the island ring by ring (tiles with fewer than six neighbours left are the ring), each
 * ring counter-clockwise on screen, starting next to where the last ring ended (the first starts
 * at the top-left tile).
 */
function spiral(tiles: LayoutTile[]): number[] {
  const left = new Set(tiles.map((_, i) => i));
  const out: number[] = [];
  while (left.size) {
    const ring = [...left].filter(
      (i) => tiles[i]!.neighbours.filter((n) => left.has(n)).length < 6,
    );
    const cx = ring.reduce((s, i) => s + tiles[i]!.x, 0) / ring.length;
    const cy = ring.reduce((s, i) => s + tiles[i]!.y, 0) / ring.length;
    const ang = (i: number) => Math.atan2(tiles[i]!.y - cy, tiles[i]!.x - cx);
    // Counter-clockwise on screen (y grows downward) is decreasing angle.
    const sorted = [...ring].sort((a, b) => ang(b) - ang(a));
    const prev = out[out.length - 1];
    const start =
      prev === undefined
        ? ring.reduce((best, i) =>
            tiles[i]!.row < tiles[best]!.row ||
            (tiles[i]!.row === tiles[best]!.row && tiles[i]!.x < tiles[best]!.x)
              ? i
              : best,
          )
        : ring.reduce((best, i) =>
            dist(tiles[i]!, tiles[prev]!) < dist(tiles[best]!, tiles[prev]!) ? i : best,
          );
    const s = sorted.indexOf(start);
    for (const i of [...sorted.slice(s), ...sorted.slice(0, s)]) {
      out.push(i);
      left.delete(i);
    }
  }
  return out;
}

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);
