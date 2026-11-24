import { http } from '@/lib/runtime';
import { ensureWords } from '@/lib/words';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ code: string }> };

/** Poll the lobby. ?v=<version> returns { unchanged: true } when nothing changed. */
export async function GET(req: Request, ctx: Ctx) {
  await ensureWords();
  return http().getLobby(req, (await ctx.params).code);
}

/** Send one ClientMessage. Header x-player-token. */
export async function POST(req: Request, ctx: Ctx) {
  await ensureWords();
  return http().postLobby(req, (await ctx.params).code);
}
