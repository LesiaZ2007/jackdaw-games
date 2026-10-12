import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getStorage } from '@/lib/storage';

// Phase 0 smoke test: proves the site can reach room storage on the deployed server.
const Body = z.object({ message: z.string().min(1).max(200) });
const Code = z.string().regex(/^[A-Z]{4}$/);

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = Code.safeParse((await ctx.params).code);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!code.success || !body.success) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const storage = getStorage();
  const echo = { message: body.data.message, at: Date.now(), storage: storage.kind };
  await storage.set(`jackdaw:echo:${code.data}`, JSON.stringify(echo), 600);
  const stored = await storage.get(`jackdaw:echo:${code.data}`);
  return NextResponse.json({ echo: stored ? JSON.parse(stored) : null });
}
