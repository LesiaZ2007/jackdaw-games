import type { ClientMessage, ErrorBody, LobbySnapshot, LobbyStatus } from '@jackdaw/engine';
import type { UnchangedSnapshot } from '@jackdaw/server';

/**
 * RoomTransport: how a screen talks to its lobby. Game and lobby UI only use this interface,
 * so swapping polling for WebSockets later doesn't touch them.
 */
export interface RoomTransport {
  /** Start receiving snapshots. Returns an unsubscribe function. */
  subscribe(
    onSnapshot: (s: LobbySnapshot) => void,
    onError?: (e: TransportError) => void,
  ): () => void;
  /** Send one message; resolves with the caller's fresh snapshot or rejects with TransportError. */
  send(message: ClientMessage): Promise<LobbySnapshot>;
  /** Fetch now instead of waiting for the next tick. */
  refresh(): void;
  close(): void;
}

export class TransportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

/** Headers the server reads: a player's device token, or a TV's display id. */
export function identityHeaders(who: {
  token?: string;
  displayId?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (who.token) headers['x-player-token'] = who.token;
  if (who.displayId) headers['x-display-id'] = who.displayId;
  return headers;
}

/**
 * How long to wait before the next poll, as in Avalon: quick while things are happening, slower
 * as the lobby sits idle, and slow in a hidden tab.
 */
export function pollDelay(opts: {
  status: LobbyStatus | null;
  idlePolls: number;
  hidden: boolean;
}): number {
  if (opts.hidden) return 8000;
  if (opts.status !== 'in_game') return opts.idlePolls >= 12 ? 4000 : 2500;
  if (opts.idlePolls >= 12) return 3000;
  if (opts.idlePolls >= 4) return 2200;
  return 1500;
}

/** Apply an "unchanged" poll (just presence) to the last snapshot. Same object if nothing moved. */
export function mergeUnchanged(snapshot: LobbySnapshot, patch: UnchangedSnapshot): LobbySnapshot {
  const online = new Set(patch.online);
  const moved =
    patch.displays !== snapshot.displays ||
    snapshot.players.some((p) => p.online !== online.has(p.id));
  if (!moved) return snapshot;
  return {
    ...snapshot,
    displays: patch.displays,
    players: snapshot.players.map((p) => ({ ...p, online: online.has(p.id) })),
  };
}

async function readError(res: Response): Promise<TransportError> {
  try {
    const body = (await res.json()) as Partial<ErrorBody>;
    if (body.error) return new TransportError(res.status, body.error.code, body.error.message);
  } catch {
    // fall through
  }
  return new TransportError(
    res.status,
    'HTTP_' + res.status,
    'Could not reach the lobby. Retrying…',
  );
}

export interface PollingOptions {
  code: string;
  /** Players send their device token; TVs send a display id instead. */
  token?: string;
  displayId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** For tests. Defaults to the global document, if any. */
  document?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
}

/** Polls GET /api/lobby/:code?v=N and posts messages to the same URL. */
export class PollingTransport implements RoomTransport {
  private snapshot: LobbySnapshot | null = null;
  private listeners = new Set<{
    onSnapshot: (s: LobbySnapshot) => void;
    onError?: (e: TransportError) => void;
  }>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private idlePolls = 0;
  private stopped = false;
  private readonly fetch: typeof fetch;
  private readonly doc: PollingOptions['document'];
  private readonly url: string;

  constructor(private opts: PollingOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.doc = opts.document ?? (typeof document === 'undefined' ? undefined : document);
    this.url = `${opts.baseUrl ?? ''}/api/lobby/${encodeURIComponent(opts.code)}`;
    this.doc?.addEventListener('visibilitychange', this.onVisibility);
  }

  get latest(): LobbySnapshot | null {
    return this.snapshot;
  }

  subscribe(onSnapshot: (s: LobbySnapshot) => void, onError?: (e: TransportError) => void) {
    const entry = { onSnapshot, onError };
    this.listeners.add(entry);
    if (this.snapshot) onSnapshot(this.snapshot);
    if (this.listeners.size === 1 && !this.timer && !this.inFlight) void this.poll();
    return () => {
      this.listeners.delete(entry);
      if (this.listeners.size === 0) this.clearTimer();
    };
  }

  async send(message: ClientMessage): Promise<LobbySnapshot> {
    const res = await this.fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...identityHeaders(this.opts) },
      body: JSON.stringify(message),
      cache: 'no-store',
    });
    if (!res.ok) throw await readError(res);
    const snapshot = (await res.json()) as LobbySnapshot;
    // The reply is a fresh read, so it stands in for the "poll right after sending".
    this.idlePolls = 0;
    this.publish(snapshot);
    this.schedule();
    return snapshot;
  }

  refresh() {
    if (this.inFlight || this.stopped) return;
    this.clearTimer();
    void this.poll();
  }

  close() {
    this.stopped = true;
    this.clearTimer();
    this.listeners.clear();
    this.doc?.removeEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (!this.doc?.hidden) this.refresh();
  };

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule() {
    if (this.stopped || this.listeners.size === 0) return;
    this.clearTimer();
    const delay = pollDelay({
      status: this.snapshot?.status ?? null,
      idlePolls: this.idlePolls,
      hidden: Boolean(this.doc?.hidden),
    });
    this.timer = setTimeout(() => void this.poll(), delay);
  }

  private publish(snapshot: LobbySnapshot) {
    if (snapshot === this.snapshot) return;
    // Ignore a reply that is older than what we already show (e.g. a slow poll racing a send).
    if (this.snapshot && snapshot.version < this.snapshot.version) return;
    this.snapshot = snapshot;
    for (const l of this.listeners) l.onSnapshot(snapshot);
  }

  private async poll() {
    if (this.stopped || this.inFlight) return;
    this.inFlight = true;
    this.timer = null;
    try {
      const v = this.snapshot ? `?v=${this.snapshot.version}` : '';
      const res = await this.fetch(this.url + v, {
        headers: identityHeaders(this.opts),
        cache: 'no-store',
      });
      if (!res.ok) throw await readError(res);
      const body = (await res.json()) as LobbySnapshot | UnchangedSnapshot;
      if ('unchanged' in body) {
        this.idlePolls++;
        if (this.snapshot) this.publish(mergeUnchanged(this.snapshot, body));
      } else {
        this.idlePolls = 0;
        this.publish(body);
      }
    } catch (e) {
      const err =
        e instanceof TransportError
          ? e
          : new TransportError(0, 'NETWORK', 'Connection lost. Retrying…');
      for (const l of this.listeners) l.onError?.(err);
      // A lobby that's gone won't come back: stop polling.
      if (err.status === 404) this.stopped = true;
    } finally {
      this.inFlight = false;
      this.schedule();
    }
  }
}
