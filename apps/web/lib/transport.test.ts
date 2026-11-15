import type { LobbySnapshot } from '@jackdaw/engine';
import type { GameUi } from '@jackdaw/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PollingTransport } from './transport';
import { livePollFor } from './use-lobby';

vi.mock('./catalog', () => ({ gameUis: {} }));

const snap = (status: LobbySnapshot['status'], version = 1): LobbySnapshot =>
  ({
    code: 'ABCD',
    version,
    hostId: 'p1',
    status,
    players: [],
    displays: 0,
    selectedGameId: null,
    gameOptions: {},
    botLevel: 'normal',
    history: [],
    historyCount: 0,
    scores: {},
    chat: [],
    reactions: [],
    me: 'p1',
    session: status === 'in_game' ? { id: 's', gameId: 'maze', seq: 1, startedAt: 0 } : null,
    serverNow: 0,
  }) as LobbySnapshot;

function setup(status: LobbySnapshot['status'], doc?: { hidden: boolean }) {
  vi.useFakeTimers();
  let n = 0;
  const fetch = vi.fn(() => {
    n += 1;
    const body = n === 1 ? snap(status) : { unchanged: true, version: 1, online: [], displays: 0 };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  const t = new PollingTransport({
    code: 'ABCD',
    token: 'tok-0123456789abcdef',
    fetch: fetch as unknown as typeof globalThis.fetch,
    document: doc
      ? ({
          hidden: doc.hidden,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as never)
      : undefined,
  });
  return { t, fetch };
}

describe('PollingTransport live polling', () => {
  afterEach(() => vi.useRealTimers());

  it('floors the live pace at 600 ms while in game', async () => {
    const { t, fetch } = setup('in_game');
    t.setLivePoll(200);
    t.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(550);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(fetch).toHaveBeenCalledTimes(2);
    t.close();
  });

  it('falls back to the normal pace when the tab is hidden', async () => {
    const { t, fetch } = setup('in_game', { hidden: true });
    t.setLivePoll(800);
    t.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3100);
    expect(fetch).toHaveBeenCalledTimes(2);
    t.close();
  });

  it('restores the normal pace with null', async () => {
    const { t, fetch } = setup('in_game');
    t.setLivePoll(800);
    t.setLivePoll(null);
    t.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1400);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    t.close();
  });

  it('never uses the live pace in a lobby', async () => {
    const { t, fetch } = setup('waiting');
    t.setLivePoll(800);
    t.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    expect(fetch).toHaveBeenCalledTimes(2);
    t.close();
  });
});

describe('livePollFor', () => {
  const ui = (over: Partial<GameUi>) => ({ maze: over as GameUi });

  it('uses livePollMs, the per-moment livePoll wins, and a lobby gets null', () => {
    const s = snap('in_game');
    expect(livePollFor(s, ui({ livePollMs: 800 }))).toBe(800);
    expect(livePollFor(s, ui({ livePollMs: 800, livePoll: () => null }))).toBeNull();
    expect(livePollFor(s, ui({ livePollMs: 1500, livePoll: () => 800 }))).toBe(800);
    expect(livePollFor(s, ui({}))).toBeNull();
    expect(livePollFor(s, {})).toBeNull();
    expect(livePollFor(snap('waiting'), ui({ livePollMs: 800 }))).toBeNull();
  });

  it('passes the table view to livePoll', () => {
    const s = { ...snap('in_game'), tableView: { phase: 'play' } };
    const livePoll = vi.fn(() => 700);
    livePollFor(s, ui({ livePoll }));
    expect(livePoll).toHaveBeenCalledWith({ phase: 'play' });
  });
});
