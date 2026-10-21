import { define, isWord } from '@jackdaw/game-wordhoard';

/**
 * What the words just played mean, for Letterhoard's card after each play.
 * `GET /api/words/define?w=HOARD,QI` returns `{ words: [{ word, senses: [{ part, text }] }] }`.
 * Only words in Letterhoard's list are looked up, at most four at a time. Meanings don't change,
 * so the CDN keeps an answer for a month and each word reaches the dictionaries about once; an
 * answer with a word nobody knew (or a dictionary that was down) is kept for an hour only.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('w') ?? '';
  const asked = [
    ...new Set(
      raw
        .split(',')
        .map((w) => w.trim().toUpperCase())
        .filter((w) => /^[A-Z]{2,15}$/.test(w) && isWord(w)),
    ),
  ].slice(0, 4);
  const words = await Promise.all(asked.map(define));
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
