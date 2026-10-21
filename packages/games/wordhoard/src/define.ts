/**
 * What a played word means, for the card that shows after each play. The word list (ENABLE) has
 * no definitions, so they come from free dictionaries built on Wiktionary: dictionaryapi.dev
 * (clean text, but often down) and Wiktionary's own definition API, which also knows the odd
 * words (QI, ZA, XU) but sends HTML. Only plain `fetch`, so it runs anywhere the server does.
 */

export interface Sense {
  /** "noun", "verb"… */
  part: string;
  text: string;
}

export interface Definition {
  word: string;
  /** The first sense or two; empty when neither dictionary knows the word. */
  senses: Sense[];
}

/** Senses kept per word: enough to read aloud, short enough for a phone. */
const KEEP = 2;
/** Longer definitions are cut at a word boundary. */
const MAX_LEN = 180;

function tidy(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_LEN) return flat;
  const cut = flat.slice(0, MAX_LEN);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** dictionaryapi.dev: `[{ meanings: [{ partOfSpeech, definitions: [{ definition }] }] }]`. */
export function fromFreeDictionary(body: unknown): Sense[] {
  if (!Array.isArray(body)) return [];
  const senses: Sense[] = [];
  for (const entry of body) {
    for (const m of (entry as { meanings?: unknown[] })?.meanings ?? []) {
      const meaning = m as { partOfSpeech?: string; definitions?: { definition?: string }[] };
      // One sense per part of speech first, so "noun" and "verb" both get a line.
      const d = meaning.definitions?.find((x) => x.definition?.trim());
      if (d?.definition)
        senses.push({ part: meaning.partOfSpeech ?? '', text: tidy(d.definition) });
    }
  }
  return senses.slice(0, KEEP);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
};

/** Wiktionary's HTML definition down to plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (all, name: string) => ENTITIES[name] ?? all);
}

/**
 * Wiktionary entries that aren't what a player meant (SEA's first entry is "Symbol: ISO 639-3
 * language code for Semai"). They're only used when a word has nothing else.
 */
const ASIDE = new Set([
  'symbol',
  'abbreviation',
  'initialism',
  'acronym',
  'proper noun',
  'letter',
  'prefix',
  'suffix',
  'romanization',
]);

/** Wiktionary REST: `{ en: [{ partOfSpeech, definitions: [{ definition: "<html>" }] }] }`. */
export function fromWiktionary(body: unknown): Sense[] {
  const english = (body as { en?: unknown[] } | null)?.en;
  if (!Array.isArray(english)) return [];
  const senses: Sense[] = [];
  for (const e of english) {
    const entry = e as { partOfSpeech?: string; definitions?: { definition?: string }[] };
    const d = entry.definitions
      ?.map((x) => tidy(stripHtml(x.definition ?? '')))
      .find((text) => text.length > 1);
    if (d) senses.push({ part: (entry.partOfSpeech ?? '').toLowerCase(), text: d });
  }
  const plain = senses.filter((x) => !ASIDE.has(x.part));
  return (plain.length > 0 ? plain : senses).slice(0, KEEP);
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'JackdawGames (word definitions)' },
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Looks one word up in both dictionaries at once (dictionaryapi.dev is often down), preferring
 * its cleaner text when it answers. Never throws.
 */
export async function define(word: string): Promise<Definition> {
  const w = encodeURIComponent(word.toLowerCase());
  const [free, wiki] = await Promise.all([
    getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`),
    getJson(`https://en.wiktionary.org/api/rest_v1/page/definition/${w}`),
  ]);
  const senses = fromFreeDictionary(free);
  return { word: word.toUpperCase(), senses: senses.length > 0 ? senses : fromWiktionary(wiki) };
}
