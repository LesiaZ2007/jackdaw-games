import { PACKED_WORDS } from '#packed-words';

/**
 * The word list (ENABLE, public domain: 168,551 words of 2 to 15 letters, plus EXTRA), unpacked into a set the
 * first time it's needed. Server-side only: the screens never import it.
 */
let words: Set<string> | null = null;

/**
 * The packed list when the host keeps it outside the server bundle (the Cloudflare build, where
 * the bundle has a size limit): it fetches the list and hands it over before the first check.
 */
let provided: string | null = null;

/** True when this server has no word list yet and must call provideWords first. */
export function wordsMissing(): boolean {
  return !PACKED_WORDS && provided === null;
}

export function provideWords(packed: string): void {
  if (words === null) provided = packed;
}

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
  words ??= new Set([...unpack(provided ?? PACKED_WORDS), ...EXTRA]);
  return words;
}

export function isWord(word: string): boolean {
  return wordSet().has(word.toLowerCase());
}
