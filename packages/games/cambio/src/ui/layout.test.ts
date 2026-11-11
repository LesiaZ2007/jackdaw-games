import { describe, expect, it } from 'vitest';
import {
  bucketOf,
  middleContent,
  ovalMiddle,
  ovalSeats,
  overlaps,
  phoneMetrics,
  rectMiddle,
  rectSeats,
  tvMetrics,
  type Box,
} from './layout';

const RING = 13;
const inside = (b: Box, w: number, h: number) =>
  b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= w + 0.01 && b.y + b.h <= h + 0.01;
const who = ['none', 'other', 'mine'] as const;

describe('the felt keeps seats and the middle apart', () => {
  // Felt widths and heights (inner, inside the rail) of a 375 and a 390 phone, and the laptop felt.
  const felts: [string, number, number][] = [
    ['375 phone', 329, 326],
    ['390 phone', 344, 350],
    ['laptop', 464, 400],
  ];
  for (const [label, W, H] of felts)
    for (let k = 1; k <= 7; k++)
      it(`${label}, ${k} opponents: no seat touches the middle, and it all fits`, () => {
        const ringW = W - 2 * RING;
        const ringH = H - 2 * RING;
        const m = phoneMetrics(bucketOf(k), W);
        const seats = rectSeats(k, ringW, ringH, m);
        const zone = rectMiddle(k, ringW, ringH, m);
        seats.forEach((s, i) => {
          expect(inside(s, ringW, ringH), `seat ${i} inside the ring`).toBe(true);
          expect(overlaps(s, zone), `seat ${i} clear of the middle`).toBe(false);
          seats
            .slice(i + 1)
            .forEach((o, j) =>
              expect(overlaps(s, o, 4), `seats ${i} and ${i + 1 + j}`).toBe(false),
            );
        });
        for (const w of who) {
          const c = middleContent(m, w);
          expect(c.w, `${w}: width`).toBeLessThanOrEqual(zone.w);
          expect(c.h, `${w}: height`).toBeLessThanOrEqual(zone.h);
        }
      });

  // A watcher sees everyone round an oval on a phone-sized felt.
  for (let n = 2; n <= 8; n++)
    it(`watching on a 390 phone, ${n} players: no seat touches the middle`, () => {
      const W = 344;
      const H = 466;
      const ringW = W - 2 * RING;
      const ringH = H - 2 * RING;
      const m = phoneMetrics(bucketOf(n), W);
      const seats = ovalSeats(n, ringW, ringH, m);
      const mid = ovalMiddle(ringW, ringH, middleContent(m, 'other'));
      seats.forEach((s, i) => {
        expect(inside(s, ringW, ringH)).toBe(true);
        expect(overlaps(s, mid, m.band), `seat ${i}`).toBe(false);
        seats.slice(i + 1).forEach((o) => expect(overlaps(s, o, 2)).toBe(false));
      });
    });
});

describe('the TV felt keeps seats and the middle apart', () => {
  // 1920×1080 stage: the felt is 1314 × 876 with a 14px rail and a 24px ring inset.
  const ringW = 1314 - 28 - 48;
  const ringH = 876 - 28 - 48;
  for (let n = 2; n <= 8; n++)
    it(`${n} players`, () => {
      const m = tvMetrics(bucketOf(n));
      const seats = ovalSeats(n, ringW, ringH, m);
      const mid = ovalMiddle(ringW, ringH, middleContent(m, 'other'));
      seats.forEach((s, i) => {
        expect(inside(s, ringW, ringH), `seat ${i} inside`).toBe(true);
        expect(overlaps(s, mid, m.band), `seat ${i} clear of the middle`).toBe(false);
        seats
          .slice(i + 1)
          .forEach((o, j) => expect(overlaps(s, o, 4), `seats ${i} and ${i + 1 + j}`).toBe(false));
      });
    });
});
