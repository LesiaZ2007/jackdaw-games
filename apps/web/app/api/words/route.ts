import { isWord } from '@jackdaw/game-wordhoard';

/**
 * Letterhoard's word list, asked a few words at a time, so a phone can say "not in the word list"
 * before Play without downloading the whole list. `GET /api/words?w=HOARD,QZX` returns
 * `{ unknown: ["QZX"] }`. The list never changes between deploys, so answers cache well.
 */
export function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('w') ?? '';
  const asked = raw
    .split(',')
    .map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-Z]{2,15}$/.test(w))
    .slice(0, 12);
  return Response.json(
    { unknown: asked.filter((w) => !isWord(w)) },
    { headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400' } },
  );
}
