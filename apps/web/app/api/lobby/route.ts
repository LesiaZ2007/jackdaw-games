import { http } from '@/lib/runtime';

export const dynamic = 'force-dynamic';

/** Create a lobby. Header x-player-token; body { name, avatar?, gameId? }. */
export function POST(req: Request) {
  return http().createLobby(req);
}
