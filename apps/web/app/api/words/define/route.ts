import { define, isWord, type Definition } from '@jackdaw/game-wordhoard';

/**
 * What the words just played mean, for Letterhoard's card after each play.
 * `GET /api/words/define?w=HOARD,QI` returns `{ words: [{ word, senses: [{ part, text }] }] }`.
 * Only words in Letterhoard's list are looked up, at most four at a time. Meanings don't change,
 * so the CDN keeps an answer for a month and each word reaches the dictionaries about once; an
 * answer with a word nobody knew (or a dictionary that was down) is kept for an hour only.
 *
 * The CDN keys on the whole URL, so any other spelling of the same question (lower case, repeats,
 * another order, extra parameters) is sent to the one canonical URL: the words in capitals,
 * sorted, joined by commas. Each server instance also remembers the last few hundred meanings it
 * found, so a word that's cached nowhere else still isn't fetched again.
 */

const REMEMBER = 500;
/** Meanings this instance has found, oldest first (a Map keeps insertion order). */
const found = new Map<string, Definition>();

async function lookUp(word: string): Promise<Definition> {
  const known = found.get(word);
  if (known) {
    // Most recently used goes to the back.
    found.delete(word);
    found.set(word, known);
    return known;
  }
  const d = await define(word);
  // Only remember a meaning that was found: a miss may just be a dictionary that was down.
  if (d.senses.length > 0) {
    found.set(word, d);
    if (found.size > REMEMBER) found.delete(found.keys().next().value!);
  }
  return d;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get('w') ?? '';
  const asked = [
    ...new Set(
      raw
        .split(',')
        .map((w) => w.trim().toUpperCase())
        .filter((w) => /^[A-Z]{2,15}$/.test(w) && isWord(w)),
    ),
  ]
    .slice(0, 4)
    .sort();
  const canonical = `?w=${asked.join(',')}`;
  if (url.search !== canonical) {
    url.search = canonical;
    return new Response(null, {
      status: 308,
      headers: { location: url.toString(), 'cache-control': 'public, max-age=86400' },
    });
  }
  const words = await Promise.all(asked.map(lookUp));
  const complete = words.every((w) => w.senses.length > 0);
  return Response.json(
    { words },
    {
      headers: {
        'cache-control': complete
          ? 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400'
          : 'public, max-age=600, s-maxage=3600',
      },
    },
  );
}
