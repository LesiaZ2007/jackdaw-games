'use client';

import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import { Lid, Plaque, RecapTimeline, Token, type ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

const OUTCOME: Record<string, string> = { win: 'Won', loss: 'Lost', draw: 'Draw' };

/** The end of a game: winners rise, everything hidden is revealed, then the host picks what's next. */
export function Results({
  snapshot: s,
  players,
  isHost,
  send,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  isHost: boolean;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const result = s.results;
  if (!result) return null;
  const entry = catalogEntry(result.gameId);
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  // Fall back to the names recorded with the game, for anyone who has since left.
  for (const h of s.history) for (const [id, n] of Object.entries(h.names)) names[id] ??= n;
  const byId = new Map(players.map((p) => [p.id, p]));
  const host = players.find((p) => p.id === s.hostId);
  const winners = result.winners
    .map((id) => byId.get(id))
    .filter((p): p is ScreenPlayer => Boolean(p));
  const iWon = s.me ? result.winners.includes(s.me) : false;
  const Reveal = entry?.ui?.Reveal;
  const standings = result.standings ?? [];

  return (
    <div className="results">
      <Lid className="results__head">
        <span className="jd-label">{entry?.meta.name ?? 'Game'} is over</span>
        <h2 className="jd-display results__title">
          {winners.length === 0
            ? 'No winner'
            : iWon
              ? 'You won'
              : winners.length === 1
                ? `${winners[0]!.name} won`
                : 'Shared win'}
        </h2>
        <p className="results__summary">{result.summary}</p>
        {winners.length > 0 && (
          <ul className="results__winners" aria-label="Winners">
            {winners.map((p, i) => (
              <li key={p.id} style={{ animationDelay: `${i * 120}ms` }}>
                <Token avatar={p.avatar} size={64} />
                <span>{p.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Lid>

      {Reveal ? (
        <Reveal result={result} players={players} me={s.me} />
      ) : (
        <>
          {standings.length > 0 && (
            <section className="results__standings" aria-label="How everyone finished">
              <h3 className="jd-display">Standings</h3>
              <ol>
                {standings.map((st) => {
                  const p = byId.get(st.playerId);
                  return (
                    <li key={st.playerId} data-outcome={st.outcome}>
                      {p && <Token avatar={p.avatar} size={30} />}
                      <span className="results__name">{names[st.playerId] ?? 'Someone'}</span>
                      {(st.team || st.role) && (
                        <span className="results__role">
                          {[st.team, st.role].filter(Boolean).join(', ')}
                        </span>
                      )}
                      <b>{OUTCOME[st.outcome]}</b>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <RecapTimeline events={result.recap} names={names} />
        </>
      )}

      <div className="dock">
        {isHost ? (
          <>
            <Plaque go onClick={() => send({ type: 'playAgain' })}>
              Play {entry?.meta.name ?? 'it'} again
            </Plaque>
            <Plaque onClick={() => send({ type: 'backToLobby' })}>Back to lobby</Plaque>
          </>
        ) : (
          <p className="dock__wait">
            Waiting for {host?.name ?? 'the host'} to choose what&rsquo;s next
          </p>
        )}
      </div>
    </div>
  );
}
