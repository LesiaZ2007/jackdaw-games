'use client';

import { useEffect, useState } from 'react';
import type { HistoryEntry, LobbySnapshot, LobbyStats, PlayerStats } from '@jackdaw/engine';
import { Sheet, Token } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { nightSummary } from '@/lib/night';

type Tab = 'players' | 'games' | 'tonight';
const gameName = (id: string) => catalogEntry(id)?.meta.name ?? id;
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const pct = (wins: number, played: number) => (played ? Math.round((wins / played) * 100) : 0);

function Breakdown({ p }: { p: PlayerStats }) {
  return (
    <div className="pad__detail">
      {Object.entries(p.byGame).map(([gameId, g]) => {
        const teams = Object.entries(g.byTeam).map(
          ([t, l]) => `${t} ${l.wins}–${l.played - l.wins}`,
        );
        const roles = Object.entries(g.byRole).map(([r, l]) => `${r} ×${l.played}`);
        return (
          <p key={gameId}>
            <b>{gameName(gameId)}</b> {g.played} played, {g.wins} won.
            {teams.length > 0 && <> {teams.join(', ')}.</>}
            {roles.length > 0 && <> {roles.join(', ')}.</>}
          </p>
        );
      })}
    </div>
  );
}

/** Game stats for this lobby, kept on a score pad: by player, by game, and tonight's log. */
export function StatsSheet({
  open,
  onClose,
  code,
  snapshot,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  snapshot: LobbySnapshot;
}) {
  const [tab, setTab] = useState<Tab>('players');
  const [data, setData] = useState<{ stats: LobbyStats; history: HistoryEntry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const count = snapshot.historyCount;

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/lobby/${code}/stats`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => live && (setData(body), setFailed(false)))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, code, count]);

  const avatars = new Map(snapshot.players.map((p) => [p.id, p.avatar]));

  return (
    <Sheet open={open} onClose={onClose} title="Game stats" className="pad">
      <div className="pad__tabs" role="tablist">
        {(['players', 'games', 'tonight'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t === 'players' ? 'Players' : t === 'games' ? 'By game' : 'Tonight'}
          </button>
        ))}
      </div>

      {failed && <p className="pad__empty">Couldn&rsquo;t load the stats. Close and try again.</p>}
      {!failed && !data && <p className="pad__empty">Totting up the score pad…</p>}
      {data && data.stats.totalGames === 0 && (
        <p className="pad__empty">No games finished yet. Play one and the score pad fills in.</p>
      )}

      {data && data.stats.totalGames > 0 && tab === 'players' && (
        <table className="pad__sheet">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Played</th>
              <th scope="col">Won</th>
              <th scope="col">Lost</th>
              <th scope="col">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {data.stats.players.flatMap((p) => {
              const isOpen = openPlayer === p.playerId;
              const avatar = avatars.get(p.playerId);
              const rows = [
                <tr key={p.playerId} className={isOpen ? 'open' : undefined}>
                  <td>
                    <button
                      type="button"
                      className="pad__who"
                      aria-expanded={isOpen}
                      onClick={() => setOpenPlayer(isOpen ? null : p.playerId)}
                    >
                      {avatar && <Token avatar={avatar} size={26} />}
                      {p.name}
                    </button>
                  </td>
                  <td>{p.played}</td>
                  <td>{p.wins}</td>
                  <td>{p.losses}</td>
                  <td>
                    <span className="pad__bar" aria-label={`${pct(p.wins, p.played)} percent`}>
                      <i style={{ width: `${pct(p.wins, p.played)}%` }} />
                    </span>
                  </td>
                </tr>,
              ];
              if (isOpen)
                rows.push(
                  <tr key={`${p.playerId}-d`} className="detail">
                    <td colSpan={5}>
                      <Breakdown p={p} />
                    </td>
                  </tr>,
                );
              return rows;
            })}
          </tbody>
        </table>
      )}

      {data && data.stats.totalGames > 0 && tab === 'games' && (
        <ul className="pad__list">
          {data.stats.games.map((g) => {
            const best = data.stats.players
              .map((p) => ({ p, w: p.byGame[g.gameId]?.wins ?? 0 }))
              .filter((x) => x.w > 0)
              .sort((a, b) => b.w - a.w)[0];
            return (
              <li key={g.gameId}>
                <b>{gameName(g.gameId)}</b>
                <span>
                  {g.played} {g.played === 1 ? 'game' : 'games'}, last at {time(g.lastPlayedAt)}
                  {best && `. Most wins: ${best.p.name} (${best.w})`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {data && data.stats.totalGames > 0 && tab === 'tonight' && (
        <Awards history={data.history} snapshot={snapshot} avatars={avatars} />
      )}
      {data && data.stats.totalGames > 0 && tab === 'tonight' && (
        <ol className="pad__log">
          {data.history.map((h) => (
            <li key={h.endedAt}>
              <time>{time(h.endedAt)}</time>
              <span>
                <b>{gameName(h.gameId)}</b>: {h.summary}
                {h.winners.length > 0 && (
                  <> Won by {h.winners.map((w) => h.names[w] ?? 'someone').join(', ')}.</>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Sheet>
  );
}

/** Tonight's awards (best word, biggest pot…), above the log of games. */
function Awards({
  history,
  snapshot,
  avatars,
}: {
  history: HistoryEntry[];
  snapshot: LobbySnapshot;
  avatars: Map<string, { crest: string; tint: string }>;
}) {
  const names = Object.fromEntries(snapshot.players.map((p) => [p.id, p.name]));
  const { awards } = nightSummary(history, snapshot.scores, names);
  if (awards.length === 0) return null;
  return (
    <ul className="pad__awards" aria-label="Tonight’s awards">
      {awards.map((a) => (
        <li key={a.award}>
          <span className="jd-label">{a.award}</span>
          <b>{a.text}</b>
          <span className="pad__awardee">
            {a.holders.map((h) => {
              const avatar = avatars.get(h.playerId);
              return avatar ? <Token key={h.playerId} avatar={avatar} size={26} /> : null;
            })}
            {a.holders.map((h) => h.name).join(' and ')}, {gameName(a.gameId)}
          </span>
        </li>
      ))}
    </ul>
  );
}
