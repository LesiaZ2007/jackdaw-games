'use client';

import type { LobbySnapshot, RecapEvent, Standing } from '@jackdaw/engine';
import { BirdMark, OutcomeChip, Token, Verdict, type ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

const RECAP_ROWS = 8;
const OUTCOME: Record<Standing['outcome'], string> = { win: 'Won', loss: 'Lost', draw: 'Draw' };

/** Swap player ids for names in recap text, so "p_3k9 voted" reads "Bran voted". */
function withNames(text: string, names: Map<string, string>): string {
  let out = text;
  for (const [id, name] of names) out = out.split(id).join(name);
  return out;
}

/**
 * The big reveal on the TV: winners rise, the summary in large type, everyone's standing, and
 * the recap with the hidden truth now shown. Phones show the same reveal with each player's own
 * result on top.
 */
export function TvResults({
  snapshot,
  players,
  hostName,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  hostName: string;
}) {
  const result = snapshot.results!;
  const game = catalogEntry(result.gameId)?.meta.name ?? 'The game';
  const TvReveal = catalogEntry(result.gameId)?.ui?.TvReveal;
  const latest = snapshot.history[0];
  // Names as they were when the game ended (people may have left or renamed since).
  const names = new Map<string, string>([
    ...players.map((p) => [p.id, p.name] as const),
    ...Object.entries(latest?.gameId === result.gameId ? (latest.names ?? {}) : {}),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const standings: Standing[] =
    result.standings ??
    (latest?.players ?? players.map((p) => p.id)).map((playerId) => ({
      playerId,
      outcome: result.winners.includes(playerId) ? 'win' : 'loss',
    }));
  const recap: RecapEvent[] = result.recap;
  const shown = recap.slice(0, RECAP_ROWS);
  const more = recap.length - shown.length;
  const winnerNames = result.winners.map((id) => names.get(id) ?? 'A player who left');
  const title =
    winnerNames.length === 0
      ? 'No winner this time'
      : winnerNames.length === 1
        ? `${winnerNames[0]} wins`
        : `${winnerNames.slice(0, -1).join(', ')} and ${winnerNames[winnerNames.length - 1]} share the win`;

  return (
    <div className="tv-results">
      <header className="tv-results__top">
        <div className="tv-brand">
          <BirdMark width={72} height={72} weight={2.8} />
          <span className="jd-display tv-results__game">{game}</span>
        </div>
        <span className="tv-count">Lobby {snapshot.code}</span>
      </header>

      <section className="tv-winners">
        <Verdict
          size="tv"
          outcome={result.winners.length ? 'win' : 'draw'}
          title={title}
          detail={withNames(result.summary, names)}
          avatar={result.winners.length === 1 ? byId.get(result.winners[0]!)?.avatar : undefined}
        />
        <ol
          className={result.winners.length > 1 ? 'tv-winners__row' : 'sr-only'}
          aria-label="Winners"
        >
          {result.winners.map((id, i) => {
            const p = byId.get(id);
            return (
              <li key={id} className="tv-winner" style={{ animationDelay: `${900 + i * 160}ms` }}>
                {p ? <Token avatar={p.avatar} size={96} /> : null}
                <span className="tv-winner__name">{names.get(id) ?? 'A player who left'}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="tv-standings" aria-label="Everyone's result">
        <h2 className="jd-display tv-section-title">Standings</h2>
        <ol>
          {standings.map((s) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} className={`tv-standing tv-standing--${s.outcome}`}>
                {p ? <Token avatar={p.avatar} size={48} /> : <span className="tv-standing__gone" />}
                <span className="tv-standing__name">
                  {names.get(s.playerId) ?? 'Left the lobby'}
                </span>
                {(s.team || s.role) && (
                  <span className="tv-standing__role">
                    {[s.team, s.role].filter(Boolean).join(', ')}
                  </span>
                )}
                <OutcomeChip outcome={s.outcome} className="tv-standing__outcome">
                  {OUTCOME[s.outcome]}
                </OutcomeChip>
              </li>
            );
          })}
        </ol>
      </section>

      {TvReveal ? (
        <section className="tv-reveal" aria-label="How it ended">
          <TvReveal result={result} players={players} />
        </section>
      ) : (
        <section className="tv-recap" aria-label="What happened">
          <h2 className="jd-display tv-section-title">What happened</h2>
          {shown.length === 0 ? (
            <p className="tv-recap__empty">No recap for this game.</p>
          ) : (
            <ol>
              {shown.map((e, i) => (
                <li key={i} className="tv-recap__event">
                  {e.round !== undefined && <span className="tv-recap__round">{e.round}</span>}
                  <span className="tv-recap__text">
                    {withNames(e.text, names)}
                    {e.secret && (
                      <span className="tv-recap__secret">{withNames(e.secret, names)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {more > 0 && <p className="tv-recap__more">And {more} more on everyone&apos;s phones.</p>}
        </section>
      )}

      <p className="tv-waiting tv-results__waiting">
        Waiting for {hostName} to play again or go back to the lobby
      </p>
    </div>
  );
}
