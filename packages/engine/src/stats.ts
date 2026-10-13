import type { HistoryEntry } from './protocol';

/**
 * Lobby stats, computed from the lobby's history (newest first). Pure, so the server can serve
 * it and tests can check it. Team and role breakdowns sit under each game, because labels like
 * "Good" mean different things in different games.
 */

export interface StatLine {
  played: number;
  wins: number;
}

export interface PlayerGameStats extends StatLine {
  /** Keyed by the game's team label, e.g. "Evil". */
  byTeam: Record<string, StatLine>;
  /** Keyed by the game's role label, e.g. "Assassin". */
  byRole: Record<string, StatLine>;
}

export interface PlayerStats {
  playerId: string;
  /** The most recent name this player played under. */
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  byGame: Record<string, PlayerGameStats>;
}

export interface GameTotals {
  gameId: string;
  played: number;
  lastPlayedAt: number;
}

export interface LobbyStats {
  totalGames: number;
  /** Most wins first, then most games played, then name. */
  players: PlayerStats[];
  /** Most played first, then most recent. */
  games: GameTotals[];
}

function bump(line: StatLine, won: boolean) {
  line.played += 1;
  if (won) line.wins += 1;
}

export function lobbyStats(history: readonly HistoryEntry[]): LobbyStats {
  const players = new Map<string, PlayerStats>();
  const games = new Map<string, GameTotals>();

  for (const entry of history) {
    const totals = games.get(entry.gameId) ?? { gameId: entry.gameId, played: 0, lastPlayedAt: 0 };
    totals.played += 1;
    totals.lastPlayedAt = Math.max(totals.lastPlayedAt, entry.endedAt);
    games.set(entry.gameId, totals);

    for (const s of entry.standings) {
      let p = players.get(s.playerId);
      if (!p) {
        // History is newest first, so the first name we meet is the latest one.
        p = {
          playerId: s.playerId,
          name: entry.names[s.playerId] ?? 'Unknown',
          played: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          byGame: {},
        };
        players.set(s.playerId, p);
      }
      const won = s.outcome === 'win';
      p.played += 1;
      if (won) p.wins += 1;
      else if (s.outcome === 'loss') p.losses += 1;
      else p.draws += 1;

      const g = (p.byGame[entry.gameId] ??= { played: 0, wins: 0, byTeam: {}, byRole: {} });
      bump(g, won);
      if (s.team) bump((g.byTeam[s.team] ??= { played: 0, wins: 0 }), won);
      if (s.role) bump((g.byRole[s.role] ??= { played: 0, wins: 0 }), won);
    }
  }

  return {
    totalGames: history.length,
    players: [...players.values()].sort(
      (a, b) => b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name),
    ),
    games: [...games.values()].sort(
      (a, b) => b.played - a.played || b.lastPlayedAt - a.lastPlayedAt,
    ),
  };
}
