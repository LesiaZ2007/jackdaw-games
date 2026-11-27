import { z } from 'zod';
import { GameError, type GameModule, type LobbySnapshot } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { createRoomRuntime, type UnchangedSnapshot } from './runtime';
import { MemoryStorage } from './storage';

/** A game whose score only the server can set (as a live room reports a finished round). */
interface TallyState {
  n: number;
  ids: string[];
}
const serverSet = z.object({ type: z.literal('set'), n: z.number().int().min(0).max(9) });

const tally: GameModule<TallyState, { type: 'noop' }, object, { n: number }, object> = {
  meta: {
    id: 'tally',
    name: 'Tally',
    tagline: 'Counted by the server.',
    minPlayers: 2,
    maxPlayers: 6,
    category: 'mini',
    minutes: [1, 2],
    complexity: 1,
  },
  optionsSchema: z.object({}),
  actionSchema: z.object({ type: z.literal('noop') }),
  serverActionSchema: serverSet,
  defaultOptions: () => ({}),
  setup: (ctx) => ({ n: 0, ids: ctx.playerIds }),
  getPlayerView: () => ({}),
  getTableView: (s) => ({ n: s.n }),
  applyAction: (s) => s,
  applyServerAction: (s, action) => {
    const a = action as z.infer<typeof serverSet>;
    if (a.n < s.n) throw new GameError('BACKWARDS', 'Counts only go up.');
    return { ...s, n: a.n };
  },
  getResult: (s) =>
    s.n >= 3
      ? { winners: [s.ids[0]!], summary: `Counted to ${s.n}.`, reveal: null, recap: [] }
      : null,
};

const TOKENS = { ana: 'token-ana-0123456789', ben: 'token-ben-0123456789' };

async function started() {
  let t = 1_000_000;
  const runtime = createRoomRuntime({
    storage: new MemoryStorage(() => t),
    games: { tally },
    now: () => t,
    readCacheMs: 0,
    sleep: () => new Promise((r) => setTimeout(r, 1)),
  });
  const { code } = await runtime.create({ token: TOKENS.ana, name: 'Wren', gameId: 'tally' });
  await runtime.post(code, TOKENS.ben, { type: 'join', name: 'Rook' });
  const s = await runtime.post(code, TOKENS.ana, { type: 'start', look: 'light' });
  t += 10;
  return { runtime, code, sessionId: s.session!.id };
}

async function snap(p: Promise<LobbySnapshot | UnchangedSnapshot>): Promise<LobbySnapshot> {
  const s = await p;
  if ('unchanged' in s) throw new Error('expected a full snapshot');
  return s;
}

describe('server-only actions', () => {
  it('apply through the game and finish it like any move', async () => {
    const { runtime, code, sessionId } = await started();
    await runtime.serverAction(code, sessionId, { type: 'set', n: 2 });
    let s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(s.tableView).toEqual({ n: 2 });
    await runtime.serverAction(code, sessionId, { type: 'set', n: 3 });
    s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(s.status).toBe('results');
    expect(s.results?.summary).toBe('Counted to 3.');
  });

  it('are refused for an old session, a bad shape, or a move the game refuses', async () => {
    const { runtime, code, sessionId } = await started();
    await expect(runtime.serverAction(code, 'old-session', { type: 'set', n: 1 })).rejects.toThrow(
      /moved on/,
    );
    await expect(runtime.serverAction(code, sessionId, { type: 'set', n: 99 })).rejects.toThrow();
    await runtime.serverAction(code, sessionId, { type: 'set', n: 2 });
    await expect(runtime.serverAction(code, sessionId, { type: 'set', n: 1 })).rejects.toThrow(
      /only go up/,
    );
  });

  it('can never be sent by a phone', async () => {
    const { runtime, code, sessionId } = await started();
    await expect(
      runtime.post(code, TOKENS.ana, {
        type: 'action',
        sessionId,
        seq: 0,
        action: { type: 'set', n: 3 },
      }),
    ).rejects.toThrow();
    const s = await snap(runtime.poll(code, { token: TOKENS.ana }));
    expect(s.tableView).toEqual({ n: 0 });
  });
});
