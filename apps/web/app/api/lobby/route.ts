import { http } from '@/lib/runtime';
import { ensureWords } from '@/lib/words';

export const dynamic = 'force-dynamic';

/** Create a lobby. Header x-player-token; body { name, avatar?, gameId? }. */
export async function POST(req: Request) {
  await ensureWords();
  return http().createLobby(req);
}
