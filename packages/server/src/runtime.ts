import {
  CODE_ALPHABET,
  ClientMessage,
  GameError,
  ONLINE_WINDOW_MS,
  applyGameAction,
  backToLobby,
  chat,
  createLobby,
  createRejoinCode,
  endGameEarly,
  join,
  kick,
  leave,
  playAgain,
  playerIdForToken,
  randomSeed,
  react,
  reassignHostIfAway,
  redeemRejoinCode,
  rename,
  resetScores,
  setAvatar,
  setGame,
  setOptions,
  settleLinked,
  snapshotFor,
  start,
  startBlocker,
  startWouldBegin,
  transferHost,
  lobbyStats,
  type Avatar,
  type Ctx,
  type GameLink,
  type GameRegistry,
  type LinkStatus,
  type HistoryEntry,
  type Lobby,
  type LobbySnapshot,
  type LobbyStats,
  type Presence,
} from '@jackdaw/engine';
import { DEFAULT_AVATARS, isKnownAvatar } from './avatars';
import { RoomError } from './errors';
import type { RoomStorage } from './storage';

/**
 * The room runtime: loads a lobby from storage, runs one message through the pure lobby state
 * machine under a per-lobby lock, saves it, and returns the caller's snapshot. Web-standard APIs
 * only (fetch, crypto), so the same code can run on Vercel or Cloudflare Workers.
 */

export const LOBBY_TTL_SECONDS = 24 * 60 * 60;
const LOCK_TTL_SECONDS = 5;
const LOCK_ATTEMPTS = 80;
/** Presence is rewritten at most this often per id; "online" means seen within 45s. */
export const PRESENCE_WRITE_MS = 25_000;

const lobbyKey = (code: string) => `jackdaw:lobby:${code}`;
const lockKey = (code: string) => `jackdaw:lock:${code}`;
const seenKey = (code: string) => `jackdaw:seen:${code}`;

export interface RuntimeOptions {
  storage: RoomStorage;
  games: GameRegistry;
  /** Fallback avatars, in the order they're handed out. */
  palette?: Avatar[];
  now?: () => number;
  /** Random string of `length` characters from `alphabet`. */
  randomString?: (length: number, alphabet: string) => string;
  seed?: () => number;
  /** How long a poll may reuse a lobby read on this instance. Avalon uses 900ms. */
  readCacheMs?: number;
  rateLimit?: { posts: number; polls: number; windowMs: number };
  sleep?: (ms: number) => Promise<void>;
  /** Links for games played in another app, by game id (see GameLink in the engine). */
  links?: Record<string, GameLink>;
  /** How often a poll may ask a linked game's app whether the game is over. */
  linkCheckMs?: number;
  /** This site's public origin, for "Back to Jackdaw" links. Falls back to the request's. */
  siteUrl?: string;
}

/** Where a message came from, for anything that needs this site's own address. */
export interface RequestInfo {
  origin?: string;
}

export interface CreateInput {
  token: string;
  name: string;
  avatar?: Avatar;
  gameId?: string;
}

/** What a poll returns when nothing in the lobby changed: just who is online now. */
export interface UnchangedSnapshot {
  unchanged: true;
  version: number;
  online: string[];
  displays: number;
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function cryptoRandomString(length: number, alphabet: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  // Modulo bias is negligible for ids this short; nothing here guards secrets by entropy alone.
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/** Seat keys are SHA-256 hashes of device tokens, so storage never holds a usable token. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export function isValidDisplayId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(id);
}

export function createRoomRuntime(opts: RuntimeOptions) {
  const { storage, games } = opts;
  const palette = opts.palette ?? DEFAULT_AVATARS;
  const now = opts.now ?? Date.now;
  const randomString = opts.randomString ?? cryptoRandomString;
  const seed = opts.seed ?? randomSeed;
  const readCacheMs = opts.readCacheMs ?? 900;
  const limits = opts.rateLimit ?? { posts: 30, polls: 40, windowMs: 10_000 };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const links = opts.links ?? {};
  const linkCheckMs = opts.linkCheckMs ?? 5_000;

  const ctx = (): Ctx => ({ now: now(), games });

  // ── Per-instance caches (best effort; each serverless instance has its own) ──────────────
  const readCache = new Map<string, { at: number; value: Promise<Lobby | null> }>();
  const tokenHashes = new Map<string, string>();
  const hits = new Map<string, number[]>();
  const linkChecks = new Map<string, number>();

  async function tokenKey(token: string): Promise<string> {
    let key = tokenHashes.get(token);
    if (!key) {
      key = await hashToken(token);
      if (tokenHashes.size > 5000) tokenHashes.clear();
      tokenHashes.set(token, key);
    }
    return key;
  }

  /** Throws RATE_LIMITED if `who` has sent more than `max` requests in the window. */
  function rateLimit(who: string, max: number) {
    const t = now();
    const recent = (hits.get(who) ?? []).filter((at) => t - at < limits.windowMs);
    recent.push(t);
    hits.set(who, recent);
    if (hits.size > 10_000) hits.clear();
    if (recent.length > max)
      throw new RoomError(429, 'RATE_LIMITED', 'Slow down a little and try again.');
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────────────────
  async function load(code: string): Promise<Lobby | null> {
    const raw = await storage.get(lobbyKey(code));
    return raw ? (JSON.parse(raw) as Lobby) : null;
  }

  /** A read shared between polls on this instance for under a second. Treat as read-only. */
  function loadShared(code: string): Promise<Lobby | null> {
    if (readCacheMs <= 0) return load(code);
    const hit = readCache.get(code);
    if (hit && now() - hit.at < readCacheMs) return hit.value;
    const value = load(code);
    readCache.set(code, { at: now(), value });
    value.catch(() => readCache.delete(code));
    return value;
  }

  async function save(lobby: Lobby) {
    await storage.set(lobbyKey(lobby.code), JSON.stringify(lobby), LOBBY_TTL_SECONDS);
    if (readCacheMs > 0) readCache.set(lobby.code, { at: now(), value: Promise.resolve(lobby) });
  }

  async function loadPresence(code: string): Promise<Presence> {
    const raw = await storage.hgetall(seenKey(code));
    return Object.fromEntries(Object.entries(raw).map(([id, at]) => [id, Number(at)]));
  }

  /** Records a check-in, but only writes when the stored one is getting old. */
  async function checkIn(code: string, id: string, presence: Presence): Promise<Presence> {
    const t = now();
    if (t - (presence[id] ?? 0) < PRESENCE_WRITE_MS) return presence;
    await storage.hset(seenKey(code), id, String(t), LOBBY_TTL_SECONDS);
    return { ...presence, [id]: t };
  }

  async function lock(code: string): Promise<() => Promise<void>> {
    const owner = randomString(12, ID_ALPHABET);
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
      if (await storage.setIfAbsent(lockKey(code), owner, LOCK_TTL_SECONDS)) {
        return () => storage.delIfEquals(lockKey(code), owner).catch(() => {});
      }
      await sleep(40 + Math.random() * 40);
    }
    throw new RoomError(503, 'BUSY', 'The lobby is busy. Try again in a moment.');
  }

  /**
   * Load, change and save a lobby while holding its lock, so two phones acting at once can't
   * overwrite each other. If `mutate` throws, nothing is saved.
   */
  async function withLobby<T>(code: string, mutate: (lobby: Lobby) => { lobby: Lobby; result: T }) {
    const release = await lock(code);
    try {
      const lobby = await load(code);
      if (!lobby) throw notFound();
      const out = mutate(lobby);
      if (out.lobby !== lobby) await save(out.lobby);
      return out;
    } finally {
      await release();
    }
  }

  const notFound = () =>
    new RoomError(404, 'NOT_FOUND', 'That lobby does not exist or has expired. Check the code.');

  function cleanAvatar(avatar: Avatar | undefined): Avatar | undefined {
    return avatar && isKnownAvatar(avatar) ? avatar : undefined;
  }

  // ── Public API ──────────────────────────────────────────────────────────────────────────

  /** Create a lobby with this device as host. Retries on code collisions. */
  async function create(
    input: CreateInput,
  ): Promise<{ code: string; playerId: string; snapshot: LobbySnapshot }> {
    rateLimit(`create:${input.token}`, 5);
    const key = await tokenKey(input.token);
    if (input.gameId && !games[input.gameId])
      throw new RoomError(400, 'UNKNOWN_GAME', 'That game is not available.');
    const hostId = randomString(10, ID_ALPHABET);
    const avatar = cleanAvatar(input.avatar) ?? palette[0]!;
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = randomString(4, CODE_ALPHABET);
      const lobby = createLobby(
        {
          code,
          hostId,
          hostName: input.name,
          hostAvatar: avatar,
          tokenKey: key,
          gameId: input.gameId,
        },
        ctx(),
      );
      if (await storage.setIfAbsent(lobbyKey(code), JSON.stringify(lobby), LOBBY_TTL_SECONDS)) {
        const presence = await checkIn(code, hostId, {});
        return { code, playerId: hostId, snapshot: snapshotFor(lobby, hostId, presence, ctx()) };
      }
    }
    throw new RoomError(503, 'BUSY', 'Could not find a free lobby code. Try again.');
  }

  /**
   * For Start or Play again on a linked game: open the game in its own app first (outside the
   * lock, since it's a network call) and return what `setup` needs. Undefined when the message
   * won't begin a linked game, so the lobby machine handles it (and its errors) as usual.
   */
  async function prepareLink(
    code: string,
    key: string,
    msg: Extract<ClientMessage, { type: 'start' | 'playAgain' }>,
    info: RequestInfo,
  ): Promise<{ data: unknown; playerIds: string[] } | undefined> {
    const lobby = await load(code);
    if (!lobby) throw notFound();
    const me = playerIdForToken(lobby, key);
    const game = lobby.selectedGameId ? games[lobby.selectedGameId] : undefined;
    if (!me || !game?.linked || !startWouldBegin(lobby, me, msg.type)) return undefined;
    if (startBlocker(lobby, { games })) return undefined;
    const link = links[game.meta.id];
    if (!link)
      throw new GameError('NOT_SET_UP', `${game.meta.name} isn't set up on this server yet.`);
    const origin = (opts.siteUrl || info.origin || '').replace(/\/$/, '');
    const data = await link.start({
      lobbyCode: lobby.code,
      hostId: lobby.hostId,
      players: lobby.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
      options: game.optionsSchema.parse(lobby.gameOptions),
      returnUrl: `${origin}/r/${lobby.code}`,
      look: msg.look ?? 'light',
    });
    return { data, playerIds: lobby.players.map((p) => p.id) };
  }

  /** Apply one message from a device and return that device's fresh snapshot. */
  async function post(
    code: string,
    token: string,
    input: unknown,
    info: RequestInfo = {},
  ): Promise<LobbySnapshot> {
    rateLimit(`post:${token}`, limits.posts);
    const parsed = ClientMessage.safeParse(input);
    if (!parsed.success) {
      throw new RoomError(
        400,
        'BAD_REQUEST',
        parsed.error.issues[0]?.message ?? 'That message is not valid.',
      );
    }
    const msg = parsed.data;
    const key = await tokenKey(token);
    const presence = await loadPresence(code);
    const linked =
      msg.type === 'start' || msg.type === 'playAgain'
        ? await prepareLink(code, key, msg, info)
        : undefined;

    const { lobby, result: playerId } = await withLobby(code, (current) => {
      const c = ctx();
      if (msg.type === 'join') {
        const joined = join(
          current,
          {
            tokenKey: key,
            newPlayerId: randomString(10, ID_ALPHABET),
            name: msg.name,
            avatar: cleanAvatar(msg.avatar),
            palette,
          },
          c,
        );
        return { lobby: joined.lobby, result: joined.playerId };
      }
      const me = playerIdForToken(current, key);
      if (!me) throw new GameError('NOT_A_PLAYER', 'You are not in this lobby. Join it first.');
      const before = reassignHostIfAway(current, { ...presence, [me]: c.now }, c);
      // The other app's room was opened for exactly these players; if the table changed while
      // it was being made, start again rather than seat the wrong people.
      if (linked && linked.playerIds.join() !== before.players.map((p) => p.id).join())
        throw new GameError(
          'TABLE_CHANGED',
          'Someone joined or left just then. Press Start again.',
        );
      return { lobby: apply(before, me, msg, c, linked?.data), result: me };
    });

    const fresh = await checkIn(code, playerId, presence);
    return snapshotFor(lobby, playerId, fresh, ctx());
  }

  function apply(lobby: Lobby, me: string, msg: ClientMessage, c: Ctx, linked?: unknown): Lobby {
    switch (msg.type) {
      case 'join':
        return lobby; // handled by the caller
      case 'setGame':
        return setGame(lobby, me, msg.gameId, c);
      case 'setOptions':
        return setOptions(lobby, me, msg.options, c);
      case 'start':
        return start(
          lobby,
          me,
          { sessionId: randomString(10, ID_ALPHABET), seed: seed(), linked },
          c,
        );
      case 'action':
        return applyGameAction(
          lobby,
          me,
          { sessionId: msg.sessionId, seq: msg.seq, action: msg.action },
          c,
        );
      case 'playAgain':
        return playAgain(
          lobby,
          me,
          { sessionId: randomString(10, ID_ALPHABET), seed: seed(), linked },
          c,
        );
      case 'backToLobby':
        return backToLobby(lobby, me, c);
      case 'kick':
        return kick(lobby, me, msg.playerId, c);
      case 'transferHost':
        return transferHost(lobby, me, msg.playerId, c);
      case 'leave':
        return leave(lobby, me, c);
      case 'rename':
        return rename(lobby, me, msg.name, c);
      case 'setAvatar':
        if (!isKnownAvatar(msg.avatar))
          throw new GameError('BAD_REQUEST', 'That avatar does not exist.');
        return setAvatar(lobby, me, msg.avatar, c);
      case 'chat':
        return chat(lobby, me, msg.text, randomString(10, ID_ALPHABET), c);
      case 'createRejoinCode':
        return createRejoinCode(lobby, me, randomString(6, CODE_ALPHABET), c);
      case 'resetScores':
        return resetScores(lobby, me, c);
      case 'endGame':
        return endGameEarly(lobby, me, c);
      case 'react':
        return react(lobby, me, msg.kind, randomString(10, ID_ALPHABET), c);
    }
  }

  /**
   * Read the lobby for a device (token) or a TV (no token, optional display id).
   * Returns `unchanged` when the caller already has this version.
   */
  async function poll(
    code: string,
    who: { token?: string | null; displayId?: string | null },
    sinceVersion?: number | null,
  ): Promise<LobbySnapshot | UnchangedSnapshot> {
    rateLimit(`poll:${who.token ?? who.displayId ?? code}`, limits.polls);
    let lobby = await loadShared(code);
    if (!lobby) throw notFound();
    let presence = await loadPresence(code);

    const me = who.token ? playerIdForToken(lobby, await tokenKey(who.token)) : null;
    if (me) presence = await checkIn(code, me, presence);
    else if (who.displayId) presence = await checkIn(code, `tv:${who.displayId}`, presence);

    // Lazy host handover: only take the lock when the host really has been away.
    const c = ctx();
    if (reassignHostIfAway(lobby, presence, c) !== lobby) {
      lobby = (
        await withLobby(code, (l) => ({
          lobby: reassignHostIfAway(l, presence, ctx()),
          result: null,
        }))
      ).lobby;
    }

    lobby = await checkLink(lobby);

    if (sinceVersion === lobby.version) {
      const fresh = (id: string) => c.now - (presence[id] ?? 0) <= ONLINE_WINDOW_MS;
      return {
        unchanged: true,
        version: lobby.version,
        online: lobby.players.filter((p) => fresh(p.id)).map((p) => p.id),
        displays: Object.keys(presence).filter((id) => id.startsWith('tv:') && fresh(id)).length,
      };
    }
    return snapshotFor(lobby, me, presence, c);
  }

  /**
   * While a linked game runs, ask its app (at most every `linkCheckMs` per lobby on this
   * instance) whether it's over, and settle the lobby if so. A failed check just waits for the
   * next one.
   */
  async function checkLink(lobby: Lobby): Promise<Lobby> {
    const session = lobby.session;
    const link = session && lobby.status === 'in_game' ? links[session.gameId] : undefined;
    if (!session || !link) return lobby;
    const t = now();
    if (t - (linkChecks.get(session.id) ?? 0) < linkCheckMs) return lobby;
    linkChecks.set(session.id, t);
    if (linkChecks.size > 1000) linkChecks.clear();
    let status: LinkStatus;
    try {
      status = await link.check(session.state);
    } catch (e) {
      console.error('[jackdaw] linked game check failed', e);
      return lobby;
    }
    if (!status.over) return lobby;
    return (
      await withLobby(lobby.code, (l) => ({
        lobby: settleLinked(l, session.id, status, ctx()),
        result: null,
      }))
    ).lobby;
  }

  /** Move a seat to this device with a one-time rejoin code. */
  async function redeemRejoin(
    code: string,
    token: string,
    rejoinCode: string,
  ): Promise<LobbySnapshot> {
    rateLimit(`rejoin:${token}`, 10);
    const key = await tokenKey(token);
    const presence = await loadPresence(code);
    const { lobby, result: playerId } = await withLobby(code, (current) => {
      const out = redeemRejoinCode(current, rejoinCode, key, ctx());
      return { lobby: out.lobby, result: out.playerId };
    });
    const fresh = await checkIn(code, playerId, presence);
    return snapshotFor(lobby, playerId, fresh, ctx());
  }

  /**
   * The lobby's full record for the Game stats menu. Fetched on demand rather than with every
   * poll, since history can hold 200 games. Everything in it was revealed when each game ended.
   */
  async function stats(code: string): Promise<{ stats: LobbyStats; history: HistoryEntry[] }> {
    rateLimit(`stats:${code}`, limits.polls);
    const lobby = await loadShared(code);
    if (!lobby) throw notFound();
    return { stats: lobbyStats(lobby.history), history: lobby.history };
  }

  return { create, post, poll, redeemRejoin, stats };
}

export type RoomRuntime = ReturnType<typeof createRoomRuntime>;
