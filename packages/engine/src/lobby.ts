import type {
  AnyGameModule,
  GameRegistry,
  GameResult,
  LinkStatus,
  Reaction,
  Standing,
} from './contract';
import { GameError } from './errors';
import {
  CHAT_LIMIT,
  MAX_PLAYERS,
  REACTION_GAP_MS,
  REACTION_MS,
  type Avatar,
  type ChatMessage,
  type HistoryEntry,
  type LobbySnapshot,
  type LobbyStatus,
  type ReactionKind,
  type ScoreLine,
} from './protocol';
import { createRng, type Rng } from './rng';

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
  /** A computer player the host added (see GameModule.bot). It has no device and no seat key. */
  bot?: true;
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
  /** When the game last moved (an action, a timer or a bot), so bots wait a moment after it. */
  movedAt?: number;
  /** Bots whose move the game refused at this seq: they sit it out until the game moves on. */
  botFailed?: { seq: number; ids: string[] };
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
  /** Recent reactions, at most one per player. Older lobby documents may not have it. */
  reactions?: Reaction[];
  /** Secret: rejoin code → whose seat it moves, and when it expires. */
  rejoinCodes: Record<string, { playerId: string; expiresAt: number }>;
}

export const HOST_AWAY_MS = 60_000;
export const ONLINE_WINDOW_MS = 45_000;
export const REJOIN_CODE_TTL_MS = 10 * 60_000;
export const HISTORY_LIMIT = 200;
/** How many recent games each poll carries. */
export const SNAPSHOT_HISTORY = 10;

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

/**
 * Posts system lines in chat. Write players as `{playerId}`; their names now are kept with the
 * line so it still reads right after they leave. Ids are unique: the version only grows, and
 * within one version the chat only grows.
 */
function say(lobby: Lobby, lines: string[], now: number): Lobby {
  if (lines.length === 0) return lobby;
  const known = new Map(lobby.players.map((p) => [p.id, p.name]));
  const messages = lines.map((text, i): ChatMessage => {
    const names: Record<string, string> = {};
    for (const [, id] of text.matchAll(/\{([A-Za-z0-9_-]+)\}/g)) {
      const name = known.get(id!);
      if (name) names[id!] = name;
    }
    return {
      id: `sys-${lobby.version}-${lobby.chat.length + i}`,
      system: true,
      text,
      at: now,
      ...(Object.keys(names).length > 0 ? { names } : {}),
    };
  });
  return { ...lobby, chat: [...lobby.chat, ...messages].slice(-CHAT_LIMIT) };
}

/**
 * Why this name can't be used, or null if it can: someone other than `playerId` already has it,
 * ignoring case and spacing. Screens use it to explain before sending.
 */
export function nameClash(
  players: { id: string; name: string }[],
  name: string,
  playerId?: string | null,
): string | null {
  const wanted = name.replace(/\s+/g, ' ').trim().toLowerCase();
  const clash = players.find((p) => p.id !== playerId && p.name.toLowerCase() === wanted);
  return clash ? `Someone at the table is already called ${clash.name}.` : null;
}

function requireFreeName(lobby: Lobby, name: string, playerId?: string) {
  const why = nameClash(lobby.players, name, playerId);
  if (why) fail('NAME_TAKEN', why);
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

/**
 * Pick an avatar no one else has, preferring the requested one: first one whose crest and tint
 * are both free, then a free crest with a free tint from the palette (players who chose their own
 * can use up palette pairs), then any crest and tint pair no one has.
 */
function freeAvatar(lobby: Lobby, wanted: Avatar | undefined, palette: Avatar[]): Avatar {
  const crests = new Set(lobby.players.map((p) => p.avatar.crest));
  const tints = new Set(lobby.players.map((p) => p.avatar.tint));
  const taken = (a: Avatar) => crests.has(a.crest) || tints.has(a.tint);
  if (wanted && !taken(wanted)) return wanted;
  const fromPalette = palette.find((a) => !taken(a));
  if (fromPalette) return fromPalette;
  const freeCrest = palette.find((a) => !crests.has(a.crest))?.crest;
  const freeTint = palette.find((a) => !tints.has(a.tint))?.tint;
  if (freeCrest && freeTint) return { crest: freeCrest, tint: freeTint };
  const same = (a: Avatar, b: Avatar) => a.crest === b.crest && a.tint === b.tint;
  for (const { crest } of palette) {
    for (const { tint } of palette) {
      const pair = { crest, tint };
      if (!lobby.players.some((p) => same(p.avatar, pair))) return pair;
    }
  }
  return wanted ?? palette[0] ?? { crest: 'jackdaw', tint: 'ink' };
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
  requireFreeName(lobby, input.name);
  // Everyone left (so the host is gone too): whoever comes in next runs the lobby.
  const hostless = !lobby.players.some((p) => p.id === lobby.hostId);
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
      hostId: hostless ? player.id : lobby.hostId,
    },
    ctx.now,
  );
  return { lobby: say(next, [`{${player.id}} joined.`], ctx.now), playerId: player.id };
}

/** Names for computer players, handed out in order: "Bot Wren", "Bot Rook"… */
export const BOT_NAMES = [
  'Wren',
  'Rook',
  'Magpie',
  'Robin',
  'Finch',
  'Heron',
  'Starling',
  'Linnet',
  'Plover',
  'Kestrel',
  'Lark',
  'Thrush',
  'Siskin',
  'Curlew',
  'Dunnock',
].map((bird) => `Bot ${bird}`);

/**
 * The host seats a computer player in the next free seat (Lesia, 2026-10-24). It plays through
 * the chosen game's `bot`; the host removes it like anyone else.
 */
export function addBot(
  lobby: Lobby,
  hostId: string,
  input: { newPlayerId: string; palette: Avatar[] },
  ctx: Ctx,
): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'waiting');
  if (lobby.players.length >= MAX_PLAYERS)
    fail('LOBBY_FULL', `This lobby is full (${MAX_PLAYERS} players).`);
  const game = lobby.selectedGameId ? ctx.games[lobby.selectedGameId] : undefined;
  if (game && !game.bot)
    fail('NO_BOTS', `${game.meta.name} can’t be played with computer players yet.`);
  const name =
    BOT_NAMES.find((n) => !nameClash(lobby.players, n)) ?? `Bot ${lobby.players.length + 1}`;
  const player: Player = {
    id: input.newPlayerId,
    name,
    avatar: freeAvatar(lobby, undefined, input.palette),
    joinedAt: ctx.now,
    bot: true,
  };
  const next = touch({ ...lobby, players: [...lobby.players, player] }, ctx.now);
  return say(next, [`{${player.id}} sat down to play.`], ctx.now);
}

/** Remove a player outright (leave or kick). Only outside games, so no game loses a seat. */
function removePlayer(lobby: Lobby, playerId: string, ctx: Ctx): Lobby {
  let players = lobby.players.filter((p) => p.id !== playerId);
  // Bots don't keep a lobby going on their own.
  if (!players.some((p) => !p.bot)) players = [];
  const seats = Object.fromEntries(Object.entries(lobby.seats).filter(([, id]) => id !== playerId));
  const rejoinCodes = Object.fromEntries(
    Object.entries(lobby.rejoinCodes).filter(([, r]) => r.playerId !== playerId),
  );
  let hostId = lobby.hostId;
  const people = players.filter((p) => !p.bot);
  if (hostId === playerId && people.length > 0) {
    hostId = people.reduce((a, b) => (b.joinedAt < a.joinedAt ? b : a)).id;
  }
  return touch({ ...lobby, players, seats, rejoinCodes, hostId }, ctx.now);
}

export function leave(lobby: Lobby, playerId: string, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  if (lobby.status === 'in_game' && lobby.session?.playerIds.includes(playerId)) {
    fail('WRONG_STATUS', 'You can leave once this game ends. Closing the tab keeps your seat.');
  }
  const after = removePlayer(say(lobby, [`{${playerId}} left.`], ctx.now), playerId, ctx);
  return after.hostId !== lobby.hostId && after.players.length > 0
    ? say(after, [`{${after.hostId}} is now the host.`], ctx.now)
    : after;
}

export function kick(lobby: Lobby, hostId: string, playerId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requirePlayer(lobby, playerId);
  if (playerId === hostId) fail('BAD_REQUEST', "You can't remove yourself. Use Leave instead.");
  if (lobby.status === 'in_game' && lobby.session?.playerIds.includes(playerId)) {
    fail('WRONG_STATUS', 'Players in the current game can be removed once it ends.');
  }
  return removePlayer(
    say(lobby, [`{${playerId}} was removed by the host.`], ctx.now),
    playerId,
    ctx,
  );
}

export function transferHost(lobby: Lobby, hostId: string, playerId: string, ctx: Ctx): Lobby {
  requireHost(lobby, hostId);
  requirePlayer(lobby, playerId);
  if (playerId === hostId) return lobby;
  if (lobby.players.find((p) => p.id === playerId)?.bot)
    fail('BAD_REQUEST', 'A computer player can’t be the host.');
  return say(
    touch({ ...lobby, hostId: playerId }, ctx.now),
    [`{${playerId}} is now the host.`],
    ctx.now,
  );
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
  return say(
    touch({ ...lobby, hostId: next.id }, ctx.now),
    [`{${next.id}} is now the host.`],
    ctx.now,
  );
}

export function rename(lobby: Lobby, playerId: string, name: string, ctx: Ctx): Lobby {
  requirePlayer(lobby, playerId);
  requireFreeName(lobby, name, playerId);
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

/** Reactions still on the table at `now`. */
export function liveReactions(lobby: Lobby, now: number): Reaction[] {
  return (lobby.reactions ?? []).filter((r) => now - r.at < REACTION_MS);
}

/**
 * A quick reaction that pops over this player's seat for everyone. Each player has at most one
 * on the table; sending again within 800ms is quietly ignored, as in Avalon.
 */
export function react(
  lobby: Lobby,
  playerId: string,
  kind: ReactionKind,
  reactionId: string,
  ctx: Ctx,
): Lobby {
  requirePlayer(lobby, playerId);
  const live = liveReactions(lobby, ctx.now);
  const last = live.find((r) => r.playerId === playerId);
  if (last && ctx.now - last.at < REACTION_GAP_MS) return lobby;
  const reaction: Reaction = { id: reactionId, playerId, kind, at: ctx.now };
  return touch(
    { ...lobby, reactions: [...live.filter((r) => r.playerId !== playerId), reaction] },
    ctx.now,
  );
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
  // A device holds one seat. Taking another would strand its old one with no device behind it.
  const current = playerIdForToken(lobby, tokenKey);
  if (current === playerId) return { lobby, playerId };
  if (current) {
    const name = lobby.players.find((p) => p.id === current)?.name ?? 'someone';
    fail('REJOIN_INVALID', `This device is already ${name} here. Leave first, then use the code.`);
  }
  const seats = Object.fromEntries(Object.entries(lobby.seats).filter(([, id]) => id !== playerId));
  seats[tokenKey] = playerId;
  const rejoinCodes = { ...lobby.rejoinCodes };
  delete rejoinCodes[code];
  const next = touch({ ...lobby, seats, rejoinCodes }, ctx.now);
  return { lobby: say(next, [`{${playerId}} is back, on a new device.`], ctx.now), playerId };
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

/**
 * The lobby's options for a game, with the game's defaults filling any it doesn't have, so a
 * lobby saved before a game gained an option still starts (and shows the new option's default).
 */
function optionsWithDefaults(lobby: Lobby, game: AnyGameModule): Record<string, unknown> {
  return { ...game.defaultOptions(lobby.players.length), ...lobby.gameOptions };
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
  const parsed = game.optionsSchema.safeParse({ ...optionsWithDefaults(lobby, game), ...options });
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
  if (!game.bot && lobby.players.some((p) => p.bot))
    return `${game.meta.name} can’t be played with computer players yet. Remove them first.`;
  const parsed = game.optionsSchema.safeParse(optionsWithDefaults(lobby, game));
  if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Those options are not valid.';
  return game.validateOptions?.(parsed.data, n) ?? null;
}

export interface StartInput {
  sessionId: string;
  seed: number;
  /** For a linked game: what the runtime's `GameLink.start` returned. */
  linked?: unknown;
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
  const options = game.optionsSchema.parse(optionsWithDefaults(lobby, game));
  if (game.linked && input.linked === undefined)
    fail('NOT_SET_UP', `${game.meta.name} isn't set up on this server yet.`);
  const rng = createRng(input.seed);
  const playerIds = lobby.players.map((p) => p.id);
  const state = game.setup({ playerIds, options, rng, now: ctx.now, linked: input.linked });
  const session: Session = {
    id: input.sessionId,
    gameId: game.meta.id,
    playerIds,
    state,
    seq: 0,
    startedAt: ctx.now,
    rngState: rng.state,
    movedAt: ctx.now,
  };
  const started = say(
    touch({ ...lobby, status: 'in_game', session, results: null }, ctx.now),
    [`${game.meta.name} started.`, ...(game.announce?.(null, state) ?? [])],
    ctx.now,
  );
  // A game can be over immediately in principle; handle it the same way as after an action.
  return finishIfOver(started, ctx);
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
  const state = game.applyAction(session.state, playerId, parsed.data, rng, ctx.now);
  return finishIfOver(moved(lobby, game, state, rng.state, ctx), ctx);
}

/** The session after a move: the new state, seq and rng, and the game's chat lines for it. */
function moved(
  lobby: Lobby,
  game: AnyGameModule,
  state: unknown,
  rngState: number,
  ctx: Ctx,
): Lobby {
  const session = lobby.session!;
  const { botFailed: _, ...rest } = session;
  return say(
    touch(
      {
        ...lobby,
        session: { ...rest, state, seq: session.seq + 1, rngState, movedAt: ctx.now },
      },
      ctx.now,
    ),
    game.announce?.(session.state, state) ?? [],
    ctx.now,
  );
}

/** Who the running game is waiting on (see GameModule.waitingOn); empty between games. */
export function waitingFor(lobby: Lobby, ctx: Pick<Ctx, 'games'>): string[] {
  const session = lobby.session;
  if (lobby.status !== 'in_game' || !session) return [];
  return ctx.games[session.gameId]?.waitingOn?.(session.state) ?? [];
}

/** At most this many timers fire in one go, in case a game keeps scheduling ones already due. */
const TIMER_BURST = 20;

/** How long a bot waits after the last move before making its own, unless the game says. */
export const BOT_DELAY_MS = 1_100;

/**
 * The first bot (in seat order) with a move to make in the running game, and the move, decided
 * from that bot's own view at `now`. `rng` is where the decision left the session's rng, so the
 * move is applied with the same draws. Null when no bot has anything to do.
 */
function botMove(lobby: Lobby, ctx: Ctx): { id: string; action: unknown; rng: Rng } | null {
  const session = lobby.session;
  if (lobby.status !== 'in_game' || !session) return null;
  const game = ctx.games[session.gameId];
  if (!game?.bot) return null;
  const bots = new Set(lobby.players.filter((p) => p.bot).map((p) => p.id));
  const failed = session.botFailed?.seq === session.seq ? session.botFailed.ids : [];
  const tableView = game.getTableView(session.state);
  for (const id of session.playerIds) {
    if (!bots.has(id) || failed.includes(id)) continue;
    const rng = createRng(session.rngState);
    const action = game.bot({
      playerId: id,
      playerIds: session.playerIds,
      view: game.getPlayerView(session.state, id),
      tableView,
      rng,
      now: ctx.now,
    });
    if (action != null) return { id, action, rng };
  }
  return null;
}

/** When a bot will next move (server time), or null if none has anything to do. */
function nextBotAt(lobby: Lobby, ctx: Pick<Ctx, 'games'> & { now?: number }): number | null {
  const session = lobby.session;
  if (lobby.status !== 'in_game' || !session) return null;
  const game = ctx.games[session.gameId];
  if (!game?.bot || !lobby.players.some((p) => p.bot)) return null;
  const at = (session.movedAt ?? session.startedAt) + (game.botDelayMs ?? BOT_DELAY_MS);
  return botMove(lobby, { games: ctx.games, now: Math.max(at, ctx.now ?? 0) }) ? at : null;
}

/**
 * When the running game next needs a nudge (server time): its next timer, or a bot's move,
 * whichever comes first. Null if it has neither.
 */
export function nextTimerAt(
  lobby: Lobby,
  ctx: Pick<Ctx, 'games'> & { now?: number },
): number | null {
  const session = lobby.session;
  if (lobby.status !== 'in_game' || !session) return null;
  const timer = ctx.games[session.gameId]?.nextTimer?.(session.state)?.at ?? null;
  const bot = nextBotAt(lobby, ctx);
  if (timer === null) return bot;
  return bot === null ? timer : Math.min(timer, bot);
}

/**
 * Fires every game timer that is due, then lets one bot move if its moment has come (there are no
 * alarms on Vercel, so the runtime calls this on reads and writes). Each counts as a move: the seq
 * goes up, the game may announce it, and the game can end. Returns the same lobby when nothing was
 * due.
 */
export function runTimers(lobby: Lobby, ctx: Ctx): Lobby {
  let out = lobby;
  for (let i = 0; i < TIMER_BURST; i++) {
    const session = out.session;
    if (out.status !== 'in_game' || !session) return out;
    const game = gameFor(ctx, session.gameId);
    const timer = game.nextTimer?.(session.state);
    if (!timer || timer.at > ctx.now || !game.onTimer) break;
    const rng = createRng(session.rngState);
    const state = game.onTimer(session.state, timer.id, rng, ctx.now);
    if (state === session.state) break;
    out = finishIfOver(moved(out, game, state, rng.state, ctx), ctx);
  }
  return runBot(out, ctx);
}

/**
 * One bot move, if one is due. A move the game refuses (a bot that got it wrong) benches that bot
 * until the game moves on, so it can't stall the lobby by trying again on every read.
 */
function runBot(lobby: Lobby, ctx: Ctx): Lobby {
  const at = nextBotAt(lobby, ctx);
  if (at === null || at > ctx.now) return lobby;
  const move = botMove(lobby, ctx);
  if (!move) return lobby;
  const session = lobby.session!;
  const game = gameFor(ctx, session.gameId);
  try {
    const action = game.actionSchema.parse(move.action);
    const state = game.applyAction(session.state, move.id, action, move.rng, ctx.now);
    if (state === session.state) throw new Error('nothing changed');
    return finishIfOver(moved(lobby, game, state, move.rng.state, ctx), ctx);
  } catch {
    const ids = session.botFailed?.seq === session.seq ? session.botFailed.ids : [];
    return touch(
      {
        ...lobby,
        session: { ...session, botFailed: { seq: session.seq, ids: [...ids, move.id] } },
      },
      ctx.now,
    );
  }
}

function finishIfOver(lobby: Lobby, ctx: Ctx): Lobby {
  const session = lobby.session;
  if (!session) return lobby;
  const result = gameFor(ctx, session.gameId).getResult(session.state);
  return result ? endGame(lobby, result, ctx) : lobby;
}

/**
 * One standing per participant, in seat order. Uses the game's standings where it gave them
 * (ignoring ids that didn't play) and falls back to win/loss from `winners` for anyone missing.
 */
function standingsFor(playerIds: string[], result: GameResult): Standing[] {
  const given = new Map((result.standings ?? []).map((s) => [s.playerId, s]));
  return playerIds.map(
    (id) =>
      given.get(id) ?? { playerId: id, outcome: result.winners.includes(id) ? 'win' : 'loss' },
  );
}

/** Move to results: record history and scores, keep the selected game and options. */
export function endGame(lobby: Lobby, result: GameResult, ctx: Ctx): Lobby {
  requireStatus(lobby, 'in_game');
  const session = lobby.session!;
  const standings = standingsFor(session.playerIds, result);
  const scores = { ...lobby.scores };
  for (const s of standings) {
    const line = scores[s.playerId] ?? { wins: 0, losses: 0, played: 0 };
    scores[s.playerId] = {
      wins: line.wins + (s.outcome === 'win' ? 1 : 0),
      losses: line.losses + (s.outcome === 'loss' ? 1 : 0),
      played: line.played + 1,
    };
  }
  const names = Object.fromEntries(
    session.playerIds.map((id) => [id, lobby.players.find((p) => p.id === id)?.name ?? 'Unknown']),
  );
  const entry: HistoryEntry = {
    gameId: session.gameId,
    startedAt: session.startedAt,
    endedAt: ctx.now,
    summary: result.summary,
    winners: result.winners,
    players: session.playerIds,
    names,
    standings,
    ...(result.highlights?.length ? { highlights: result.highlights } : {}),
  };
  const over = touch(
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
  return say(over, [`Game over. ${result.summary}`], ctx.now);
}

/**
 * What the running game would record if the host ended it now (see GameModule.partialResult),
 * or null when it has no rounds worth saving.
 */
export function partialResultOf(lobby: Lobby, ctx: Pick<Ctx, 'games'>): GameResult | null {
  const session = lobby.session;
  if (lobby.status !== 'in_game' || !session) return null;
  return ctx.games[session.gameId]?.partialResult?.(session.state) ?? null;
}

/**
 * The host stops the running game for everyone. With `save` and rounds worth saving (Lesia,
 * 2026-10-24), it finishes as usual on the rounds played so far: history, scores, results.
 * Otherwise nothing is recorded and the lobby goes back to waiting with the same game and options.
 */
export function endGameEarly(lobby: Lobby, hostId: string, ctx: Ctx, save = false): Lobby {
  requireHost(lobby, hostId);
  requireStatus(lobby, 'in_game');
  const partial = save ? partialResultOf(lobby, ctx) : null;
  if (partial)
    return endGame(lobby, { ...partial, summary: `Ended early. ${partial.summary}` }, ctx);
  const stopped = touch({ ...lobby, status: 'waiting', session: null, results: null }, ctx.now);
  return say(stopped, ['The host ended the game early.'], ctx.now);
}

/**
 * What a linked game's other app reported (see GameLink): a result finishes the game as usual,
 * `abandoned` goes back to waiting with nothing recorded. `sessionId` guards against a report
 * about a game that has already been replaced.
 */
export function settleLinked(lobby: Lobby, sessionId: string, status: LinkStatus, ctx: Ctx): Lobby {
  if (!status.over || lobby.status !== 'in_game' || lobby.session?.id !== sessionId) return lobby;
  if ('abandoned' in status)
    return touch({ ...lobby, status: 'waiting', session: null, results: null }, ctx.now);
  return endGame(lobby, status.result, ctx);
}

/** Whether a start or play-again right now would begin the selected game. */
export function startWouldBegin(lobby: Lobby, playerId: string, kind: 'start' | 'playAgain') {
  if (lobby.hostId !== playerId) return false;
  if (kind === 'start') return lobby.status === 'waiting';
  return lobby.status === 'results';
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
  return say(touch({ ...lobby, scores: {} }, ctx.now), ['The host reset the scores.'], ctx.now);
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
      online: Boolean(p.bot) || ctx.now - (presence[p.id] ?? 0) <= ONLINE_WINDOW_MS,
      seated: lobby.status !== 'in_game' || seatedIds.has(p.id),
      ...(p.bot ? { bot: true as const } : {}),
    })),
    displays,
    selectedGameId: lobby.selectedGameId,
    gameOptions:
      lobby.selectedGameId && ctx.games[lobby.selectedGameId]
        ? optionsWithDefaults(lobby, ctx.games[lobby.selectedGameId]!)
        : lobby.gameOptions,
    // Polls carry only the latest games; the full record is served separately as stats.
    history: lobby.history.slice(0, SNAPSHOT_HISTORY),
    historyCount: lobby.history.length,
    scores: lobby.scores,
    chat: lobby.chat,
    reactions: liveReactions(lobby, ctx.now),
    me: viewerId,
    session: session
      ? { id: session.id, gameId: session.gameId, seq: session.seq, startedAt: session.startedAt }
      : null,
    serverNow: ctx.now,
  };
  const timerAt = nextTimerAt(lobby, ctx);
  if (timerAt !== null) snapshot.timerAt = timerAt;
  if (lobby.status === 'in_game') snapshot.waitingOn = waitingFor(lobby, ctx);
  if (partialResultOf(lobby, ctx)) snapshot.canSave = true;
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
