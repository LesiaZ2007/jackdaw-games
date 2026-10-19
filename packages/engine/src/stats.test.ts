import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from './protocol';
import { lobbyStats } from './stats';

const entry = (
  over: Partial<HistoryEntry> & Pick<HistoryEntry, 'gameId' | 'endedAt' | 'standings'>,
): HistoryEntry => ({
  startedAt: over.endedAt - 1000,
  summary: '',
  winners: over.standings.filter((s) => s.outcome === 'win').map((s) => s.playerId),
  players: over.standings.map((s) => s.playerId),
  names: { a: 'Jay', b: 'Rook', c: 'Magpie' },
  ...over,
});

// Newest first, as the lobby keeps it.
const history: HistoryEntry[] = [
  entry({
    gameId: 'avalon',
    endedAt: 300,
    names: { a: 'Jay R', b: 'Rook', c: 'Magpie' },
    standings: [
      { playerId: 'a', outcome: 'win', team: 'Evil', role: 'Assassin' },
      { playerId: 'b', outcome: 'loss', team: 'Good', role: 'Merlin' },
      { playerId: 'c', outcome: 'loss', team: 'Good', role: 'Loyal Servant' },
    ],
  }),
  entry({
    gameId: 'rps',
    endedAt: 200,
    standings: [
      { playerId: 'a', outcome: 'draw' },
      { playerId: 'b', outcome: 'draw' },
    ],
  }),
  entry({
    gameId: 'avalon',
    endedAt: 100,
    standings: [
      { playerId: 'a', outcome: 'loss', team: 'Good', role: 'Merlin' },
      { playerId: 'b', outcome: 'win', team: 'Evil', role: 'Morgana' },
      { playerId: 'c', outcome: 'loss', team: 'Good', role: 'Percival' },
    ],
  }),
];

describe('lobbyStats', () => {
  const stats = lobbyStats(history);

  it('totals each player and uses their latest name', () => {
    const ana = stats.players.find((p) => p.playerId === 'a')!;
    expect(ana).toMatchObject({ name: 'Jay R', played: 3, wins: 1, losses: 1, draws: 1 });
    expect(stats.players.find((p) => p.playerId === 'c')).toMatchObject({
      played: 2,
      wins: 0,
      losses: 2,
    });
  });

  it('breaks results down by game, team and role', () => {
    const ana = stats.players.find((p) => p.playerId === 'a')!;
    expect(ana.byGame.avalon).toMatchObject({ played: 2, wins: 1 });
    expect(ana.byGame.avalon!.byTeam).toEqual({
      Evil: { played: 1, wins: 1 },
      Good: { played: 1, wins: 0 },
    });
    expect(ana.byGame.avalon!.byRole.Merlin).toEqual({ played: 1, wins: 0 });
    expect(ana.byGame.rps).toEqual({ played: 1, wins: 0, byTeam: {}, byRole: {} });
  });

  it('totals each game and sorts players and games', () => {
    expect(stats.totalGames).toBe(3);
    expect(stats.games).toEqual([
      { gameId: 'avalon', played: 2, lastPlayedAt: 300 },
      { gameId: 'rps', played: 1, lastPlayedAt: 200 },
    ]);
    // Jay and Rook both have 1 win from 3 games; the name breaks the tie. Magpie has none.
    expect(stats.players.map((p) => p.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('is empty for a new lobby', () => {
    expect(lobbyStats([])).toEqual({ totalGames: 0, players: [], games: [] });
  });
});
