import { PACKED_WORDS } from '#packed-words';

/**
 * The word list (ENABLE, public domain: 168,551 words of 2 to 15 letters, plus EXTRA), unpacked into a set the
 * first time it's needed. Server-side only: the screens never import it.
 */
let words: Set<string> | null = null;

/**
 * Newer words players expect that ENABLE (from the 1990s) doesn't have: the short words added to
 * the tournament lists since (QI, ZA, OK, EW…) and a few everyday modern ones. The official lists
 * themselves (NWL, Collins) are copyrighted, so they can't be shipped.
 */
const EXTRA =
  `qi qis za zas ki kis ok ew ze da gi gis po pos te tes oi fe zen zens emoji emojis selfie
selfies text texted texting blog blogs blogged blogger bloggers blogging vax bestie besties hashtag
hashtags website websites email emails emailed emailing online internet`.split(/\s+/);

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

/** Every word in the list, lower case (the computer player builds its search tree from it). */
export function wordSet(): ReadonlySet<string> {
  words ??= new Set([...unpack(PACKED_WORDS), ...EXTRA]);
  return words;
}

export function isWord(word: string): boolean {
  return wordSet().has(word.toLowerCase());
}
