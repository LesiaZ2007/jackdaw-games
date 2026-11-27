import { getRuntime } from '@/lib/runtime';
import { issueLivePass, liveOn, liveSecret } from '@/lib/live';

export const dynamic = 'force-dynamic';

/**
 * POST: a signed pass to this lobby's live (Contact) round, for the phone holding
 * `x-player-token`, or for the TV with `?tv=1` (docs/maze/LIVE.md).
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const secret = liveSecret();
  if (!liveOn() || !secret)
    return Response.json(
      { error: { code: 'NO_LIVE', message: 'Contact rounds need jackdaw.lastivka.dev.' } },
      { status: 404 },
    );
  const code = (await ctx.params).code.toUpperCase();
  const tv = new URL(req.url).searchParams.get('tv') === '1';
  const out = await issueLivePass(
    getRuntime(),
    code,
    tv ? { tv: true } : { token: req.headers.get('x-player-token') },
    secret,
    Date.now(),
  );
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
}
