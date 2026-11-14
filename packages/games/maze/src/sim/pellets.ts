import type { MazeLayout } from './layouts';

const indexes = new WeakMap<MazeLayout, Map<string, number>>();

/** Every pellet and power spot, "x,y" → index, in reading order. */
export function pelletIndex(m: MazeLayout): Map<string, number> {
  const cached = indexes.get(m);
  if (cached) return cached;
  const out = new Map<string, number>();
  m.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++)
      if (row[x] === '.' || row[x] === 'o') out.set(`${x},${y}`, out.size);
  });
  indexes.set(m, out);
  return out;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));

/** A 0/1-per-pellet array as unpadded base64url (6 pellets per character). */
export function encodeBits(bits: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let b = 0; b < 6; b++) if (bits[i + b]) v |= 1 << b;
    out += ALPHABET[v];
  }
  return out;
}

/** Reverses encodeBits for `n` pellets; missing or unknown characters read as zeros. */
export function decodeBits(s: string, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = VALUE.get(s[(i / 6) | 0] ?? '') ?? 0;
    out[i] = (v >> (i % 6)) & 1;
  }
  return out;
}
