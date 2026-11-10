import { describe, expect, it } from 'vitest';
import {
  BLOCK_MS,
  KNOCK_LIMIT,
  KNOCK_TTL_MS,
  REMOVED_LIMIT,
  addBot,
  answerKnock,
  createLobby,
  join,
  joinOrKnock,
  kick,
  markTimerFailed,
  nameClash,
  nextTimerAt,
  redeemRejoinCode,
  createRejoinCode,
  runTimers,
  setLocked,
  snapshotFor,
  start,
  type Ctx,
  type Lobby,
} from './lobby';
import { ClientMessage, PlayerName, type Avatar } from './protocol';
import { counterGame } from './testing/counter-game';

const games = { counter: counterGame };
const ctx = (now = 1_000): Ctx => ({ now, games });
const palette: Avatar[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => ({
  crest: `crest-${x}`,
  tint: `tint-${i}`,
}));

function lobbyWith(n: number): Lobby {
  let lobby = createLobby(
    { code: 'ABCD', hostId: 'p1', hostName: 'Wren', hostAvatar: palette[0]!, tokenKey: 't1' },
    ctx(),
  );
  for (let i = 2; i <= n; i++) {
    lobby = join(
      lobby,
      { tokenKey: `t${i}`, newPlayerId: `p${i}`, name: `Rook${i}`, palette },
      ctx(),
    ).lobby;
  }
  return lobby;
}

const knockInput = (key: string, name: string, id = 'k-' + key) => ({
  tokenKey: key,
  newPlayerId: 'new-' + key,
  knockId: id,
  name,
  palette,
});

describe('names', () => {
  it('are normalized, stripped of invisible characters and collapsed', () => {
    const parse = (s: string) => PlayerName.parse(s);
    expect(parse('  Wr​en  ')).toBe('Wren');
    expect(parse('‮neirw')).toBe('neirw');
    expect(parse('Ｒｏｏｋ')).toBe('Rook');
    expect(parse('Little \t\n  Owl')).toBe('Little Owl');
    expect(parse('A\u0000B')).toBe('AB');
    expect(PlayerName.safeParse('​‍').success).toBe(false);
    expect(PlayerName.safeParse('x'.repeat(21)).success).toBe(false);
    expect(PlayerName.safeParse('x'.repeat(5000)).success).toBe(false);
  });

  it('clash when their skeletons match, and humans cannot take bot names', () => {
    const players = [{ id: 'p1', name: 'Wren' }];
    expect(nameClash(players, 'ＷＲＥＮ')).toMatch(/already called/);
    expect(nameClash(players, 'W r e n')).toMatch(/already called/);
    expect(nameClash(players, 'Wren', 'p1')).toBeNull();
    expect(nameClash(players, 'Bot Rook')).toMatch(/computer players/);
    expect(nameClash(players, 'bot  heron')).toMatch(/computer players/);
    const botPlayers = [{ id: 'b1', name: 'Bot Wren' }];
    expect(nameClash(botPlayers, 'BotWren')).toMatch(/already called/);
  });

  it('keep bots working: the host can still seat every bird', () => {
    let lobby = lobbyWith(1);
    for (let i = 0; i < 5; i++)
      lobby = addBot(lobby, 'p1', { newPlayerId: `b${i}`, palette, pick: 0 }, ctx());
    const names = lobby.players.filter((p) => p.bot).map((p) => p.name);
    expect(new Set(names).size).toBe(5);
    expect(names.every((n) => n.startsWith('Bot '))).toBe(true);
  });
});

describe('the lobby lock', () => {
  it('turns away new players but not seated ones, bots or rejoin codes', () => {
    let lobby = setLocked(lobbyWith(2), 'p1', true, ctx());
    expect(snapshotFor(lobby, 'p1', {}, ctx()).locked).toBe(true);
    expect(() => join(lobby, { ...knockInput('t9', 'Finch') }, ctx())).toThrowError(
      expect.objectContaining({
        code: 'LOCKED',
        message: 'This lobby is locked. Ask the host to unlock it.',
      }),
    );
    expect(join(lobby, knockInput('t2', 'Other'), ctx()).playerId).toBe('p2');
    lobby = addBot(lobby, 'p1', { newPlayerId: 'b1', palette }, ctx());
    expect(lobby.players).toHaveLength(3);
    lobby = createRejoinCode(lobby, 'p2', 'ABCDEF', ctx());
    expect(redeemRejoinCode(lobby, 'ABCDEF', 'tnew', ctx()).playerId).toBe('p2');
    const open = setLocked(lobby, 'p1', false, ctx());
    expect(snapshotFor(open, 'p1', {}, ctx()).locked).toBeUndefined();
    expect(join(open, knockInput('t9', 'Finch'), ctx()).lobby.players).toHaveLength(4);
  });

  it('is the host’s to set, and stays when the host changes', () => {
    const lobby = lobbyWith(2);
    expect(() => setLocked(lobby, 'p2', true, ctx())).toThrow(/host/);
    const locked = setLocked(lobby, 'p1', true, ctx());
    expect(setLocked(locked, 'p1', true, ctx())).toBe(locked);
    const left = { ...locked, hostId: 'p2' };
    expect(setLocked(left, 'p2', false, ctx()).locked).toBe(false);
  });
});

describe('removed players knock to come back', () => {
  const kicked = () => kick(lobbyWith(3), 'p1', 'p3', ctx(1_000));
  const host = (l: Lobby, now = 2_000) => snapshotFor(l, 'p1', {}, ctx(now));

  it('kick remembers the device; leaving does not', () => {
    expect(kicked().removed).toEqual([{ key: 't3', name: 'Rook3', at: 1_000 }]);
    expect(lobbyWith(1).removed).toBeUndefined();
  });

  it('a removed device gets ASK_HOST and a knock only the host sees', () => {
    const out = joinOrKnock(kicked(), knockInput('t3', 'Rook3', 'knock1'), ctx(2_000));
    expect(out.playerId).toBeNull();
    expect(out.refusal).toMatchObject({
      code: 'ASK_HOST',
      message:
        "The host removed you from this lobby. They've been asked whether to let you back in.",
    });
    expect(out.lobby.players).toHaveLength(2);
    expect(host(out.lobby).knocks).toEqual([{ id: 'knock1', name: 'Rook3', avatar: palette[0] }]);
    const guest = snapshotFor(out.lobby, 'p2', {}, ctx(2_000));
    expect(guest.knocks).toBeUndefined();
    expect(snapshotFor(out.lobby, null, {}, ctx(2_000)).knocks).toBeUndefined();
    // No key, removal list or block ever leaves the server.
    const text = JSON.stringify([host(out.lobby), guest]);
    expect(text).not.toContain('t3"');
    expect(text).not.toContain('"removed"');
    expect(text).not.toContain('"blocked"');
    expect(text).not.toContain('"allowed"');
    // join() itself also refuses, so nothing can seat them by another route.
    expect(() => join(kicked(), knockInput('t3', 'Rook3'), ctx(2_000))).toThrowError(
      expect.objectContaining({ code: 'ASK_HOST' }),
    );
  });

  it('retrying does not duplicate the knock, bump the version or post chat', () => {
    const first = joinOrKnock(kicked(), knockInput('t3', 'Rook3', 'knock1'), ctx(2_000)).lobby;
    const again = joinOrKnock(first, knockInput('t3', 'Rook3', 'knock2'), ctx(5_000));
    expect(again.lobby).toBe(first);
    expect(again.refusal?.code).toBe('ASK_HOST');
    // After a minute the time refreshes, still one knock with the same id.
    const later = joinOrKnock(first, knockInput('t3', 'Rook3', 'knock3'), ctx(70_000)).lobby;
    expect(later.knocks).toHaveLength(1);
    expect(later.knocks![0]!.id).toBe('knock1');
    expect(later.chat).toEqual(first.chat);
    // A changed name updates the same knock.
    const renamed = joinOrKnock(first, knockInput('t3', 'Heron', 'knock4'), ctx(5_000)).lobby;
    expect(renamed.knocks).toHaveLength(1);
    expect(renamed.knocks![0]).toMatchObject({ id: 'knock1', name: 'Heron' });
  });

  it('allow seats them on their next join, even in a locked lobby, once', () => {
    let lobby = setLocked(
      joinOrKnock(kicked(), knockInput('t3', 'Rook3', 'knock1'), ctx(2_000)).lobby,
      'p1',
      true,
      ctx(2_000),
    );
    expect(() => answerKnock(lobby, 'p2', 'knock1', true, ctx())).toThrow(/host/);
    expect(() => answerKnock(lobby, 'p1', 'nope', true, ctx())).toThrowError(
      expect.objectContaining({ code: 'KNOCK_GONE' }),
    );
    lobby = answerKnock(lobby, 'p1', 'knock1', true, ctx(3_000));
    expect(lobby.knocks).toEqual([]);
    expect(lobby.removed).toEqual([]);
    expect(lobby.allowed).toEqual(['t3']);
    // A different new device is still turned away by the lock.
    expect(() => join(lobby, knockInput('t9', 'Finch'), ctx(3_000))).toThrow(/locked/);
    const back = joinOrKnock(lobby, knockInput('t3', 'Rook3'), ctx(3_500));
    expect(back.refusal).toBeUndefined();
    expect(back.playerId).toBe('new-t3');
    expect(back.lobby.players).toHaveLength(3);
    expect(back.lobby.allowed).toEqual([]);
  });

  it('deny blocks the device for 10 minutes, then it may knock again', () => {
    const knocked = joinOrKnock(kicked(), knockInput('t3', 'Rook3', 'knock1'), ctx(2_000)).lobby;
    const denied = answerKnock(knocked, 'p1', 'knock1', false, ctx(3_000));
    expect(denied.knocks).toEqual([]);
    expect(denied.blocked).toEqual([{ key: 't3', until: 3_000 + BLOCK_MS }]);
    const blocked = joinOrKnock(denied, knockInput('t3', 'Rook3', 'knock2'), ctx(60_000));
    expect(blocked.refusal).toMatchObject({
      code: 'BLOCKED',
      message: 'The host has blocked you from this lobby for a few minutes.',
    });
    expect(blocked.lobby).toBe(denied);
    expect(host(blocked.lobby, 60_000).knocks).toBeUndefined();
    expect(() => join(denied, knockInput('t3', 'Rook3'), ctx(60_000))).toThrowError(
      expect.objectContaining({ code: 'BLOCKED' }),
    );
    // A rejoin code can't get a blocked device back in either.
    const coded = createRejoinCode(denied, 'p2', 'ABCDEF', ctx(60_000));
    expect(() => redeemRejoinCode(coded, 'ABCDEF', 't3', ctx(60_000))).toThrow(/blocked/);
    const after = joinOrKnock(denied, knockInput('t3', 'Rook3', 'knock5'), ctx(3_001 + BLOCK_MS));
    expect(after.refusal?.code).toBe('ASK_HOST');
    expect(after.lobby.knocks).toHaveLength(1);
  });

  it('knocks stay for a new host, and old ones are pruned', () => {
    const knocked = joinOrKnock(kicked(), knockInput('t3', 'Rook3', 'knock1'), ctx(2_000)).lobby;
    const newHost = { ...knocked, hostId: 'p2' };
    expect(snapshotFor(newHost, 'p2', {}, ctx(2_000)).knocks).toHaveLength(1);
    expect(snapshotFor(newHost, 'p1', {}, ctx(2_000)).knocks).toBeUndefined();
    expect(snapshotFor(knocked, 'p1', {}, ctx(2_000 + KNOCK_TTL_MS)).knocks).toBeUndefined();
    // A new knock prunes the stale one.
    const other = joinOrKnock(
      { ...knocked, removed: [...knocked.removed!, { key: 't8', name: 'Lark', at: 0 }] },
      knockInput('t8', 'Lark', 'knock9'),
      ctx(2_000 + KNOCK_TTL_MS),
    );
    expect(other.lobby.knocks!.map((k) => k.id)).toEqual(['knock9']);
  });

  it('caps the knocks at 5 and the removed list at 30, dropping the oldest', () => {
    let lobby: Lobby = lobbyWith(1);
    lobby = {
      ...lobby,
      removed: Array.from({ length: 8 }, (_, i) => ({ key: `r${i}`, name: `N${i}`, at: 0 })),
    };
    for (let i = 0; i < 8; i++)
      lobby = joinOrKnock(lobby, knockInput(`r${i}`, `Name${i}`, `k${i}`), ctx(2_000 + i)).lobby;
    expect(lobby.knocks!.map((k) => k.id)).toEqual(['k3', 'k4', 'k5', 'k6', 'k7']);
    expect(KNOCK_LIMIT).toBe(5);

    let big = lobbyWith(1);
    for (let i = 0; i < REMOVED_LIMIT + 4; i++) {
      big = join(
        big,
        { tokenKey: `x${i}`, newPlayerId: `x${i}`, name: `Guest${i}`, palette },
        ctx(),
      ).lobby;
      big = kick(big, 'p1', `x${i}`, ctx(1_000 + i));
    }
    expect(big.removed).toHaveLength(REMOVED_LIMIT);
    expect(big.removed![0]!.key).toBe('x4');
  });

  it('blocked and allowed lists are capped too', () => {
    let lobby: Lobby = lobbyWith(1);
    lobby = {
      ...lobby,
      removed: Array.from({ length: 8 }, (_, i) => ({ key: `r${i}`, name: `N${i}`, at: 0 })),
    };
    for (let i = 0; i < 8; i++) {
      lobby = joinOrKnock(lobby, knockInput(`r${i}`, `Name${i}`, `k${i}`), ctx(2_000)).lobby;
      lobby = answerKnock(lobby, 'p1', `k${i}`, true, ctx(2_000));
    }
    expect(lobby.allowed).toEqual(['r3', 'r4', 'r5', 'r6', 'r7']);
  });
});

describe('protocol bounds', () => {
  const parse = (m: unknown) => ClientMessage.safeParse(m).success;

  it('caps id strings at 64 characters', () => {
    const long = 'x'.repeat(65);
    expect(parse({ type: 'kick', playerId: long })).toBe(false);
    expect(parse({ type: 'transferHost', playerId: long })).toBe(false);
    expect(parse({ type: 'action', sessionId: long, seq: 0, action: {} })).toBe(false);
    expect(parse({ type: 'answerKnock', id: long, allow: true })).toBe(false);
    expect(parse({ type: 'kick', playerId: 'x'.repeat(64) })).toBe(true);
  });

  it('caps the size and key count of setOptions', () => {
    expect(parse({ type: 'setOptions', options: { rounds: 3 } })).toBe(true);
    expect(parse({ type: 'setOptions', options: { text: 'x'.repeat(5000) } })).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1]));
    expect(parse({ type: 'setOptions', options: many })).toBe(false);
  });

  it('knows the new host messages', () => {
    expect(parse({ type: 'setLocked', locked: true })).toBe(true);
    expect(parse({ type: 'setLocked', locked: 'yes' })).toBe(false);
    expect(parse({ type: 'answerKnock', id: 'abc', allow: false })).toBe(true);
  });
});

describe('a game timer that throws', () => {
  const broken = {
    ...counterGame,
    nextTimer: () => ({ id: 'tick', at: 0 }),
    onTimer: () => {
      throw new TypeError('boom');
    },
  };
  const g = { counter: broken };
  const running = () => {
    const lobby = createLobby(
      {
        code: 'ABCD',
        hostId: 'p1',
        hostName: 'Wren',
        hostAvatar: palette[0]!,
        tokenKey: 't1',
        gameId: 'counter',
      },
      { now: 0, games: g },
    );
    const two = join(
      lobby,
      { tokenKey: 't2', newPlayerId: 'p2', name: 'Rook', palette },
      { now: 0, games: g },
    ).lobby;
    return start(two, 'p1', { sessionId: 's1', seed: 1 }, { now: 0, games: g });
  };

  it('is marked failed, and then left alone until the game moves on', () => {
    const lobby = running();
    expect(nextTimerAt(lobby, { games: g, now: 10 })).toBe(0);
    expect(() => runTimers(lobby, { now: 10, games: g })).toThrow('boom');
    const marked = markTimerFailed(lobby);
    expect(marked.session!.timerFailed).toEqual({ seq: 0 });
    expect(markTimerFailed(marked)).toBe(marked);
    expect(nextTimerAt(marked, { games: g, now: 10 })).toBeNull();
    expect(runTimers(marked, { now: 10, games: g })).toBe(marked);
  });
});

describe('128-bit seeds in a session', () => {
  it('start accepts a hex seed and keeps the rng state as a string', () => {
    const lobby = createLobby(
      {
        code: 'ABCD',
        hostId: 'p1',
        hostName: 'Wren',
        hostAvatar: palette[0]!,
        tokenKey: 't1',
        gameId: 'counter',
      },
      ctx(),
    );
    const two = join(
      lobby,
      { tokenKey: 't2', newPlayerId: 'p2', name: 'Rook', palette },
      ctx(),
    ).lobby;
    const seed = '0123456789abcdef0123456789abcdef';
    const a = start(two, 'p1', { sessionId: 's1', seed }, ctx());
    const b = start(two, 'p1', { sessionId: 's1', seed }, ctx());
    expect(a.session!.state).toEqual(b.session!.state);
    expect(typeof a.session!.rngState).toBe('string');
    // A lobby saved with a numeric state keeps working.
    const old = start(two, 'p1', { sessionId: 's1', seed: 7 }, ctx());
    expect(typeof old.session!.rngState).toBe('number');
  });
});
