import { lobbyStats, type HistoryEntry, type ScoreLine } from '@jackdaw/engine';

/**
 * "The night so far" on the TV lobby, worked out from what a TV may see: the lobby's running
 * score tally and its finished games (public post-game records only, never a live game).
 */

export interface NightRow {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  played: number;
  /** 1 for the leader. Players level on wins and losses share a rank. */
  rank: number;
}

export interface NightSummary {
  games: number;
  /** The score tally, most wins first. Only players who have played. */
  table: NightRow[];
  /** The longest run of wins in a row tonight, if anyone won two or more running. */
  streak: { length: number; holders: { playerId: string; name: string }[] } | null;
  /** The game played most, once it has been played at least twice. */
  favourite: { gameId: string; played: number } | null;
  /** From the first game's start to the last game's end. */
  minutes: number;
}

/**
 * `history` is newest first, as the lobby keeps it. `names` holds the current names of players
 * still in the lobby; anyone who has left keeps the name they last played under.
 */
export function nightSummary(
  history: readonly HistoryEntry[],
  scores: Record<string, ScoreLine>,
  names: Record<string, string>,
): NightSummary {
  const nameOf = (id: string) =>
    names[id] ?? history.find((h) => h.names[id])?.names[id] ?? 'Someone who left';

  const sorted = Object.entries(scores)
    .filter(([, s]) => s.played > 0)
    .map(([playerId, s]) => ({ playerId, name: nameOf(playerId), ...s }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name));
  const table: NightRow[] = [];
  sorted.forEach((row, i) => {
    const prev = table[i - 1];
    const level = prev && prev.wins === row.wins && prev.losses === row.losses;
    table.push({ ...row, rank: level ? prev.rank : i + 1 });
  });

  // Runs of wins, game by game in the order they were played. Only games a player was in count.
  const run = new Map<string, number>();
  const best = new Map<string, number>();
  for (const entry of [...history].reverse()) {
    for (const s of entry.standings) {
      const n = s.outcome === 'win' ? (run.get(s.playerId) ?? 0) + 1 : 0;
      run.set(s.playerId, n);
      best.set(s.playerId, Math.max(best.get(s.playerId) ?? 0, n));
    }
  }
  const longest = Math.max(0, ...best.values());
  const streak =
    longest >= 2
      ? {
          length: longest,
          holders: [...best]
            .filter(([, n]) => n === longest)
            .map(([playerId]) => ({ playerId, name: nameOf(playerId) })),
        }
      : null;

  const top = lobbyStats(history).games[0];
  const favourite = top && top.played >= 2 ? { gameId: top.gameId, played: top.played } : null;

  const first = history[history.length - 1];
  const last = history[0];
  const minutes =
    first && last ? Math.max(0, Math.round((last.endedAt - first.startedAt) / 60_000)) : 0;

  return { games: history.length, table, streak, favourite, minutes };
}

/** "45 minutes", "1 hour", "2 hours 10 minutes". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (h === 0) return part(Math.max(1, m), 'minute');
  return m === 0 ? part(h, 'hour') : `${part(h, 'hour')} ${part(m, 'minute')}`;
}
