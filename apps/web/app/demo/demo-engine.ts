import {
  addBot,
  applyGameAction,
  createLobby,
  nextTimerAt,
  randomSeed,
  runTimers,
  setGame,
  start,
  startBlocker,
  type Avatar,
  type Lobby,
} from '@jackdaw/engine';
import { CREST_CHOICES, TINT_CHOICES } from '@jackdaw/ui';
import { catalog, gameUis, type CatalogEntry } from '../../lib/catalog';
import { games } from '../../lib/registry';

export const DEMO_ME_ID = 'you';
export const DEFAULT_DEMO_GAME = 'uno';

const DEMO_PALETTE: Avatar[] = CREST_CHOICES.map((crest, i) => ({
  crest,
  tint: TINT_CHOICES[i % TINT_CHOICES.length]!,
}));

function canRunDemo(entry: CatalogEntry): boolean {
  if (!entry.playable || !entry.ui?.PlayerScreen) return false;
  const mod = games[entry.meta.id];
  if (!mod || !mod.bot || mod.linked) return false;
  return true;
}

/** Playable catalog games with bot support and standalone client UI, with UNO first. */
export const DEMO_GAMES: CatalogEntry[] = catalog.filter(canRunDemo).sort((a, b) => {
  if (a.meta.id === DEFAULT_DEMO_GAME) return -1;
  if (b.meta.id === DEFAULT_DEMO_GAME) return 1;
  return 0;
});

const DEMO_IDS = new Set(DEMO_GAMES.map((g) => g.meta.id));

/** Resolve a requested game id to a bot-ready demo game (falling back to UNO). */
export function resolveDemoGameId(requested?: string | null): string {
  if (requested && DEMO_IDS.has(requested)) return requested;
  return DEMO_GAMES[0]?.meta.id ?? DEFAULT_DEMO_GAME;
}

/** True when a game id can be launched directly in /demo. */
export function isDemoGame(gameId: string): boolean {
  return DEMO_IDS.has(gameId);
}

/** Build a fresh in-memory Lobby already in `in_game` with bird bots seated. */
export function createDemoLobby(gameId: string, now = Date.now()): Lobby {
  const id = resolveDemoGameId(gameId);
  const mod = games[id]!;
  const ctx = { now, games };
  const preferred = Math.max(mod.meta.minPlayers, Math.min(4, mod.meta.maxPlayers));

  let lobby = createLobby(
    {
      code: 'DEMO',
      hostId: DEMO_ME_ID,
      hostName: 'You',
      hostAvatar: DEMO_PALETTE[0]!,
      tokenKey: 'demo-you',
    },
    ctx,
  );

  while (lobby.players.length < preferred) {
    const idx = lobby.players.length;
    lobby = addBot(
      lobby,
      DEMO_ME_ID,
      { newPlayerId: `bot-${idx}`, palette: DEMO_PALETTE, pick: (idx - 1) / 14 },
      ctx,
    );
  }

  // Pick the game after bots are seated so defaultOptions() sees the real seat count.
  lobby = setGame(lobby, DEMO_ME_ID, id, ctx);

  while (startBlocker(lobby, ctx) && lobby.players.length < mod.meta.maxPlayers && gameUis[id]) {
    const idx = lobby.players.length;
    lobby = addBot(
      lobby,
      DEMO_ME_ID,
      { newPlayerId: `bot-${idx}`, palette: DEMO_PALETTE, pick: (idx - 1) / 14 },
      ctx,
    );
    lobby = setGame(lobby, DEMO_ME_ID, null, ctx);
    lobby = setGame(lobby, DEMO_ME_ID, id, ctx);
  }

  return start(lobby, DEMO_ME_ID, { sessionId: `demo-${now}-${id}`, seed: randomSeed() }, ctx);
}

/** Apply a human action inside the local demo lobby; returns the current lobby if rejected. */
export function applyDemoAction(lobby: Lobby, action: unknown, now = Date.now()): Lobby {
  const session = lobby.session;
  if (!session || lobby.status !== 'in_game') return lobby;
  try {
    return applyGameAction(
      lobby,
      DEMO_ME_ID,
      { sessionId: session.id, seq: session.seq, action },
      { now, games },
    );
  } catch {
    return lobby;
  }
}

/** Advance any due game timers and bot moves using the shared engine loop. */
export function tickDemoLobby(lobby: Lobby, now = Date.now()): Lobby {
  if (lobby.status !== 'in_game' || !lobby.session) return lobby;
  return runTimers(lobby, { now, games });
}

/** Return the next epoch ms timestamp when a timer or bot needs a tick, or null. */
export function nextDemoAt(lobby: Lobby, now = Date.now()): number | null {
  return nextTimerAt(lobby, { now, games });
}
