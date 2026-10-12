import { z } from 'zod';
import type { GameResult } from './contract';

/**
 * Wire protocol shared by web and server. Changing message shapes affects every client: ask
 * owner first.
 *
 * Transport today is HTTP polling: a client POSTs one
 * ClientMessage at a time and reads back a LobbySnapshot. The plan's server→client `lobby`,
 * `view`, `results` and `error` messages are fields of that snapshot (or an ErrorBody).
 */

/** 4 letters, no ambiguous characters (no I, L, O). Digits are never used. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const LobbyCode = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(new RegExp(`^[${CODE_ALPHABET}]{4}$`), 'Lobby codes are 4 letters'));

export const PlayerName = z
  .string()
  .transform((s) => s.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Pick a name').max(20, 'Names can be up to 20 characters'));

export const Avatar = z.object({
  crest: z.string().min(1).max(32),
  tint: z.string().min(1).max(32),
});
export type Avatar = z.infer<typeof Avatar>;

export const MAX_PLAYERS = 15;
export const CHAT_LIMIT = 120;
export const REJOIN_CODE_ALPHABET = CODE_ALPHABET;

/** Messages a client can send. `type` is the discriminator. */
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: PlayerName, avatar: Avatar.optional() }),
  z.object({ type: z.literal('setGame'), gameId: z.string().min(1).max(40).nullable() }),
  z.object({ type: z.literal('setOptions'), options: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('start') }),
  z.object({
    type: z.literal('action'),
    /** The session the player was looking at; actions from an earlier game are rejected. */
    sessionId: z.string(),
    /** Last seq the player saw. Must not be ahead of the server. */
    seq: z.number().int().nonnegative(),
    action: z.unknown(),
  }),
  z.object({ type: z.literal('playAgain') }),
  z.object({ type: z.literal('backToLobby') }),
  z.object({ type: z.literal('kick'), playerId: z.string() }),
  z.object({ type: z.literal('transferHost'), playerId: z.string() }),
  z.object({ type: z.literal('leave') }),
  // Platform features carried over from Avalon (kickoff decision).
  z.object({ type: z.literal('rename'), name: PlayerName }),
  z.object({ type: z.literal('setAvatar'), avatar: Avatar }),
  z.object({ type: z.literal('chat'), text: z.string().trim().min(1).max(280) }),
  z.object({ type: z.literal('createRejoinCode') }),
  z.object({ type: z.literal('resetScores') }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Body for creating a lobby (POST /api/lobby). */
export const CreateLobbyRequest = z.object({
  name: PlayerName,
  avatar: Avatar.optional(),
  /** Set when created from the catalog, so the game is preselected. */
  gameId: z.string().min(1).max(40).optional(),
});

/** Body for moving a seat to this device with a rejoin code. */
export const RedeemRejoinRequest = z.object({
  rejoinCode: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{6}$/)),
});

export type LobbyStatus = 'waiting' | 'in_game' | 'results';

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: Avatar;
  /** Seen within the last 45 seconds. */
  online: boolean;
  joinedAt: number;
  /** False while a game they joined too late for is running (they watch the table view). */
  seated: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  text: string;
  at: number;
}

export interface HistoryEntry {
  gameId: string;
  endedAt: number;
  summary: string;
  winners: string[];
}

export interface ScoreLine {
  wins: number;
  played: number;
}

/** What one caller receives. Players get their own `view`; TVs and spectators don't. */
export interface LobbySnapshot {
  code: string;
  version: number;
  hostId: string;
  status: LobbyStatus;
  players: PublicPlayer[];
  /** TV screens seen recently. Not players. */
  displays: number;
  selectedGameId: string | null;
  gameOptions: Record<string, unknown>;
  history: HistoryEntry[];
  scores: Record<string, ScoreLine>;
  chat: ChatMessage[];
  /** The caller's player id, or null for a TV display. */
  me: string | null;
  session: { id: string; gameId: string; seq: number; startedAt: number } | null;
  /** This player's private view. Only for seated players during a game. */
  view?: unknown;
  /** Public table view. Everyone gets it during a game. */
  tableView?: unknown;
  /** Final result and full reveal, once the game is over. */
  results?: GameResult & { gameId: string };
  /** The caller's own active rejoin code, if they made one. */
  rejoinCode?: { code: string; expiresAt: number };
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'NOT_HOST'
  | 'NOT_A_PLAYER'
  | 'LOBBY_FULL'
  | 'WRONG_STATUS'
  | 'UNKNOWN_GAME'
  | 'NO_GAME'
  | 'PLAYER_COUNT'
  | 'BAD_OPTIONS'
  | 'STALE'
  | 'AVATAR_TAKEN'
  | 'RATE_LIMITED'
  | 'REJOIN_INVALID'
  // Game modules add their own codes, e.g. NOT_YOUR_TURN.
  | (string & {});

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}
