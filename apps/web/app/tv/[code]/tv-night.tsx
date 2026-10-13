'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { Avatar, HistoryEntry, LobbySnapshot } from '@jackdaw/engine';
import { GameTile, Icon, OutcomeChip, Token } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { duration, nightSummary } from '@/lib/night';

const SHOWN_GAMES = 8;
const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const list = (names: string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/**
 * Every finished game tonight. Polls carry only the latest ten, so the full record comes from the
 * stats endpoint (public post-game data, no token needed) whenever another game finishes.
 */
function useHistory(code: string, snapshot: LobbySnapshot): HistoryEntry[] {
  const count = snapshot.historyCount;
  const [full, setFull] = useState<{ count: number; history: HistoryEntry[] } | null>(null);
  useEffect(() => {
    if (count <= snapshot.history.length) return;
    let live = true;
    fetch(`/api/lobby/${code}/stats`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(
        (body: { history: HistoryEntry[] }) => live && setFull({ count, history: body.history }),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code, count, snapshot.history.length]);
  return full?.count === count ? full.history : snapshot.history;
}

/** The TV lobby's hint that the night's summary waits below the first screen. */
export function NightHint() {
  return (
    <a href="#night" className="tv-more">
      The night so far
      <Icon.down width={30} height={30} />
    </a>
  );
}

/** Below the TV lobby: the score tally, a few highlights, and the games played tonight. */
export function TvNight({ code, snapshot }: { code: string; snapshot: LobbySnapshot }) {
  const history = useHistory(code, snapshot);
  const names = Object.fromEntries(snapshot.players.map((p) => [p.id, p.name]));
  const avatars = new Map(snapshot.players.map((p) => [p.id, p.avatar]));
  const night = nightSummary(history, snapshot.scores, names);
  const games = snapshot.historyCount;
  const best = night.table[0]?.wins || 1;
  const favourite = night.favourite && catalogEntry(night.favourite.gameId);
  const started = history.at(-1)?.startedAt;

  if (games === 0) {
    return (
      <section id="night" className="tv-night tv-night--empty" aria-labelledby="night-title">
        <h2 id="night-title" className="jd-display tv-night__title">
          The night so far
        </h2>
        <p className="tv-night__empty">
          No games finished yet. When the first one ends, the scores start here.
        </p>
      </section>
    );
  }

  return (
    <section id="night" className="tv-night" aria-labelledby="night-title">
      <header className="tv-night__head">
        <h2 id="night-title" className="jd-display tv-night__title">
          The night so far
        </h2>
        <span className="tv-count">
          {games} {games === 1 ? 'game' : 'games'}
        </span>
      </header>

      <ul className="tv-night__marks" aria-label="Highlights">
        {started && (
          <li className="tv-mark" style={band('azure')}>
            <span className="jd-label">At the table</span>
            <b className="jd-display">{duration(night.minutes)}</b>
            <span className="tv-mark__who">
              <Icon.clock width={44} height={44} />
              First game started at {time(started)}
            </span>
          </li>
        )}
        {night.streak && (
          <li className="tv-mark" style={band('vert')}>
            <span className="jd-label">Longest streak</span>
            <b className="jd-display">{night.streak.length} wins in a row</b>
            <span className="tv-mark__who">
              {night.streak.holders.map((h) => (
                <Seal key={h.playerId} avatar={avatars.get(h.playerId)} size={52} />
              ))}
              {list(night.streak.holders.map((h) => h.name))}
            </span>
          </li>
        )}
        {favourite && night.favourite && (
          <li className="tv-mark" style={band(favourite.art.band)}>
            <span className="jd-label">Most played</span>
            <b className="jd-display">{favourite.meta.name}</b>
            <span className="tv-mark__who">
              <GameTile art={favourite.art} size={52} />
              {night.favourite.played} times tonight
            </span>
          </li>
        )}
      </ul>

      <div className="tv-night__body">
        <div>
          <h3 className="jd-display tv-section-title">Scores</h3>
          {night.table.length > 0 ? (
            <ol className="tv-board">
              {night.table.map((row) => {
                const avatar = avatars.get(row.playerId);
                return (
                  <li
                    key={row.playerId}
                    className={
                      row.rank === 1 ? 'tv-board__row tv-board__row--top' : 'tv-board__row'
                    }
                    style={
                      {
                        '--fill': avatar ? `var(--tint-${avatar.tint})` : 'var(--rule)',
                        '--share': row.wins / best,
                      } as CSSProperties
                    }
                  >
                    <span className="tv-board__rank" aria-label={`Rank ${row.rank}`}>
                      {row.rank === 1 ? <Icon.host width={34} height={34} /> : row.rank}
                    </span>
                    <Seal avatar={avatar} size={64} />
                    <span className="tv-board__name">{row.name}</span>
                    <span className="tv-board__bar" aria-hidden="true" />
                    <span className="tv-board__record">
                      {row.wins} won, {row.losses} lost
                    </span>
                    <b className="tv-board__wins" aria-hidden="true">
                      {row.wins}
                    </b>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="tv-night__empty">
              The host cleared the scores. They fill in again next game.
            </p>
          )}
        </div>

        <div>
          <h3 className="jd-display tv-section-title">Games tonight</h3>
          <ol className="tv-played">
            {history.slice(0, SHOWN_GAMES).map((h) => {
              const entry = catalogEntry(h.gameId);
              const draw = h.winners.length === 0;
              return (
                <li key={`${h.endedAt}-${h.gameId}`} className="tv-played__game">
                  {entry && <GameTile art={entry.art} size={72} />}
                  <span className="tv-played__text">
                    <b className="jd-display">{entry?.meta.name ?? h.gameId}</b>
                    <span>{h.summary}</span>
                  </span>
                  <span className="tv-played__winners">
                    {draw ? (
                      <OutcomeChip outcome="draw">No winner</OutcomeChip>
                    ) : (
                      h.winners
                        .slice(0, 5)
                        .map((id) => <Seal key={id} avatar={avatars.get(id)} size={48} />)
                    )}
                  </span>
                  <time className="tv-played__time" dateTime={new Date(h.endedAt).toISOString()}>
                    {time(h.endedAt)}
                  </time>
                </li>
              );
            })}
          </ol>
          {games > SHOWN_GAMES && (
            <p className="tv-night__more">
              And {games - SHOWN_GAMES} earlier {games - SHOWN_GAMES === 1 ? 'game' : 'games'}.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** A player's token, or an empty dashed ring for someone who has left the lobby. */
function Seal({ avatar, size }: { avatar?: Avatar; size: number }) {
  return avatar ? (
    <Token avatar={avatar} size={size} />
  ) : (
    <span className="tv-gone" style={{ width: size, height: size }} aria-hidden="true" />
  );
}

const band = (colour: string) => ({ '--band': `var(--${colour})` }) as CSSProperties;
