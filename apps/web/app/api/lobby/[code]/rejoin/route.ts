import { http } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/** Move a seat to this device. Header x-player-token; body { rejoinCode }. */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return http().rejoin(req, (await ctx.params).code);
}
