import { http } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/** Turn "your move" notifications on or off. Header x-player-token; body { subscription | null }. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return http().setPush(req, (await ctx.params).code);
}
