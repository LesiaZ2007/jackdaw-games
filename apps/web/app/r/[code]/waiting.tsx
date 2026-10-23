'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { startBlocker, type ClientMessage, type Lobby, type LobbySnapshot } from '@jackdaw/engine';
import {
  AvatarButton,
  Icon,
  Plaque,
  ReactionBar,
  SeatTrack,
  Sheet,
  Token,
  type LobbyChat,
  type ScreenPlayer,
} from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { useStartLook } from '@/lib/game-ui';
import { games } from '@/lib/registry';
import { useOptionsDraft } from '@/lib/use-options-draft';
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

/**
 * The seats as drawn ("track:15", "risk:6"): when they change (the host picks a game with its own
 * seats, or the track grows or shrinks), the old seats stay up one frame while a view transition
 * captures them, then each player's crest and name fly to their new seat. Without View
 * Transitions, or with reduced motion, it just switches.
 */
function useSeatStyle(want: string): string {
  const [shown, setShown] = useState(want);
  const running = useRef(false);
  // Bumped when a transition finishes, to catch up with anything that changed meanwhile.
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (want === shown || running.current) return;
    const swap = () => flushSync(() => setShown(want));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof document.startViewTransition !== 'function') {
      swap();
      return;
    }
    running.current = true;
    const t = document.startViewTransition(swap);
    void t.finished.finally(() => {
      running.current = false;
      setSettled((n) => n + 1);
    });
  }, [want, shown, settled]);
  return shown;
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
  picking,
  themed: showOwnLobby,
  setPicking,
  chat,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  isHost: boolean;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  onOpen: (p: Panel) => void;
  /** The host is looking at the list of games. */
  picking: boolean;
  /** Show the selected game's own lobby (the page decides, so it can animate the switch). */
  themed: boolean;
  /** The host wants the list of games (or is done with it). */
  setPicking: (picking: boolean) => void;
  /** The chat, for a game's own lobby to draw. */
  chat: LobbyChat;
}) {
  const arrivals = useArrivals(s.players.map((p) => p.id));
  const [managing, setManaging] = useState(false);
  const [tapped, setTapped] = useState<string | null>(null);
  const untap = useCallback(() => setTapped(null), []);
  const entry = catalogEntry(s.selectedGameId);
  const host = s.players.find((p) => p.id === s.hostId);
  const blocker = blockerFor(s);
  const count = s.players.length;
  const showPicker = picking || !entry;
  // A game can seat everyone its own way in Jackdaw's lobby (poker: round the card table; Risk:
  // the war council's banners), drawn once that game is chosen. Otherwise the seat track, with as
  // many spaces as the chosen game seats (all 15 while choosing). A change of either flies.
  const seatStyle = useSeatStyle(
    `${(!showPicker && entry?.ui?.LobbySeats && entry.meta.id) || 'track'}:${
      entry && !showPicker ? Math.max(entry.meta.maxPlayers, count) : 15
    }`,
  );
  const [seatsOf, shownSpaces] = seatStyle.split(':') as [string, string];
  const spaces = Number(shownSpaces);
  const cols = spaces <= 4 ? spaces : spaces <= 6 ? 3 : spaces <= 8 ? 4 : 5;
  const seatsEntry = seatsOf === 'track' ? undefined : catalogEntry(seatsOf);
  const GameSeats = seatsEntry?.ui?.LobbySeats;

  const seats = s.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    host: p.id === s.hostId,
    away: !p.online,
    me: p.id === s.me,
    landing: arrivals.has(p.id),
    // Your own seat opens your look; the host can tap anyone else's to remove them.
    action:
      p.id === s.me
        ? `${p.name} (you): change your name, crest or colour`
        : isHost
          ? `${p.name}: remove or make host`
          : undefined,
  }));
  const other = s.players.find((p) => p.id === tapped && p.id !== s.me);
  const mine = s.players.find((p) => p.id === s.me);
  const ThemedLobby = entry?.ui?.Lobby;
  // A game with its own lobby (Avalon's round table) draws the players and the options itself,
  // and fills the screen under Jackdaw's bar. The host can still go back to the list of games.
  const themed = Boolean(entry && ThemedLobby && showOwnLobby);
  const look = useStartLook(entry);
  const [lobbyOptions, setLobbyOptions] = useOptionsDraft(s.gameOptions, (o) =>
    send({ type: 'setOptions', options: o }),
  );
  const startGame = () => send({ type: 'start', look });
  const onSeat = (id: string) => (id === s.me ? onOpen('me') : isHost && setTapped(id));

  async function choose(id: string) {
    if (!isHost) return;
    await send({ type: 'setGame', gameId: id });
    setPicking(false);
  }

  return (
    <div className={themed ? 'waiting waiting--themed' : 'waiting'}>
      {themed && entry && ThemedLobby && (
        <section className="waiting__themed" aria-label={`${entry.meta.name} lobby`}>
          <ThemedLobby
            code={s.code}
            players={players}
            me={s.me}
            hostId={s.hostId}
            isHost={isHost}
            options={lobbyOptions}
            setOptions={setLobbyOptions}
            blocker={blocker}
            start={startGame}
            onSeat={onSeat}
            changeGame={isHost ? () => setPicking(true) : undefined}
            reactions={s.reactions}
            react={(kind) => void send({ type: 'react', kind })}
            chat={chat}
          />
        </section>
      )}

      {!themed && (
        <section className="waiting__table" aria-labelledby="at-table">
          <div className="section-head">
            <h2 id="at-table" className="jd-display">
              At the table
            </h2>
            <span>
              {count} of {spaces} seats
              {s.displays > 0 && `, ${s.displays} TV`}
            </span>
          </div>
          {GameSeats && seatsEntry ? (
            <GameSeats
              seats={seats}
              max={seatsEntry.meta.maxPlayers}
              options={lobbyOptions}
              onSeat={onSeat}
              reactions={s.reactions}
              setOptions={isHost ? setLobbyOptions : undefined}
            />
          ) : (
            <SeatTrack
              seats={seats}
              spaces={spaces}
              cols={cols}
              onSeat={onSeat}
              reactions={s.reactions}
              transitions
            />
          )}
          {mine && (
            <div className="you-strip">
              <AvatarButton avatar={mine.avatar} size={44} onClick={() => onOpen('me')} />
              <span className="you-strip__who">
                <b>{mine.name}</b>
                <span>That&rsquo;s you. Tap to change your look.</span>
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
          {mine && (
            <ReactionBar
              className="waiting__react"
              onReact={(kind) => void send({ type: 'react', kind })}
            />
          )}
        </section>
      )}

      {!themed && (
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
      )}

      {!themed && s.history.length > 0 && (
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

      {/* A game's own lobby has its own Start; the TV and stats stay in the bar. */}
      {!themed && (
        <div className="dock">
          {isHost ? (
            <>
              <Plaque
                go
                disabled={Boolean(blocker)}
                aria-disabled={Boolean(blocker)}
                onClick={startGame}
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

      <Sheet open={Boolean(other)} onClose={untap} title={other?.name ?? 'Player'}>
        {other && (
          <div className="seat-sheet">
            <div className="seat-sheet__who">
              <Token avatar={other.avatar} size={64} away={!other.online} />
              <span className="seat-sheet__note">
                {other.online
                  ? `${other.name} is at the table.`
                  : `${other.name} is away from their phone.`}
              </span>
            </div>
            <Plaque
              className="seat-sheet__remove"
              onClick={() =>
                send({ type: 'kick', playerId: other.id }).then((r) => r && setTapped(null))
              }
            >
              Remove {other.name} from the lobby
            </Plaque>
            <Plaque
              small
              onClick={() =>
                send({ type: 'transferHost', playerId: other.id }).then((r) => r && setTapped(null))
              }
            >
              Make {other.name} host
            </Plaque>
          </div>
        )}
      </Sheet>

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
