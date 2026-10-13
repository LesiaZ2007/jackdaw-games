import { http } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/** The lobby's full game record and stats, for the Game stats menu. */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return http().getStats(req, (await ctx.params).code);
}
