import { PACKED_WORDS } from '#packed-words';

/**
 * The word list (ENABLE, public domain: 168,551 words of 2 to 15 letters), unpacked into a set the
 * first time it's needed. Server-side only: the screens never import it.
 */
let words: Set<string> | null = null;

function unpack(packed: string): Set<string> {
  const out = new Set<string>();
  let prev = '';
  let i = 0;
  while (i < packed.length) {
    const shared = packed.charCodeAt(i) - 65;
    let j = i + 1;
    while (j < packed.length && packed.charCodeAt(j) >= 97) j++;
    prev = prev.slice(0, shared) + packed.slice(i + 1, j);
    out.add(prev);
    i = j;
  }
  return out;
}

export function isWord(word: string): boolean {
  words ??= unpack(PACKED_WORDS);
  return words.has(word.toLowerCase());
}
