'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { startBlocker, type ClientMessage, type Lobby, type LobbySnapshot } from '@jackdaw/engine';
import {
  AvatarButton,
  Icon,
  Plaque,
  SeatTrack,
  Sheet,
  Token,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { games } from '@/lib/registry';
import type { Panel } from './bar';
import { GamePicker, NextUp } from './next-up';

/** The ids that weren't here last time, so their tokens drop onto the track. */
function useArrivals(ids: string[]): Set<string> {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join(',');
  useEffect(() => {
    const now = new Set(key ? key.split(',') : []);
    if (seen.current) {
      const arrived = [...now].filter((id) => !seen.current!.has(id));
      if (arrived.length) setFresh(new Set(arrived));
    }
    seen.current = now;
  }, [key]);
  return fresh;
}

/** Mirror the server's start check, so the button explains itself before anyone taps it. */
function blockerFor(s: LobbySnapshot): string | null {
  const lobbyish = {
    selectedGameId: s.selectedGameId,
    players: s.players,
    gameOptions: s.gameOptions,
  } as unknown as Lobby;
  return startBlocker(lobbyish, { games });
}

export function Waiting({
  snapshot: s,
  players,
  isHost,
  send,
  onOpen,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  isHost: boolean;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  onOpen: (p: Panel) => void;
}) {
  const arrivals = useArrivals(s.players.map((p) => p.id));
  const [picking, setPicking] = useState(false);
  const [managing, setManaging] = useState(false);
  const entry = catalogEntry(s.selectedGameId);
  const host = s.players.find((p) => p.id === s.hostId);
  const blocker = blockerFor(s);
  const count = s.players.length;
  const showPicker = picking || !entry;

  const seats = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === s.hostId,
    away: !p.online,
    me: p.id === s.me,
    landing: arrivals.has(p.id),
  }));
  const mine = s.players.find((p) => p.id === s.me);
  const ThemedLobby = entry?.ui?.Lobby;

  async function choose(id: string) {
    if (!isHost) return;
    await send({ type: 'setGame', gameId: id });
    setPicking(false);
  }

  return (
    <div className="waiting">
      <section className="waiting__table" aria-labelledby="at-table">
        <div className="section-head">
          <h2 id="at-table" className="jd-display">
            At the table
          </h2>
          <span>
            {count} of 15 seats
            {s.displays > 0 && `, ${s.displays} TV`}
          </span>
        </div>
        <SeatTrack seats={seats} />
        {mine && (
          <div className="you-strip">
            <AvatarButton avatar={mine.avatar} size={44} onClick={() => onOpen('me')} />
            <span className="you-strip__who">
              <b>{mine.name}</b>
              <span>That&rsquo;s you. Tap your token to change your name, crest or colour.</span>
            </span>
            {isHost && count > 1 && (
              <button
                type="button"
                className="home-link waiting__manage"
                onClick={() => setManaging(true)}
              >
                Manage players
              </button>
            )}
          </div>
        )}
      </section>

      <section className="waiting__game" aria-labelledby="next-game">
        <div className="section-head">
          <h2 id="next-game" className="jd-display">
            {showPicker ? 'Pick a game' : 'Next up'}
          </h2>
          <span>
            {isHost ? (
              showPicker && entry ? (
                <button type="button" className="home-link" onClick={() => setPicking(false)}>
                  Keep {entry.meta.name}
                </button>
              ) : (
                'You choose'
              )
            ) : (
              `${host?.name ?? 'The host'} chooses`
            )}
          </span>
        </div>

        {showPicker ? (
          <GamePicker
            selectedId={s.selectedGameId}
            count={count}
            isHost={isHost}
            onChoose={choose}
          />
        ) : entry && ThemedLobby ? (
          <ThemedLobby
            players={players}
            me={s.me}
            hostId={s.hostId}
            isHost={isHost}
            options={s.gameOptions}
            setOptions={(o) => send({ type: 'setOptions', options: o })}
            blocker={blocker}
            start={() => send({ type: 'start' })}
          />
        ) : (
          entry && (
            <NextUp
              entry={entry}
              count={count}
              isHost={isHost}
              options={s.gameOptions}
              onOptions={(o) => send({ type: 'setOptions', options: o })}
              onChange={() => setPicking(true)}
            />
          )
        )}
      </section>

      {s.history.length > 0 && (
        <section className="waiting__history" aria-label="Recent games">
          <h2 className="jd-label">Recent games</h2>
          <ul>
            {s.history.slice(0, 3).map((h) => (
              <li key={h.endedAt}>
                <b>{catalogEntry(h.gameId)?.meta.name ?? h.gameId}</b>: {h.summary}
                {h.winners.length > 0 && (
                  <> ({h.winners.map((w) => h.names[w] ?? 'someone').join(', ')})</>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="home-link" onClick={() => onOpen('stats')}>
            All game stats
          </button>
        </section>
      )}

      {!ThemedLobby && (
        <div className="dock">
          {isHost ? (
            <>
              <Plaque
                go
                disabled={Boolean(blocker)}
                aria-disabled={Boolean(blocker)}
                onClick={() => send({ type: 'start' })}
              >
                {entry ? `Start ${entry.meta.name}` : 'Start'}
              </Plaque>
              {blocker && <p className="dock__note">{blocker}</p>}
            </>
          ) : (
            <p className="dock__wait">
              Waiting for {host?.name ?? 'the host'} to{' '}
              {entry ? `start ${entry.meta.name}` : 'pick a game'}
            </p>
          )}
          <div className="dock__row">
            <Link className="jd-plaque jd-plaque--small" href={`/tv/${s.code}`} target="_blank">
              <Icon.tv />
              Show on TV
            </Link>
            <Plaque small onClick={() => onOpen('stats')}>
              <Icon.stats />
              Game stats
            </Plaque>
          </div>
        </div>
      )}

      <Sheet open={managing} onClose={() => setManaging(false)} title="Manage players">
        <ul className="manage">
          {s.players
            .filter((p) => p.id !== s.me)
            .map((p) => (
              <li key={p.id}>
                <Token avatar={p.avatar} size={36} away={!p.online} />
                <span className="manage__name">
                  {p.name}
                  {!p.online && <small> away</small>}
                </span>
                <Plaque
                  small
                  onClick={() =>
                    send({ type: 'transferHost', playerId: p.id }).then(() => setManaging(false))
                  }
                >
                  Make host
                </Plaque>
                <Plaque small onClick={() => send({ type: 'kick', playerId: p.id })}>
                  Remove
                </Plaque>
              </li>
            ))}
        </ul>
      </Sheet>
    </div>
  );
}
