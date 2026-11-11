/**
 * Where everything sits on the felt, as numbers. The stylesheet (`cambio.css`) draws the same
 * sizes with custom properties; this file mirrors them so a test can check that no seat block
 * (status tag, grid and name plate) ever touches the middle block (piles, labels, a held card).
 * Change one side and the other must follow.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Bucket = 3 | 5 | 7;

/** Opponents are sized in three steps: up to 3, 4 or 5, and 6 or 7. */
export const bucketOf = (k: number): Bucket => (k <= 3 ? 3 : k <= 5 ? 5 : 7);

/** Opponents' seats on the phone felt: x in percent of the ring, y from 0 (rail) to 1. */
export const RECT: Record<number, [number, number][]> = {
  1: [[50, 0]],
  2: [
    [27, 0],
    [73, 0],
  ],
  3: [
    [12, 0.5],
    [50, 0],
    [88, 0.5],
  ],
  4: [
    [12, 0.62],
    [36, 0],
    [64, 0],
    [88, 0.62],
  ],
  5: [
    [11, 0.62],
    [28, 0],
    [50, 0],
    [72, 0],
    [89, 0.62],
  ],
  6: [
    [10, 0.85],
    [10, 0.15],
    [36, 0],
    [64, 0],
    [90, 0.15],
    [90, 0.85],
  ],
  7: [
    [10, 0.85],
    [10, 0.15],
    [30, 0],
    [50, 0],
    [70, 0],
    [90, 0.15],
    [90, 0.85],
  ],
};

/** The x (percent) of the side seats, which the middle must stay clear of. */
export const SIDE_X: Record<number, number> = { 3: 12, 4: 12, 5: 11, 6: 10, 7: 10 };

/**
 * Round the whole table (the TV, a watcher): `n` seats spaced evenly along the rectangle their
 * centers can travel (`wc` by `hc`), the first at the bottom middle, the next to their left, going
 * round clockwise. Returns each seat's place as a fraction of that rectangle, x then y.
 */
export function perimeter(n: number, wc: number, hc: number): [number, number][] {
  const total = 2 * (wc + hc);
  return Array.from({ length: n }, (_, i) => {
    let s = (i / n) * total;
    // Start at the bottom middle and walk left, up the left side, along the top, down the right.
    const legs: [number, (t: number) => [number, number]][] = [
      [wc / 2, (t) => [wc / 2 - t, hc]],
      [hc, (t) => [0, hc - t]],
      [wc, (t) => [t, 0]],
      [hc, (t) => [wc, t]],
      [wc / 2, (t) => [wc - t, hc]],
    ];
    for (const [len, at] of legs) {
      if (s <= len + 1e-9) {
        const [x, y] = at(s);
        return [x / wc, y / hc] as [number, number];
      }
      s -= len;
    }
    return [0.5, 1] as [number, number];
  });
}

/** The ring a round table is laid out for, so its seat fractions can be worked out. */
export function ovalPlan(n: number, tv: boolean) {
  const m = tv ? tvMetrics(bucketOf(n)) : phoneMetrics(bucketOf(n), 344);
  const ringW = tv ? 1238 : 318;
  const ringH = tv ? 800 : 440;
  return { m, ringW, ringH, at: perimeter(n, ringW - m.seatW, ringH - m.seatH) };
}

export interface Metrics {
  mc: number;
  tagH: number;
  plateH: number;
  seatW: number;
  seatH: number;
  pile: number;
  hold: number;
  /** Height of a pile's label, and the gaps in the middle. */
  capH: number;
  pileGap: number;
  plateW: number;
  /** The clear band between a seat block and the middle. */
  band: number;
  gridGap: number;
  rowGap: number;
}

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(v, hi));

/** Sizes on a phone or laptop felt whose inner (content) width is `W` px. */
export function phoneMetrics(bucket: Bucket, W: number): Metrics {
  const cq = W / 100;
  const mc =
    bucket === 3
      ? Math.min(64, 7.6 * cq)
      : bucket === 5
        ? Math.min(52, 6.8 * cq)
        : Math.min(44, 5.8 * cq);
  const tagH = 16;
  const plateH = clamp(22, 0.42 * mc, 34);
  const gridGap = 3;
  const rowGap = 3;
  return {
    mc,
    tagH,
    plateH,
    seatW: Math.max(2 * mc + 8, bucket === 7 ? 56 : 60),
    seatH: tagH + plateH + 2.8 * mc + gridGap + 2 * rowGap,
    pile: Math.min(56, 11.5 * cq),
    hold: bucket === 7 ? Math.min(80, 14 * cq) : Math.min(92, 15 * cq),
    capH: 14,
    pileGap: 14,
    plateW: 90,
    band: 14,
    gridGap,
    rowGap,
  };
}

/** Sizes on the TV felt (stage pixels). */
export function tvMetrics(bucket: Bucket): Metrics {
  const mc = bucket === 3 ? 56 : bucket === 5 ? 52 : 46;
  const tagH = 34;
  const plateH = 64;
  const gridGap = 6;
  const rowGap = 8;
  return {
    mc,
    tagH,
    plateH,
    seatW: 230,
    seatH: tagH + plateH + 2.8 * mc + gridGap + 2 * rowGap,
    pile: 120,
    hold: 120,
    capH: 34,
    pileGap: 40,
    plateW: 0,
    band: 14,
    gridGap,
    rowGap,
  };
}

/** The seat blocks on the phone felt, in the ring's coordinates (its top left is 0, 0). */
export function rectSeats(k: number, ringW: number, ringH: number, m: Metrics): Box[] {
  return RECT[Math.min(Math.max(k, 1), 7)]!.map(([x, y]) => ({
    x: (x / 100) * ringW - m.seatW / 2,
    y: y * (ringH - m.seatH),
    w: m.seatW,
    h: m.seatH,
  }));
}

/** The seat blocks round an oval (the TV, a watcher). */
export function ovalSeats(n: number, ringW: number, ringH: number, m: Metrics): Box[] {
  return perimeter(n, ringW - m.seatW, ringH - m.seatH).map(([fx, fy]) => ({
    x: fx * (ringW - m.seatW),
    y: fy * (ringH - m.seatH),
    w: m.seatW,
    h: m.seatH,
  }));
}

/**
 * What the middle holds: the stock and discard in a row (with a third, small card in it when
 * someone else holds one), and below them, when you hold a card, that card with its plaque.
 */
export function middleContent(
  m: Metrics,
  who: 'none' | 'other' | 'mine',
): { w: number; h: number } {
  const pileH = m.pile * 1.4 + 3 + m.capH;
  const row = (who === 'other' ? 3 : 2) * m.pile + (who === 'other' ? 2 : 1) * m.pileGap;
  if (who !== 'mine') return { w: row, h: pileH };
  const held = m.hold + 6 + m.plateW;
  return { w: Math.max(row, held), h: pileH + 8 + m.hold * 1.4 };
}

/** The middle zone on the phone felt: under the top row, between the side seats. */
export function rectMiddle(k: number, ringW: number, ringH: number, m: Metrics): Box {
  const side = SIDE_X[Math.min(Math.max(k, 1), 7)];
  const inset = side === undefined ? 0 : (side / 100) * ringW + m.seatW / 2 + 8;
  const top = m.seatH + m.band;
  return { x: inset, y: top, w: ringW - 2 * inset, h: ringH - top };
}

/** The middle block centered in the ring (round tables): where `content` would sit. */
export function ovalMiddle(ringW: number, ringH: number, c: { w: number; h: number }): Box {
  return { x: (ringW - c.w) / 2, y: (ringH - c.h) / 2, w: c.w, h: c.h };
}

export const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
