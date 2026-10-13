import type { LobbySnapshot } from '@jackdaw/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDeviceToken,
  getDisplayId,
  rememberAvatar,
  rememberName,
  rememberedAvatar,
  rememberedName,
  type KeyValueStore,
} from './identity';
import { PollingTransport, TransportError, mergeUnchanged, pollDelay } from './transport';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const snapshot = (over: Partial<LobbySnapshot> = {}): LobbySnapshot => ({
  code: 'ABCD',
  version: 1,
  hostId: 'p1',
  status: 'waiting',
  players: [
    {
      id: 'p1',
      name: 'Ana',
      avatar: { crest: 'helm', tint: 'slate' },
      online: true,
      joinedAt: 0,
      seated: true,
    },
    {
      id: 'p2',
      name: 'Ben',
      avatar: { crest: 'crown', tint: 'plum' },
      online: true,
      joinedAt: 1,
      seated: true,
    },
  ],
  displays: 0,
  selectedGameId: null,
  gameOptions: {},
  history: [],
  historyCount: 0,
  scores: {},
  chat: [],
  reactions: [],
  me: 'p1',
  session: null,
  ...over,
});

describe('identity', () => {
  it('creates one URL-safe device token and keeps it', () => {
    const store = memoryStore();
    const token = getDeviceToken(store);
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(getDeviceToken(store)).toBe(token);
    expect(getDisplayId(store)).not.toBe(token);
  });

  it('replaces a corrupted token', () => {
    const store = memoryStore();
    store.setItem('jackdaw:token', 'bad token!');
    expect(getDeviceToken(store)).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('remembers the last name and avatar, ignoring junk', () => {
    const store = memoryStore();
    expect(rememberedName(store)).toBeNull();
    rememberName('  Ana  ', store);
    expect(rememberedName(store)).toBe('Ana');
    rememberAvatar({ crest: 'owl', tint: 'moss' }, store);
    expect(rememberedAvatar(store)).toEqual({ crest: 'owl', tint: 'moss' });
    store.setItem('jackdaw:avatar', '{nope');
    expect(rememberedAvatar(store)).toBeNull();
  });
});

describe('pollDelay', () => {
  it('polls quickly in a game, slower when idle, slowest when hidden', () => {
    expect(pollDelay({ status: 'in_game', idlePolls: 0, hidden: false })).toBe(1500);
    expect(pollDelay({ status: 'in_game', idlePolls: 4, hidden: false })).toBe(2200);
    expect(pollDelay({ status: 'in_game', idlePolls: 12, hidden: false })).toBe(3000);
    expect(pollDelay({ status: 'waiting', idlePolls: 0, hidden: false })).toBe(2500);
    expect(pollDelay({ status: 'waiting', idlePolls: 12, hidden: false })).toBe(4000);
    expect(pollDelay({ status: 'in_game', idlePolls: 0, hidden: true })).toBe(8000);
  });
});

describe('mergeUnchanged', () => {
  it('updates who is online and keeps the same object when nothing moved', () => {
    const s = snapshot();
    expect(
      mergeUnchanged(s, { unchanged: true, version: 1, online: ['p1', 'p2'], displays: 0 }),
    ).toBe(s);
    const merged = mergeUnchanged(s, { unchanged: true, version: 1, online: ['p1'], displays: 1 });
    expect(merged.players.map((p) => p.online)).toEqual([true, false]);
    expect(merged.displays).toBe(1);
  });
});

describe('PollingTransport', () => {
  afterEach(() => vi.useRealTimers());

  const respond = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );

  it('polls with the version, sends the token, and publishes snapshots', async () => {
    vi.useFakeTimers();
    const calls: { url: string; init?: RequestInit }[] = [];
    const replies = [snapshot(), { unchanged: true, version: 1, online: ['p1'], displays: 0 }];
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return respond(
        replies.shift() ?? { unchanged: true, version: 1, online: ['p1'], displays: 0 },
      );
    }) as unknown as typeof globalThis.fetch;
    const t = new PollingTransport({
      code: 'ABCD',
      token: 'tok-0123456789abcdef',
      fetch,
      document: undefined,
    });
    const seen: LobbySnapshot[] = [];
    t.subscribe((s) => seen.push(s));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls[0]!.url).toBe('/api/lobby/ABCD');
    expect((calls[0]!.init!.headers as Record<string, string>)['x-player-token']).toBe(
      'tok-0123456789abcdef',
    );
    await vi.advanceTimersByTimeAsync(2500);
    expect(calls[1]!.url).toBe('/api/lobby/ABCD?v=1');
    expect(seen).toHaveLength(2);
    expect(seen[1]!.players[1]!.online).toBe(false);
    t.close();
  });

  it('turns error bodies into TransportErrors and stops on a missing lobby', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() =>
      respond({ error: { code: 'NOT_FOUND', message: 'gone' } }, 404),
    ) as unknown as typeof globalThis.fetch;
    const t = new PollingTransport({ code: 'ABCD', displayId: 'tv-1', fetch, document: undefined });
    const errors: TransportError[] = [];
    t.subscribe(
      () => {},
      (e) => errors.push(e),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    await expect(t.send({ type: 'start' })).rejects.toBeInstanceOf(TransportError);
    t.close();
  });
});
