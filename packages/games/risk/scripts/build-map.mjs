// Builds a map's outlines: `node scripts/build-map.mjs <world|realm>`.
//
// Reads scripts/coasts/<map>.json (coast polygons + one seed point per territory), roughens the
// coasts a little so they read as engraved rather than ruled, cuts each landmass into Voronoi cells
// around its seeds (a landmass with one seed is that territory), and writes
// src/maps/<map>.shapes.ts with every territory's outline and label point, the coastline, and the
// pairs of territories that touch on land (a test checks those against the map's borders), and
// each continent's outline (its territories merged), for the heavier rule between continents.
import { Delaunay } from 'd3-delaunay';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const id = process.argv[2];
if (!['world', 'realm'].includes(id)) {
  console.error('usage: node scripts/build-map.mjs <world|realm>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'scripts/coasts', `${id}.json`), 'utf8'));
const [W, H] = src.viewBox;

/**
 * A magnifying glass over one spot (Europe on the world map, as printed boards do): points within
 * `r` of the centre are pushed outward, most near the middle. It's monotonic, so nothing folds.
 */
function lens([x, y], { at: [cx, cy], r, k }) {
  const d = Math.hypot(x - cx, y - cy);
  if (d >= r || d === 0) return [x, y];
  const f = 1 + k * (1 - d / r) ** 2;
  return [cx + (x - cx) * f, cy + (y - cy) * f];
}

const project =
  src.projection === 'lonlat'
    ? ([lon, lat]) => {
        const p = [(lon + 170) * 2.75, (78 - lat) * 4.4];
        return src.lens ? lens(p, src.lens) : p;
      }
    : (p) => p;

/** A repeatable pseudo-random number in [-1, 1] for a point. */
function hash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/**
 * The points between two ends of an edge, split into `step`-long pieces and nudged sideways by up
 * to `amp`. Both directions give the same points (the edge is put in a fixed order first), so two
 * cells sharing an edge still meet exactly.
 */
function wobble(a, b, step, amp) {
  const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = flip ? [b, a] : [a, b];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.max(1, Math.ceil(len / step));
  if (n === 1 || len === 0) return [];
  const [nx, ny] = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
  // Ease the nudge in and out so the ends (shared corners) stay put.
  const pts = [];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = p[0] + (q[0] - p[0]) * t;
    const y = p[1] + (q[1] - p[1]) * t;
    const j = hash(x, y) * Math.min(amp, len * 0.12) * Math.sin(Math.PI * t) ** 0.5;
    pts.push([x + nx * j, y + ny * j]);
  }
  return flip ? pts.reverse() : pts;
}

function wobbleRing(ring, step, amp) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push(a, ...wobble(a, b, step, amp));
  }
  return out;
}

/** Coasts: a broad wander, then a fine one, so they read as drawn rather than ruled. */
const roughen = (ring) => wobbleRing(wobbleRing(ring, 22, 7), 6, 2.2);

/** Inland borders: a gentle wander (cell rings are closed: the last point repeats the first). */
const wobbleCell = (cell) => {
  const ring = wobbleRing(cell.slice(0, -1), 14, 5);
  return [...ring, ring[0]];
};

function inside([x, y], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function segDist([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** The point inside a polygon furthest from its edges (a coarse grid search, then refined). */
function labelPoint(multi) {
  const rings = multi.flat();
  const inPoly = (p) =>
    multi.some((poly) => inside(p, poly[0]) && !poly.slice(1).some((h) => inside(p, h)));
  const edgeDist = (p) => {
    let d = Infinity;
    for (const r of rings)
      for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(p, r[i], r[i + 1]));
    return d;
  };
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  let best = null;
  let bestD = -1;
  for (const step of [4, 1]) {
    const [x0, x1, y0, y1] = best
      ? [best[0] - 4, best[0] + 4, best[1] - 4, best[1] + 4]
      : [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (let x = x0; x <= x1; x += step)
      for (let y = y0; y <= y1; y += step) {
        const p = [x, y];
        if (!inPoly(p)) continue;
        const d = edgeDist(p);
        if (d > bestD) [best, bestD] = [p, d];
      }
  }
  return best.map((v) => Math.round(v * 10) / 10);
}

const r1 = (v) => Math.round(v * 10) / 10;
const pathOf = (multi) =>
  multi
    .flatMap((poly) =>
      poly.map(
        (ring) =>
          'M' +
          ring
            .slice(0, -1)
            .map(([x, y]) => `${r1(x)} ${r1(y)}`)
            .join('L') +
          'Z',
      ),
    )
    .join('');

const shapes = {};
/** Each territory's polygons, for merging into continents. */
const polys = {};
const landPairs = [];
const coast = [];

for (const [name, raw] of Object.entries(src.lands)) {
  const ring = roughen(raw.map(project));
  coast.push([[...ring, ring[0]]]);
  const land = [[...ring, ring[0]]];
  const ids = Object.keys(src.seeds).filter((t) => inside(project(src.seeds[t]), ring));
  if (ids.length === 0) throw new Error(`${name}: no seeds`);
  if (ids.length === 1) {
    const multi = [land];
    shapes[ids[0]] = { path: pathOf(multi), label: labelPoint(multi) };
    polys[ids[0]] = multi;
    continue;
  }
  const pts = ids.map((t) => project(src.seeds[t]));
  const vor = Delaunay.from(pts).voronoi([-50, -50, W + 50, H + 50]);
  const kept = [];
  const strays = [];
  ids.forEach((t, i) => {
    const multi = polygonClipping.intersection([wobbleCell(vor.cellPolygon(i))], land);
    if (!multi.length) throw new Error(`${t}: its cell misses the land`);
    // A cell can reach across water and catch a piece of another shore: that piece goes to
    // whichever territory it touches, nearest seed first.
    kept[i] = multi.filter((poly) => inside(pts[i], poly[0]));
    if (!kept[i].length) throw new Error(`${t}: its seed isn't on land`);
    strays.push(...multi.filter((poly) => !inside(pts[i], poly[0])));
  });
  // A stray may only touch another stray at first, so go round until every one is placed.
  for (let pass = 0; strays.length && pass < 10; pass++) {
    for (const stray of [...strays]) {
      const c = stray[0][0];
      const near = (i) => Math.hypot(pts[i][0] - c[0], pts[i][1] - c[1]);
      const touching = ids.map((_, i) => i).filter((i) => sharedLength([stray], kept[i]) > 0.5);
      if (!touching.length) continue;
      const to = touching.sort((a, b) => near(a) - near(b))[0];
      kept[to] = polygonClipping.union(kept[to], [stray]);
      strays.splice(strays.indexOf(stray), 1);
    }
  }
  if (strays.length) throw new Error(`${name}: ${strays.length} stray pieces touch nothing`);
  ids.forEach((t, i) => {
    shapes[t] = { path: pathOf(kept[i]), label: labelPoint(kept[i]) };
    polys[t] = kept[i];
  });
  // Neighbours: territories whose outlines run together for more than a sliver.
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (sharedLength(kept[i], kept[j]) > 4) landPairs.push([ids[i], ids[j]].sort());
}

/** How far two polygons' boundaries run together (sampled every unit along the first). */
function sharedLength(a, b) {
  const ra = a.flat();
  const rb = b.flat();
  const box = (rs) => {
    const p = rs.flat();
    return [
      Math.min(...p.map((q) => q[0])),
      Math.max(...p.map((q) => q[0])),
      Math.min(...p.map((q) => q[1])),
      Math.max(...p.map((q) => q[1])),
    ];
  };
  const [ax0, ax1, ay0, ay1] = box(ra);
  const [bx0, bx1, by0, by1] = box(rb);
  if (ax0 > bx1 + 1 || bx0 > ax1 + 1 || ay0 > by1 + 1 || by0 > ay1 + 1) return 0;
  let len = 0;
  for (const r of ra)
    for (let i = 0; i < r.length - 1; i++) {
      const [p, q] = [r[i], r[i + 1]];
      const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n = Math.max(1, Math.round(seg));
      for (let k = 0; k < n; k++) {
        const s = [p[0] + ((q[0] - p[0]) * (k + 0.5)) / n, p[1] + ((q[1] - p[1]) * (k + 0.5)) / n];
        if (
          rb.some((rr) =>
            rr.some((_, m) => m < rr.length - 1 && segDist(s, rr[m], rr[m + 1]) < 0.5),
          )
        )
          len += seg / n;
      }
    }
  return len;
}

// Which continent each territory is in, read from the map's own list (src/maps/<map>.ts).
const listed = readFileSync(join(root, 'src/maps', `${id}.ts`), 'utf8');
const regionOf = {};
for (const m of listed.matchAll(/\[\s*'([a-z0-9-]+)',\s*'[^']*',\s*'([a-z0-9-]+)'\s*\]/g))
  regionOf[m[1]] = m[2];
const regions = {};
for (const [t, shape] of Object.entries(polys)) {
  const r = regionOf[t];
  if (!r) throw new Error(`${t}: not in src/maps/${id}.ts`);
  regions[r] = regions[r] ? polygonClipping.union(regions[r], shape) : shape;
}

const missing = Object.keys(src.seeds).filter((t) => !shapes[t]);
if (missing.length) throw new Error(`seeds outside every landmass: ${missing.join(', ')}`);

const UP = id.toUpperCase();
const out = `// Generated by scripts/build-map.mjs ${id} from scripts/coasts/${id}.json. Don't edit by hand.
export const ${UP}_SHAPES: Record<string, { path: string; label: [number, number] }> = ${JSON.stringify(shapes)};
export const ${UP}_SEA = ${JSON.stringify(pathOf(coast))};
/** Territories that touch on land (checked against the borders in a test). */
export const ${UP}_LAND: [string, string][] = ${JSON.stringify(landPairs.sort())};
/** Each continent's outline, by continent id. */
export const ${UP}_REGIONS: Record<string, string> = ${JSON.stringify(
  Object.fromEntries(Object.entries(regions).map(([r, multi]) => [r, pathOf(multi)])),
)};
`;
writeFileSync(join(root, 'src/maps', `${id}.shapes.ts`), out);
console.log(`${id}: ${Object.keys(shapes).length} territories, ${landPairs.length} land borders`);
