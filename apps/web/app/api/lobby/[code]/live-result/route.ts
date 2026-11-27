import { getRuntime } from '@/lib/runtime';
import { liveSecret, takeLiveResult } from '@/lib/live';

export const dynamic = 'force-dynamic';

/** POST: a live room's signed report (only the Durable Object knows the secret). */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const secret = liveSecret();
  if (!secret)
    return Response.json({ error: { code: 'NO_LIVE', message: 'Off.' } }, { status: 404 });
  const code = (await ctx.params).code.toUpperCase();
  const out = await takeLiveResult(
    getRuntime(),
    code,
    await req.text(),
    req.headers.get('x-live-signature'),
    secret,
  );
  return Response.json(out.body, { status: out.status });
}
