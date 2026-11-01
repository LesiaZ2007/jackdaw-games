import { describe, expect, it } from 'vitest';
import {
  EMPTY_WELL,
  GARBAGE_CAP,
  GARBAGE_DELAY_MS,
  H,
  KINDS,
  W,
  cancel,
  clearOutcome,
  clearRows,
  fits,
  freshStack,
  lockPiece,
  pieceAt,
  raise,
  rotate,
  spawn,
  twist,
  type Incoming,
  type Piece,
} from './sim';

/** A well from rows listed bottom-up (each ten characters); the rest is empty. */
function wellOf(...rowsFromBottom: string[]): string {
  const rows = rowsFromBottom.map((r) => {
    expect(r).toHaveLength(W);
    return r;
  });
  return EMPTY_WELL.slice(0, (H - rows.length) * W) + rows.reverse().join('');
}

describe('rotation', () => {
  it('turns I and T in an open well', () => {
    const i = rotate(EMPTY_WELL, spawn('I'), 1)!;
    expect(i.piece.rot).toBe(1);
    expect(i.kick).toBe(0);
    expect(fits(EMPTY_WELL, i.piece)).toBe(true);
    const t = rotate(EMPTY_WELL, spawn('T'), -1)!;
    expect(t.piece.rot).toBe(3);
    const back = rotate(EMPTY_WELL, t.piece, 1)!;
    expect(back.piece.rot).toBe(0);
  });

  it('kicks off a wall', () => {
    const p: Piece = { kind: 'T', rot: 1, x: -1, y: 5 };
    expect(fits(EMPTY_WELL, p)).toBe(true);
    const r = rotate(EMPTY_WELL, p, 1)!;
    expect(r.kick).toBeGreaterThan(0);
    expect(r.piece.x).toBe(0);
    expect(fits(EMPTY_WELL, r.piece)).toBe(true);
  });

  it('does not turn an O', () => {
    const o = spawn('O');
    const r = rotate(EMPTY_WELL, o, 1)!;
    expect(r.piece).toEqual(o);
  });

  it('returns null when nothing fits', () => {
    const full = 'G'.repeat(W * H);
    expect(rotate(full, { kind: 'T', rot: 0, x: 3, y: 3 }, 1)).toBeNull();
  });
});

describe('clearRows', () => {
  it('removes full rows and drops the rest', () => {
    const well = wellOf('GGGGGGGGGG', 'G.........', 'GGGGGGGGGG');
    const r = clearRows(well);
    expect(r.cleared).toBe(2);
    expect(r.well).toBe(wellOf('G.........'));
  });

  it('leaves a well with no full rows alone', () => {
    const well = wellOf('GGGGGGGGG.');
    expect(clearRows(well)).toEqual({ well, cleared: 0 });
  });
});

describe('twists', () => {
  const slot = (bottom: string, top: string) => wellOf(bottom, '...GGGGGGG', top);
  const t: Piece = { kind: 'T', rot: 2, x: 0, y: H - 3 };

  it('finds a full twist in a T slot', () => {
    const well = slot('G.GGGGGGGG', 'G.........');
    expect(fits(well, t)).toBe(true);
    expect(twist(well, t, true, 0)).toBe('full');
  });

  it('finds a mini twist', () => {
    const well = slot('..GGGGGGGG', 'G.G.......');
    expect(twist(well, t, true, 0)).toBe('mini');
  });

  it('takes the last kick as a full twist, and needs a turn', () => {
    const well = slot('..GGGGGGGG', 'G.G.......');
    expect(twist(well, t, true, 4)).toBe('full');
    expect(twist(well, t, false, 0)).toBe('none');
    expect(twist(well, { ...t, kind: 'L' }, true, 0)).toBe('none');
  });

  it('is no twist in the open', () => {
    expect(twist(EMPTY_WELL, { kind: 'T', rot: 0, x: 3, y: 5 }, true, 0)).toBe('none');
  });
});

describe('clearOutcome', () => {
  const base = {
    spin: 'none' as 'none' | 'mini' | 'full',
    perfect: false,
    b2b: -1,
    combo: -1,
    level: 1,
  };
  const attack = (lines: number, extra: Partial<typeof base> = {}) =>
    clearOutcome({ ...base, lines, ...extra }).attack;

  it('follows the attack table', () => {
    expect([1, 2, 3, 4].map((l) => attack(l))).toEqual([0, 1, 2, 4]);
    expect(attack(0)).toBe(0);
  });

  it('throws four for a T-twist double', () => {
    expect(attack(2, { spin: 'full' })).toBe(4);
  });

  it('adds one for back to back', () => {
    const first = clearOutcome({ ...base, lines: 4 });
    expect(first.b2b).toBe(0);
    const second = clearOutcome({ ...base, lines: 4, b2b: first.b2b });
    expect(second.attack).toBe(5);
    expect(second.b2b).toBe(1);
    expect(clearOutcome({ ...base, lines: 1, b2b: 1 }).b2b).toBe(-1);
  });

  it('adds a combo bonus', () => {
    expect(attack(1, { combo: 1 })).toBe(1);
    expect(attack(1, { combo: 4 })).toBe(2);
  });

  it('adds ten for a perfect clear', () => {
    expect(attack(4, { perfect: true })).toBe(14);
  });

  it('resets the chain when nothing clears', () => {
    expect(clearOutcome({ ...base, lines: 0, combo: 3 }).combo).toBe(-1);
  });
});

describe('rubble', () => {
  const owed = (id: number, lines: number, at = 0, hole = 3): Incoming => ({ id, lines, hole, at });

  it('cancels oldest first and returns the rest', () => {
    const r = cancel(3, [owed(1, 2), owed(2, 2)]);
    expect(r.out).toBe(0);
    expect(r.used).toEqual([
      { id: 1, n: 2 },
      { id: 2, n: 1 },
    ]);
    expect(cancel(5, [owed(1, 2)]).out).toBe(3);
  });

  it('waits out the delay', () => {
    const early = raise(EMPTY_WELL, [owed(1, 2, 1_000)], 1_000 + GARBAGE_DELAY_MS - 1);
    expect(early.rows).toBe(0);
    expect(early.well).toBe(EMPTY_WELL);
    const ready = raise(EMPTY_WELL, [owed(1, 2, 1_000)], 1_000 + GARBAGE_DELAY_MS);
    expect(ready.rows).toBe(2);
    expect(ready.well.slice(-W)).toBe('GGG.GGGGGG');
    expect(ready.used).toEqual([{ id: 1, n: 2 }]);
  });

  it('raises at most eight rows', () => {
    const r = raise(EMPTY_WELL, [owed(1, 12), owed(2, 3)], 99_999);
    expect(r.rows).toBe(GARBAGE_CAP);
    expect(r.used).toEqual([{ id: 1, n: GARBAGE_CAP }]);
    expect(r.toppedOut).toBe(false);
  });

  it('tops out when pushed over the top', () => {
    const well = 'G' + EMPTY_WELL.slice(1);
    expect(raise(well, [owed(1, 1)], 99_999).toppedOut).toBe(true);
  });
});

describe('lockPiece', () => {
  it('tops out a stone locked over the wall', () => {
    const res = lockPiece(freshStack(), spawn('O'), {
      spin: 'none',
      dropPoints: 0,
      owed: [],
      now: 0,
    });
    expect(res.stack.topped).toBe(true);
  });

  it('counts a clear and a stone', () => {
    const well = wellOf('GGGGGG....');
    const res = lockPiece(
      { ...freshStack(), well },
      { kind: 'I', rot: 0, x: 6, y: H - 2 },
      { spin: 'none', dropPoints: 4, owed: [], now: 0 },
    );
    expect(res.clear.lines).toBe(1);
    expect(res.stack.lines).toBe(1);
    expect(res.stack.pieces).toBe(1);
    expect(res.stack.topped).toBe(false);
  });
});

describe('pieceAt', () => {
  it('gives each kind once per set of seven', () => {
    for (const seed of [1, 99, 123456]) {
      for (let bag = 0; bag < 3; bag++) {
        const kinds = Array.from({ length: 7 }, (_, i) => pieceAt(seed, bag * 7 + i));
        expect([...kinds].sort()).toEqual([...KINDS]);
      }
    }
  });

  it('is the same every time, and differs by seed', () => {
    const a = Array.from({ length: 30 }, (_, i) => pieceAt(5, i));
    const b = Array.from({ length: 30 }, (_, i) => pieceAt(5, i));
    expect(a).toEqual(b);
    const c = Array.from({ length: 30 }, (_, i) => pieceAt(6, i));
    expect(c).not.toEqual(a);
  });
});
