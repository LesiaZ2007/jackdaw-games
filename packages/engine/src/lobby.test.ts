import { describe, expect, it } from 'vitest';
import {
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
  react,
  reassignHostIfAway,
  redeemRejoinCode,
  rename,
  runTimers,
  setAvatar,
  setGame,
  setOptions,
  snapshotFor,
  start,
  startBlocker,
  transferHost,
  type Ctx,
  type Lobby,
} from './lobby';
import { counterGame } from './testing/counter-game';
import { systemText, type Avatar } from './protocol';

const games = { counter: counterGame };
const ctx = (now = 1_000): Ctx => ({ now, games });
const palette: Avatar[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((x, i) => ({
  crest: `crest-${x}`,
  tint: `tint-${i}`,
}));

function lobbyWith(n: number, gameId?: string): Lobby {
  let lobby = createLobby(
    {
      code: 'ABCD',
      hostId: 'p1',
      hostName: 'Ana',
      hostAvatar: palette[0]!,
      tokenKey: 't1',
      gameId,
    },
    ctx(),
  );
  for (let i = 2; i <= n; i++) {
    lobby = join(
      lobby,
      { tokenKey: `t${i}`, newPlayerId: `p${i}`, name: `P${i}`, palette },
      ctx(),
    ).lobby;
  }
  return lobby;
}

/** Plays the counter game to the end: players add in turn until the target is hit. */
function playOut(lobby: Lobby): Lobby {
  while (lobby.status === 'in_game') {
    const s = lobby.session!;
    const turn = (s.state as { players: string[]; turn: number }).players[
      (s.state as { turn: number }).turn
    ]!;
    lobby = applyGameAction(
      lobby,
      turn,
      { sessionId: s.id, seq: s.seq, action: { type: 'add' } },
      ctx(),
    );
  }
  return lobby;
}

describe('creating and joining', () => {
  it('home-page lobbies start with no game; catalog lobbies preselect one with defaults', () => {
    expect(lobbyWith(1).selectedGameId).toBeNull();
    const fromCatalog = lobbyWith(1, 'counter');
    expect(fromCatalog.selectedGameId).toBe('counter');
    expect(fromCatalog.gameOptions).toEqual({ target: 3 });
  });

  it('a returning token reclaims its seat instead of taking a new one', () => {
    const lobby = lobbyWith(3);
    const again = join(
      lobby,
      { tokenKey: 't2', newPlayerId: 'zzz', name: 'Other', palette },
      ctx(),
    );
    expect(again.playerId).toBe('p2');
    expect(again.lobby.players).toHaveLength(3);
  });

  it('caps the lobby at 15 players', () => {
    const full = lobbyWith(15);
    expect(() =>
      join(full, { tokenKey: 'tx', newPlayerId: 'px', name: 'X', palette }, ctx()),
    ).toThrow(/full/);
  });

  it('gives every player a unique avatar', () => {
    const lobby = lobbyWith(4);
    const crests = new Set(lobby.players.map((p) => p.avatar.crest));
    const tints = new Set(lobby.players.map((p) => p.avatar.tint));
    expect(crests.size).toBe(4);
    expect(tints.size).toBe(4);
    expect(() => setAvatar(lobby, 'p2', lobby.players[0]!.avatar, ctx())).toThrow(/already has/);
  });
});

describe('host powers', () => {
  it('only the host can pick the game', () => {
    const lobby = lobbyWith(3);
    expect(() => setGame(lobby, 'p2', 'counter', ctx())).toThrow(/host/);
    expect(setGame(lobby, 'p1', 'counter', ctx()).selectedGameId).toBe('counter');
  });

  it('validates options with the game schema', () => {
    const lobby = lobbyWith(3, 'counter');
    expect(() => setOptions(lobby, 'p1', { target: 99 }, ctx())).toThrow();
    expect(setOptions(lobby, 'p1', { target: 5 }, ctx()).gameOptions).toEqual({ target: 5 });
  });

  it('explains why a game cannot start', () => {
    expect(startBlocker(lobbyWith(1, 'counter'), ctx())).toBe('Needs 2 to 4 players.');
    expect(startBlocker(lobbyWith(5, 'counter'), ctx())).toBe('Needs 2 to 4 players.');
    const lowTarget = setOptions(lobbyWith(3, 'counter'), 'p1', { target: 2 }, ctx());
    expect(startBlocker(lowTarget, ctx())).toMatch(/Target/);
    expect(startBlocker(lobbyWith(3, 'counter'), ctx())).toBeNull();
  });

  it('kicks and transfers host', () => {
    const lobby = lobbyWith(3);
    const kicked = kick(lobby, 'p1', 'p3', ctx());
    expect(kicked.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(Object.values(kicked.seats)).not.toContain('p3');
    expect(transferHost(lobby, 'p1', 'p2', ctx()).hostId).toBe('p2');
  });

  it('hands host to the longest-connected online player after 60s away', () => {
    const lobby = lobbyWith(3);
    const now = 200_000;
    const presence = { p1: now - 61_000, p2: now - 5_000, p3: now - 1_000 };
    expect(reassignHostIfAway(lobby, presence, ctx(now)).hostId).toBe('p2');
    expect(reassignHostIfAway(lobby, { ...presence, p1: now - 30_000 }, ctx(now))).toBe(lobby);
  });

  it('a leaving host passes host on', () => {
    expect(leave(lobbyWith(3), 'p1', ctx()).hostId).toBe('p2');
  });
});

describe('running a game', () => {
  it('end then back to lobby keeps the selected game and options', () => {
    let lobby = setOptions(lobbyWith(3, 'counter'), 'p1', { target: 4 }, ctx());
    lobby = start(lobby, 'p1', { sessionId: 's1', seed: 7 }, ctx());
    lobby = playOut(lobby);
    expect(lobby.status).toBe('results');
    expect(lobby.history[0]?.gameId).toBe('counter');
    lobby = backToLobby(lobby, 'p1', ctx());
    expect(lobby.status).toBe('waiting');
    expect(lobby.selectedGameId).toBe('counter');
    expect(lobby.gameOptions).toEqual({ target: 4 });
  });

  it('play again starts a fresh session of the same game with the same options', () => {
    let lobby = setOptions(lobbyWith(3, 'counter'), 'p1', { target: 5 }, ctx());
    lobby = playOut(start(lobby, 'p1', { sessionId: 's1', seed: 7 }, ctx()));
    lobby = playAgain(lobby, 'p1', { sessionId: 's2', seed: 8 }, ctx());
    expect(lobby.status).toBe('in_game');
    expect(lobby.session?.id).toBe('s2');
    expect((lobby.session?.state as { target: number }).target).toBe(5);
  });

  it('play again waits in the lobby if the game no longer fits', () => {
    let lobby = playOut(start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 1 }, ctx()));
    lobby = join(lobby, { tokenKey: 't4', newPlayerId: 'p4', name: 'D', palette }, ctx()).lobby;
    lobby = join(lobby, { tokenKey: 't5', newPlayerId: 'p5', name: 'E', palette }, ctx()).lobby;
    lobby = playAgain(lobby, 'p1', { sessionId: 's2', seed: 2 }, ctx());
    expect(lobby.status).toBe('waiting');
    expect(lobby.selectedGameId).toBe('counter');
  });

  it('records scores across games', () => {
    let lobby = playOut(start(lobbyWith(2, 'counter'), 'p1', { sessionId: 's1', seed: 1 }, ctx()));
    lobby = playOut(playAgain(lobby, 'p1', { sessionId: 's2', seed: 2 }, ctx()));
    const total = Object.values(lobby.scores).reduce((n, s) => n + s.wins, 0);
    expect(total).toBe(2);
    expect(lobby.scores.p1?.played).toBe(2);
  });

  it('rejects actions from an earlier game, from the future, and out of turn', () => {
    let lobby = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 1 }, ctx());
    const add = { type: 'add' };
    expect(() =>
      applyGameAction(lobby, 'p1', { sessionId: 'old', seq: 0, action: add }, ctx()),
    ).toThrow(/moved on/);
    expect(() =>
      applyGameAction(lobby, 'p1', { sessionId: 's1', seq: 5, action: add }, ctx()),
    ).toThrow(/moved on/);
    expect(() =>
      applyGameAction(lobby, 'p2', { sessionId: 's1', seq: 0, action: add }, ctx()),
    ).toThrow(/not your turn/);
    expect(() =>
      applyGameAction(lobby, 'p1', { sessionId: 's1', seq: 0, action: { type: 'x' } }, ctx()),
    ).toThrow(/understood/);
    lobby = applyGameAction(lobby, 'p1', { sessionId: 's1', seq: 0, action: add }, ctx());
    // A slightly behind seq in the same session is fine: the game's rules judge it.
    expect(
      applyGameAction(lobby, 'p2', { sessionId: 's1', seq: 0, action: add }, ctx()).session?.seq,
    ).toBe(2);
  });

  it('is deterministic for the same seed', () => {
    const a = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's', seed: 42 }, ctx());
    const b = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's', seed: 42 }, ctx());
    expect(a.session?.state).toEqual(b.session?.state);
  });

  it('players who join mid-game watch, then get seated next game', () => {
    let lobby = start(lobbyWith(2, 'counter'), 'p1', { sessionId: 's1', seed: 1 }, ctx());
    lobby = join(lobby, { tokenKey: 't3', newPlayerId: 'p3', name: 'Late', palette }, ctx()).lobby;
    const snap = snapshotFor(lobby, 'p3', {}, ctx());
    expect(snap.players.find((p) => p.id === 'p3')?.seated).toBe(false);
    expect(snap.view).toBeUndefined();
    expect(snap.tableView).toBeDefined();
    expect(() => leave(lobby, 'p1', ctx())).toThrow(/once this game ends/);
    lobby = playAgain(playOut(lobby), 'p1', { sessionId: 's2', seed: 2 }, ctx());
    expect(lobby.session?.playerIds).toContain('p3');
  });
});

describe('hidden information in snapshots', () => {
  it('never includes tokens, rejoin codes of others, or another player’s secret', () => {
    let lobby = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 9 }, ctx());
    lobby = createRejoinCode(lobby, 'p2', 'QWERTY', ctx());
    const secrets = (lobby.session!.state as { secrets: Record<string, number> }).secrets;

    const forP1 = snapshotFor(lobby, 'p1', {}, ctx());
    const json = JSON.stringify(forP1);
    expect(json).not.toMatch(/"t[123]"/);
    expect(json).not.toContain('QWERTY');
    expect(json).not.toContain('"secrets"');
    expect((forP1.view as { secret: number }).secret).toBe(secrets.p1);

    const tv = snapshotFor(lobby, null, {}, ctx());
    expect(tv.view).toBeUndefined();
    for (const value of Object.values(secrets))
      expect(JSON.stringify(tv.tableView)).not.toContain(String(value));

    expect(snapshotFor(lobby, 'p2', {}, ctx()).rejoinCode?.code).toBe('QWERTY');
  });

  it('counts recently seen TV displays, not players', () => {
    const lobby = lobbyWith(2);
    const snap = snapshotFor(lobby, null, { 'tv:a': 40_000, 'tv:b': 0, p1: 49_000 }, ctx(50_000));
    expect(snap.displays).toBe(1);
    expect(snap.players.find((p) => p.id === 'p1')?.online).toBe(true);
  });
});

describe('rejoin codes and chat', () => {
  it('moves a seat to a new device once', () => {
    let lobby = createRejoinCode(lobbyWith(2), 'p2', 'ZXCVBN', ctx());
    const moved = redeemRejoinCode(lobby, 'ZXCVBN', 'new-device', ctx());
    expect(moved.playerId).toBe('p2');
    expect(moved.lobby.seats['new-device']).toBe('p2');
    expect(moved.lobby.seats.t2).toBeUndefined();
    expect(() => redeemRejoinCode(moved.lobby, 'ZXCVBN', 'again', ctx())).toThrow(/expired/);
    lobby = createRejoinCode(lobbyWith(2), 'p2', 'ZXCVBN', ctx(0));
    expect(() => redeemRejoinCode(lobby, 'ZXCVBN', 'late', ctx(11 * 60_000))).toThrow(/expired/);
  });

  it('keeps the last 120 chat messages', () => {
    let lobby = lobbyWith(2);
    for (let i = 0; i < 130; i++) lobby = chat(lobby, 'p1', `m${i}`, `id${i}`, ctx());
    expect(lobby.chat).toHaveLength(120);
    expect(lobby.chat[0]?.text).toBe('m10');
  });
});

describe('history and standings', () => {
  it('records participants, names at the time, and derived win/loss standings', () => {
    const lobby = playOut(
      start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 3 }, ctx(500)),
    );
    const entry = lobby.history[0]!;
    expect(entry.players).toEqual(['p1', 'p2', 'p3']);
    expect(entry.names).toEqual({ p1: 'Ana', p2: 'P2', p3: 'P3' });
    expect(entry.startedAt).toBe(500);
    expect(entry.standings.map((s) => s.outcome).sort()).toEqual(['loss', 'loss', 'win']);
    const winner = entry.winners[0]!;
    expect(lobby.scores[winner]).toEqual({ wins: 1, losses: 0, played: 1 });
    const loser = entry.players.find((id) => id !== winner)!;
    expect(lobby.scores[loser]).toEqual({ wins: 0, losses: 1, played: 1 });
  });

  it("uses the game's own standings, filling in anyone it left out", () => {
    const teamGame: typeof counterGame = {
      ...counterGame,
      getResult(s) {
        const r = counterGame.getResult(s);
        return (
          r && {
            ...r,
            standings: [
              { playerId: 'p1', outcome: 'draw', team: 'Red', role: 'Captain' },
              { playerId: 'ghost', outcome: 'win' },
            ],
          }
        );
      },
    };
    const c: Ctx = { now: 1_000, games: { counter: teamGame } };
    let lobby = start(lobbyWith(2, 'counter'), 'p1', { sessionId: 's1', seed: 3 }, c);
    while (lobby.status === 'in_game') {
      const s = lobby.session!;
      const st = s.state as { players: string[]; turn: number };
      const action = { sessionId: s.id, seq: s.seq, action: { type: 'add' } };
      lobby = applyGameAction(lobby, st.players[st.turn]!, action, c);
    }
    const standings = lobby.history[0]!.standings;
    expect(standings.map((s) => s.playerId)).toEqual(['p1', 'p2']);
    expect(standings[0]).toEqual({ playerId: 'p1', outcome: 'draw', team: 'Red', role: 'Captain' });
    expect(lobby.scores.p1).toEqual({ wins: 0, losses: 0, played: 1 });
  });

  it('sends only the latest 10 games in each snapshot', () => {
    let lobby = lobbyWith(2, 'counter');
    for (let i = 0; i < 12; i++) {
      lobby = playOut(start(lobby, 'p1', { sessionId: `s${i}`, seed: i }, ctx()));
      lobby = backToLobby(lobby, 'p1', ctx());
    }
    expect(lobby.history).toHaveLength(12);
    const snap = snapshotFor(lobby, 'p1', {}, ctx());
    expect(snap.history).toHaveLength(10);
    expect(snap.historyCount).toBe(12);
  });
});

describe('platform additions', () => {
  it('refuses a name someone at the table already has, in any case', () => {
    const lobby = lobbyWith(2);
    expect(() =>
      join(lobby, { tokenKey: 'tx', newPlayerId: 'px', name: ' ana ', palette }, ctx()),
    ).toThrow('Someone at the table is already called Ana.');
    expect(() => rename(lobby, 'p2', 'ANA', ctx())).toThrow(/already called Ana/);
    // Changing only the case of your own name is fine.
    expect(rename(lobby, 'p1', 'ANA', ctx()).players[0]!.name).toBe('ANA');
  });

  it('lets the host end a game early without recording it', () => {
    const running = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 2 }, ctx());
    expect(() => endGameEarly(running, 'p2', ctx())).toThrow(/Only the host/);
    const ended = endGameEarly(running, 'p1', ctx());
    expect(ended.status).toBe('waiting');
    expect(ended.session).toBeNull();
    expect(ended.results).toBeNull();
    expect(ended.history).toEqual([]);
    expect(ended.scores).toEqual({});
    expect(ended.selectedGameId).toBe('counter');
    expect(ended.chat.at(-1)?.text).toBe('The host ended the game early.');
    expect(() => endGameEarly(ended, 'p1', ctx())).toThrow(/waiting/);
  });

  it('keeps one reaction per player for six seconds, ignoring repeats within 800ms', () => {
    let lobby = lobbyWith(2);
    lobby = react(lobby, 'p1', 'up', 'r1', ctx(1_000));
    expect(react(lobby, 'p1', 'haha', 'r2', ctx(1_500))).toBe(lobby);
    lobby = react(lobby, 'p1', 'haha', 'r3', ctx(1_900));
    lobby = react(lobby, 'p2', 'sus', 'r4', ctx(2_000));
    expect(snapshotFor(lobby, null, {}, ctx(2_000)).reactions).toEqual([
      { id: 'r3', playerId: 'p1', kind: 'haha', at: 1_900 },
      { id: 'r4', playerId: 'p2', kind: 'sus', at: 2_000 },
    ]);
    expect(snapshotFor(lobby, null, {}, ctx(7_950)).reactions.map((r) => r.id)).toEqual(['r4']);
    expect(() => react(lobby, 'nobody', 'up', 'r5', ctx())).toThrow(/not in this lobby/);
  });

  it('posts system lines for joins, leaves, removals, host changes and games', () => {
    let lobby = lobbyWith(4, 'counter');
    lobby = kick(lobby, 'p1', 'p4', ctx());
    lobby = leave(lobby, 'p1', ctx());
    lobby = playOut(start(lobby, 'p2', { sessionId: 's1', seed: 4 }, ctx()));
    const names = Object.fromEntries(lobby.players.map((p) => [p.id, p.name]));
    const lines = lobby.chat.filter((m) => m.system).map((m) => systemText(m, names));
    expect(lines.slice(0, 7)).toEqual([
      'P2 joined.',
      'P3 joined.',
      'P4 joined.',
      'P4 was removed by the host.',
      'Ana left.',
      'P2 is now the host.',
      'Counter started.',
    ]);
    // The game's own announcements follow, then the result.
    expect(lines[7]).toMatch(/^P[23] goes first\.$/);
    expect(lines.at(-1)).toBe('Game over. Reached 3');
    expect(lobby.chat.every((m) => m.system || m.playerId)).toBe(true);
    expect(new Set(lobby.chat.map((m) => m.id)).size).toBe(lobby.chat.length);
  });

  it('system lines keep the names of players who have left', () => {
    const lobby = leave(lobbyWith(3), 'p3', ctx());
    const line = lobby.chat.find((m) => m.text === '{p3} left.')!;
    expect(systemText(line, {})).toBe('P3 left.');
  });

  it('system lines and reactions carry nothing private', () => {
    let lobby = start(lobbyWith(3, 'counter'), 'p1', { sessionId: 's1', seed: 9 }, ctx());
    lobby = react(lobby, 'p2', 'wow', 'r1', ctx());
    lobby = createRejoinCode(lobby, 'p2', 'QWERTY', ctx());
    const tv = snapshotFor(lobby, null, {}, ctx());
    const shared = JSON.stringify({ chat: tv.chat, reactions: tv.reactions });
    expect(shared).not.toContain('QWERTY');
    expect(shared).not.toMatch(/"t[123]"/);
    expect(shared).not.toContain('secret');
    // Only the public fields, nothing copied from the game's state.
    for (const m of tv.chat)
      expect(Object.keys(m).sort()).toEqual(
        m.system
          ? expect.arrayContaining(['at', 'id', 'system', 'text'])
          : ['at', 'id', 'playerId', 'text'],
      );
    for (const r of tv.reactions)
      expect(Object.keys(r).sort()).toEqual(['at', 'id', 'kind', 'playerId']);
  });
});

describe('game timers', () => {
  // The counter game with a clock: whoever's turn it is adds 1 by themselves every second from 5s.
  const timed = {
    ...counterGame,
    meta: { ...counterGame.meta, id: 'timed' },
    nextTimer: (s: { count: number }) => ({ id: 'tick', at: 5_000 + s.count * 1_000 }),
    onTimer: (s: Parameters<typeof counterGame.applyAction>[0]) =>
      counterGame.applyAction(s, s.players[s.turn]!, { type: 'add' }, null as never, 0),
  };
  const tctx = (now: number): Ctx => ({ now, games: { timed } });
  const started = () => {
    let lobby = lobbyWith(2);
    lobby = setGame(lobby, 'p1', 'timed', tctx(1_000));
    lobby = setOptions(lobby, 'p1', { target: 10 }, tctx(1_000));
    return start(lobby, 'p1', { sessionId: 's1', seed: 7 }, tctx(1_000));
  };

  it('fire once due, each as a move, and the snapshot says when the next one is', () => {
    const lobby = started();
    expect(runTimers(lobby, tctx(4_999))).toBe(lobby);
    const snap = snapshotFor(lobby, 'p1', {}, tctx(4_000));
    expect(snap.timerAt).toBe(5_000);
    expect(snap.serverNow).toBe(4_000);
    const later = runTimers(lobby, tctx(6_500));
    expect((later.session!.state as { count: number }).count).toBe(2);
    expect(later.session!.seq).toBe(lobby.session!.seq + 2);
    expect(later.version).toBe(lobby.version + 2);
    expect(snapshotFor(later, null, {}, tctx(6_500)).timerAt).toBe(7_000);
  });

  it('can end the game', () => {
    const over = runTimers(started(), tctx(60_000));
    expect(over.status).toBe('results');
    expect(over.results?.summary).toBe('Reached 10');
  });
});
