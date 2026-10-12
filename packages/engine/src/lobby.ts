import type { AnyGameModule, GameRegistry, GameResult } from './contract';
import { GameError } from './errors';
import {
  CHAT_LIMIT,
  MAX_PLAYERS,
  type Avatar,
  type ChatMessage,
  type HistoryEntry,
  type LobbySnapshot,
  type LobbyStatus,
  type ScoreLine,
} from './protocol';
import { createRng } from './rng';

/**
 * The lobby state machine: pure functions from (lobby, input) to a new lobby. No I/O, no clocks,
 * no randomness of its own. The caller passes `now`, fresh ids and seeds. Every function returns
 * a new object and never mutates its input. Changing transitions affects every game: ask Lesia
 * first (see CLAUDE.md).
 */

export interface Player {
  id: string;
  name: string;
  avatar: Avatar;
  joinedAt: number;
}

export interface Session {
  id: string;
  gameId: string;
  /** Seated players for this game, in seat order. */
  playerIds: string[];
  /** The game's private full state. Never sent to clients. */
  state: unknown;
  /** Increments on every accepted action. */
  seq: number;
  startedAt: number;
  rngState: number;
}

export interface Lobby {
  code: string;
  /** Increments on every change; clients poll with it. */
  version: number;
  createdAt: number;
  lastActivityAt: number;
  hostId: string;
  /** Seat order. */
  players: Player[];
  /** Secret: hashed device token → player id. Never sent to clients. */
  seats: Record<string, string>;
  status: LobbyStatus;
  selectedGameId: string | null;
  gameOptions: Record<string, unknown>;
  session: Session | null;
  results: (GameResult & { gameId: string }) | null;
  history: HistoryEntry[];
  scores: Record<string, ScoreLine>;
  chat: ChatMessage[];
  /** Secret: rejoin code → whose seat it moves, and when it expires. */
  rejoinCodes: Record<string, { playerId: string; expiresAt: number }>;
}

export const HOST_AWAY_MS = 60_000;
export const ONLINE_WINDOW_MS = 45_000;
export const REJOIN_CODE_TTL_MS = 10 * 60_000;
export const HISTORY_LIMIT = 30;

/** Last-seen times by player id (and `tv:<id>` for displays), kept outside the lobby document. */
export type Presence = Record<string, number>;

export interface Ctx {
  now: number;
  games: GameRegistry;
}

const fail = (code: string, message: string): never => {
  throw new GameError(code, message);
};

function touch(lobby: Lobby, now: number): Lobby {
  return { ...lobby, version: lobby.version + 1, lastActivityAt: now };
}

function requireHost(lobby: Lobby, playerId: string) {
  if (lobby.hostId !== playerId) fail('NOT_HOST', 'Only the host can do that.');
}

function requireStatus(lobby: Lobby, ...allowed: LobbyStatus[]) {
  if (!allowed.includes(lobby.status)) {
    const why: Record<LobbyStatus, string> = {
      waiting: 'the lobby is waiting',
      in_game: 'a game is running',
      results: 'the results are showing',
    };
    fail('WRONG_STATUS', `You can't do that while ${why[lobby.status]}.`);
  }
}

function requirePlayer(lobby: Lobby, playerId: string): Player {
  return (
    lobby.players.find((p) => p.id === playerId) ??
    fail('NOT_A_PLAYER', 'You are not in this lobby.')
  );
}

function gameFor(ctx: Ctx, gameId: string | null): AnyGameModule {
  if (!gameId) return fail('NO_GAME', 'Pick a game first.');
  return ctx.games[gameId] ?? fail('UNKNOWN_GAME', 'That game is not available.');
}

/** Pick an avatar no one else has, preferring the requested one. */
function freeAvatar(lobby: Lobby, wanted: Avatar | undefined, palette: Avatar[]): Avatar {
  const taken = (a: Avatar) =>
    lobby.players.some((p) => p.avatar.crest === a.crest || p.avatar.tint === a.tint);
  if (wanted && !taken(wanted)) return wanted;
  return (
    palette.find((a) => !taken(a)) ?? wanted ?? palette[0] ?? { crest: 'jackdaw', tint: 'ink' }
  );
}

// ── Creating and joining ────────────────────────────────────────────────────────────────────

export interface NewLobbyInput {
  code: string;
  hostId: string;
  hostName: string;
  hostAvatar: Avatar;
  tokenKey: string;
  gameId?: string;
}

/** A new lobby with its creator as host. Coming from the catalog preselects `gameId`. */
export function createLobby(input: NewLobbyInput, ctx: Ctx): Lobby {
  let lobby: Lobby = {
    code: input.code,
    version: 1,
    createdAt: ctx.now,
    lastActivityAt: ctx.now,
    hostId: input.hostId,
    players: [
      { id: input.hostId, name: input.hostName, avatar: input.hostAvatar, joinedAt: ctx.now },
    ],
    seats: { [input.tokenKey]: input.hostId },
    status: 'waiting',
    selectedGameId: null,
    gameOptions: {},
    session: null,
    results: null,
    history: [],
    scores: {},
    chat: [],
    rejoinCodes: {},
  };
  if (input.gameId) lobby = setGame(lobby, input.hostId, input.gameId, ctx);
  return lobby;
}

export function playerIdForToken(lobby: Lobby, tokenKey: string): string | null {
  return lobby.seats[tokenKey] ?? null;
}

export interface JoinInput {
  tokenKey: string;
  /** Used only when this token has no seat yet. */
  newPlayerId: string;
  name: string;
  avatar?: Avatar;
  /** Avatars to fall back on when the requested one is taken. */
  palette: Avatar[];
}

/**
 * A device joins. A token that already has a seat reclaims it, even mid-game. A new token takes
 * the next seat. During a game, newcomers watch the table and are seated at the next game.
 */
export function join(lobby: Lobby, input: JoinInput, ctx: Ctx): { lobby: Lobby; playerId: string } {
  const existing = playerIdForToken(lobby, input.tokenKey);
  if (existing) return { lobby, playerId: existing };
  if (lobby.players.length >= MAX_PLAYERS)
    fail('LOBBY_FULL', `This lobby is full (${MAX_PLAYERS} players).`);
  const player: Player = {
    id: input.newPlayerId,
    name: input.name,
    avatar: freeAvatar(lobby, input.avatar, input.palette),
    joinedAt: ctx.now,
  };
  const next = touch(
    {
      ...lobby,
      players: [...lobby.players, player],
      seats: { ...lobby.seats, [input.tokenKey]: player.id },
    },
    ctx.now,
  );
  return { lobby: next, playerId: player.id };
}

/** Remove a player outright (leave or kick). Only outside games, so no game loses a seat. */
function removePlayer(lobby: Lobby, playerId: string, ctx: Ctx): Lobby {
  const players = lobby.players.filter((p) => p.id !== playerId);
  const seats = Object.fromEntries(Object.entries(lobby.seats).filter(([, id]) => id !== playerId));
  const rejoinCodes = Object.fromEntries(
    Object.entries(lobby.rejoinCodes).filter(([, r]) => r.playerId !== playerId),
  );
  let hostId = lobby.hostId;
  if (hostId === playerId && players.length > 0) {
    hostId = players.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a)).id;
  }
  return touch({ ...lobby, players, seats, rejoinCodes, hostId }, ctx.now);
}

export function leave(lobby: Lobby, playerId: string, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  if (lobby.status === 'in_game' && lobby.session?.playerIds.includes(playerId)) {
    fail('WRONG_STATUS', 'You can leave once this game ends. Closing the tab keeps your seat.');
  }
  return removePlayer(lobby, playerId, ctx);
}

export function kick(lobby: Lobby, hostId: string, playerId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requirePlayer(lobby, playerId);
  if (playerId === hostId) fail('BAD_REQUEST', "You can't remove yourself. Use Leave instead.");
  if (lobby.status === 'in_game' && lobby.session?.playerIds.includes(playerId)) {
    fail('WRONG_STATUS', 'Players in the current game can be removed once it ends.');
  }
  return removePlayer(lobby, playerId, ctx);
}

export function transferHost(lobby: Lobby, hostId: string, playerId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requirePlayer(lobby, playerId);
  if (playerId === hostId) return lobby;
  return touch({ ...lobby, hostId: playerId }, ctx.now);
}

/**
 * If the host has been away for more than 60 seconds, hand host to the longest-connected
 * player who is online now. Returns the same object when nothing changes.
 */
export function reassignHostIfAway(lobby: Lobby, presence: Presence, ctx: Ctx): Lobby {
  const seen = (id: string) => presence[id] ?? 0;
  if (ctx.now - seen(lobby.hostId) <= HOST_AWAY_MS) return lobby;
  const online = lobby.players.filter(
    (p) => p.id !== lobby.hostId && ctx.now - seen(p.id) <= ONLINE_WINDOW_MS,
  );
  if (online.length === 0) return lobby;
  const next = online.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a));
  return touch({ ...lobby, hostId: next.id }, ctx.now);
}

export function rename(lobby: Lobby, playerId: string, name: string, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  return touch(
    { ...lobby, players: lobby.players.map((p) => (p.id === playerId ? { ...p, name } : p)) },
    ctx.now,
  );
}

export function setAvatar(lobby: Lobby, playerId: string, avatar: Avatar, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  const clash = lobby.players.find(
    (p) => p.id !== playerId && (p.avatar.crest === avatar.crest || p.avatar.tint === avatar.tint),
  );
  if (clash)
    fail(
      'AVATAR_TAKEN',
      `${clash.name} already has that ${clash.avatar.crest === avatar.crest ? 'crest' : 'colour'}.`,
    );
  return touch(
    { ...lobby, players: lobby.players.map((p) => (p.id === playerId ? { ...p, avatar } : p)) },
    ctx.now,
  );
}

// ── Chat and rejoin codes ───────────────────────────────────────────────────────────────────

export function chat(
  lobby: Lobby,
  playerId: string,
  text: string,
  messageId: string,
  ctx: Ctx,
): Lobby {
  requirePlayer(lobby, playerId);
  const message: ChatMessage = { id: messageId, playerId, text, at: ctx.now };
  return touch({ ...lobby, chat: [...lobby.chat, message].slice(-CHAT_LIMIT) }, ctx.now);
}

/** A one-time code that moves this player's seat to another device. Replaces any older code. */
export function createRejoinCode(lobby: Lobby, playerId: string, code: string, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  const rejoinCodes = Object.fromEntries(
    Object.entries(lobby.rejoinCodes).filter(
      ([, r]) => r.playerId !== playerId && r.expiresAt > ctx.now,
    ),
  );
  rejoinCodes[code] = { playerId, expiresAt: ctx.now + REJOIN_CODE_TTL_MS };
  return touch({ ...lobby, rejoinCodes }, ctx.now);
}

/** Moves the seat to `tokenKey`. The old device loses it. */
export function redeemRejoinCode(
  lobby: Lobby,
  code: string,
  tokenKey: string,
  ctx: Ctx,
): { lobby: Lobby; playerId: string } {
  const entry = lobby.rejoinCodes[code];
  if (!entry || entry.expiresAt <= ctx.now || !lobby.players.some((p) => p.id === entry.playerId)) {
    fail('REJOIN_INVALID', 'That rejoin code is wrong or has expired.');
  }
  const { playerId } = entry!;
  const seats = Object.fromEntries(Object.entries(lobby.seats).filter(([, id]) => id !== playerId));
  seats[tokenKey] = playerId;
  const rejoinCodes = { ...lobby.rejoinCodes };
  delete rejoinCodes[code];
  return { lobby: touch({ ...lobby, seats, rejoinCodes }, ctx.now), playerId };
}

// ── Choosing and running a game ─────────────────────────────────────────────────────────────

/** Host picks a game (or clears it). Options reset to that game's defaults for this many players. */
export function setGame(lobby: Lobby, hostId: string, gameId: string | null, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'waiting');
  if (gameId === null) return touch({ ...lobby, selectedGameId: null, gameOptions: {} }, ctx.now);
  const game = gameFor(ctx, gameId);
  if (gameId === lobby.selectedGameId) return lobby;
  return touch(
    { ...lobby, selectedGameId: gameId, gameOptions: game.defaultOptions(lobby.players.length) },
    ctx.now,
  );
}

export function setOptions(
  lobby: Lobby,
  hostId: string,
  options: Record<string, unknown>,
  ctx: Ctx,
): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'waiting');
  const game = gameFor(ctx, lobby.selectedGameId);
  const parsed = game.optionsSchema.safeParse(options);
  if (!parsed.success)
    fail('BAD_OPTIONS', parsed.error.issues[0]?.message ?? 'Those options are not valid.');
  return touch({ ...lobby, gameOptions: parsed.data as Record<string, unknown> }, ctx.now);
}

/** Why the selected game can't start with the current players and options, or null if it can. */
export function startBlocker(lobby: Lobby, ctx: Pick<Ctx, 'games'>): string | null {
  if (!lobby.selectedGameId) return 'Pick a game first.';
  const game = ctx.games[lobby.selectedGameId];
  if (!game) return 'That game is not available.';
  const n = lobby.players.length;
  const { minPlayers, maxPlayers } = game.meta;
  if (n < minPlayers || n > maxPlayers) {
    return minPlayers === maxPlayers
      ? `Needs exactly ${minPlayers} players.`
      : `Needs ${minPlayers} to ${maxPlayers} players.`;
  }
  const parsed = game.optionsSchema.safeParse(lobby.gameOptions);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Those options are not valid.';
  return game.validateOptions?.(parsed.data, n) ?? null;
}

export interface StartInput {
  sessionId: string;
  seed: number;
}

export function start(lobby: Lobby, hostId: string, input: StartInput, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'waiting');
  return beginSession(lobby, input, ctx);
}

function beginSession(lobby: Lobby, input: StartInput, ctx: Ctx): Lobby {
  const blocker = startBlocker(lobby, ctx);
  if (blocker) fail('PLAYER_COUNT', blocker);
  const game = gameFor(ctx, lobby.selectedGameId);
  const options = game.optionsSchema.parse(lobby.gameOptions);
  const rng = createRng(input.seed);
  const playerIds = lobby.players.map((p) => p.id);
  const state = game.setup({ playerIds, options, rng });
  const session: Session = {
    id: input.sessionId,
    gameId: game.meta.id,
    playerIds,
    state,
    seq: 0,
    startedAt: ctx.now,
    rngState: rng.state,
  };
  // A game can be over immediately in principle; handle it the same way as after an action.
  return finishIfOver(touch({ ...lobby, status: 'in_game', session, results: null }, ctx.now), ctx);
}

export interface ActionInput {
  sessionId: string;
  seq: number;
  action: unknown;
}

/**
 * A seated player acts in the running game. The action is validated with the game's schema,
 * then the game's own rules decide whether it's legal right now.
 *
 * Staleness: actions from an earlier session (a late tap after Play again) or claiming a seq the
 * server hasn't reached are rejected. Within one session, ordering is left to the game's rules,
 * because rejecting every seq behind the latest would reject simultaneous votes.
 */
export function applyGameAction(
  lobby: Lobby,
  playerId: string,
  input: ActionInput,
  ctx: Ctx,
): Lobby {
  requireStatus(lobby, 'in_game');
  const session = lobby.session!;
  if (input.sessionId !== session.id || input.seq > session.seq) {
    fail('STALE', 'That game has moved on. Try again.');
  }
  if (!session.playerIds.includes(playerId))
    fail('NOT_A_PLAYER', "You're watching this game. You'll be seated in the next one.");
  const game = gameFor(ctx, session.gameId);
  const parsed = game.actionSchema.safeParse(input.action);
  if (!parsed.success) fail('BAD_REQUEST', "That move isn't understood.");
  const rng = createRng(session.rngState);
  const state = game.applyAction(session.state, playerId, parsed.data, rng);
  const next = touch(
    { ...lobby, session: { ...session, state, seq: session.seq + 1, rngState: rng.state } },
    ctx.now,
  );
  return finishIfOver(next, ctx);
}

function finishIfOver(lobby: Lobby, ctx: Ctx): Lobby {
  const session = lobby.session;
  if (!session) return lobby;
  const result = gameFor(ctx, session.gameId).getResult(session.state);
  return result ? endGame(lobby, result, ctx) : lobby;
}

/** Move to results: record history and scores, keep the selected game and options. */
export function endGame(lobby: Lobby, result: GameResult, ctx: Ctx): Lobby {
  requireStatus(lobby, 'in_game');
  const session = lobby.session!;
  const scores = { ...lobby.scores };
  for (const id of session.playerIds) {
    const line = scores[id] ?? { wins: 0, played: 0 };
    scores[id] = {
      wins: line.wins + (result.winners.includes(id) ? 1 : 0),
      played: line.played + 1,
    };
  }
  const entry: HistoryEntry = {
    gameId: session.gameId,
    endedAt: ctx.now,
    summary: result.summary,
    winners: result.winners,
  };
  return touch(
    {
      ...lobby,
      status: 'results',
      session: null,
      results: { ...result, gameId: session.gameId },
      history: [entry, ...lobby.history].slice(0, HISTORY_LIMIT),
      scores,
    },
    ctx.now,
  );
}

/** Back to waiting with the same game and options selected. */
export function backToLobby(lobby: Lobby, hostId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'results');
  return touch({ ...lobby, status: 'waiting', results: null }, ctx.now);
}

/** Back to waiting, then start straight away if the same game still fits. */
export function playAgain(lobby: Lobby, hostId: string, input: StartInput, ctx: Ctx): Lobby {
  const waiting = backToLobby(lobby, hostId, ctx);
  return startBlocker(waiting, ctx) ? waiting : beginSession(waiting, input, ctx);
}

export function resetScores(lobby: Lobby, hostId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  return touch({ ...lobby, scores: {} }, ctx.now);
}

// ── What each caller sees ───────────────────────────────────────────────────────────────────

/**
 * The snapshot for one caller. `viewerId` is a player id, or null for a TV display.
 * This, and the game's getPlayerView/getTableView, are the only gates on hidden information:
 * seats, rejoin codes and session state never leave this function.
 */
export function snapshotFor(
  lobby: Lobby,
  viewerId: string | null,
  presence: Presence,
  ctx: Ctx,
): LobbySnapshot {
  const session = lobby.session;
  const seatedIds = new Set(session?.playerIds ?? lobby.players.map((p) => p.id));
  const displays = Object.entries(presence).filter(
    ([id, at]) => id.startsWith('tv:') && ctx.now - at <= ONLINE_WINDOW_MS,
  ).length;
  const snapshot: LobbySnapshot = {
    code: lobby.code,
    version: lobby.version,
    hostId: lobby.hostId,
    status: lobby.status,
    players: lobby.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      joinedAt: p.joinedAt,
      online: ctx.now - (presence[p.id] ?? 0) <= ONLINE_WINDOW_MS,
      seated: lobby.status !== 'in_game' || seatedIds.has(p.id),
    })),
    displays,
    selectedGameId: lobby.selectedGameId,
    gameOptions: lobby.gameOptions,
    history: lobby.history,
    scores: lobby.scores,
    chat: lobby.chat,
    me: viewerId,
    session: session
      ? { id: session.id, gameId: session.gameId, seq: session.seq, startedAt: session.startedAt }
      : null,
  };
  if (session && lobby.status === 'in_game') {
    const game = gameFor(ctx, session.gameId);
    snapshot.tableView = game.getTableView(session.state);
    if (viewerId && session.playerIds.includes(viewerId)) {
      snapshot.view = game.getPlayerView(session.state, viewerId);
    }
  }
  if (lobby.status === 'results' && lobby.results) snapshot.results = lobby.results;
  if (viewerId) {
    const mine = Object.entries(lobby.rejoinCodes).find(
      ([, r]) => r.playerId === viewerId && r.expiresAt > ctx.now,
    );
    if (mine) snapshot.rejoinCode = { code: mine[0], expiresAt: mine[1].expiresAt };
  }
  return snapshot;
}
