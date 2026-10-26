'use client';

import { useCallback } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import type { LobbyChat, ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { serverClock as clock } from '@/lib/clock';
import { TvWindow } from '../../tv/[code]/tv-stage';

/**
 * Runs the chosen game's own screen. Seated players get their private view plus the public
 * table; latecomers watch the table and are seated next game. On an upright phone they get the
 * game's own watch screen where it has one; otherwise the table is the game's TV screen, laid out in TV pixels,
 * so it's scaled whole into the space under the note (unless the game is drawn edge to edge, whose
 * TV screen fills a phone as it is).
 */
export function GameShell({
  snapshot: s,
  players,
  send,
  chat,
  phone,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  /** Table talk, for a game drawn edge to edge to draw itself. */
  chat: LobbyChat;
  /** An upright phone (or a narrow window), where a latecomer gets the game's watch screen. */
  phone: boolean;
}) {
  const session = s.session;
  const entry = catalogEntry(session?.gameId);
  const ui = entry?.ui;
  const seated = s.players.find((p) => p.id === s.me)?.seated ?? false;

  const sendAction = useCallback(
    async (action: unknown) => {
      if (!session) return false;
      const next = await send({ type: 'action', sessionId: session.id, seq: session.seq, action });
      return next !== null;
    },
    [send, session],
  );

  if (!session || !ui) {
    return <p className="game-missing">This game can&rsquo;t be shown on this device yet.</p>;
  }

  if ((!seated || s.view === undefined) && ui.WatchScreen && phone && !ui.fullBleed) {
    const Watch = ui.WatchScreen;
    return (
      <div className="game-shell game-shell--fit game-watch game-watch--phone">
        <p className="spectator" role="status">
          Watching {entry.meta.name}. You&rsquo;ll play next game.
        </p>
        <Watch tableView={s.tableView} players={players} now={clock} reactions={s.reactions} />
      </div>
    );
  }

  if (!seated || s.view === undefined) {
    const Tv = ui.TvScreen;
    const table = (
      <Tv
        tableView={s.tableView}
        players={players}
        now={clock}
        reactions={s.reactions}
        chat={ui.fullBleed ? chat : undefined}
      />
    );
    return (
      <div
        className={
          ui.fullBleed ? 'game-shell game-shell--bleed' : 'game-shell game-shell--fit game-watch'
        }
      >
        <p className="spectator" role="status">
          You&rsquo;re watching this round of {entry.meta.name}. You&rsquo;ll be seated in the next
          game.<span className="spectator__turn"> Turn your phone sideways to see more.</span>
        </p>
        {ui.fullBleed ? table : <TvWindow>{table}</TvWindow>}
      </div>
    );
  }

  const Screen = ui.PlayerScreen;
  return (
    <div
      className={
        ui.fullBleed
          ? 'game-shell game-shell--bleed'
          : ui.fit
            ? 'game-shell game-shell--fit'
            : 'game-shell'
      }
    >
      <Screen
        view={s.view}
        tableView={s.tableView}
        me={s.me!}
        players={players}
        sendAction={sendAction}
        now={clock}
        reactions={s.reactions}
        chat={ui.fullBleed ? chat : undefined}
      />
    </div>
  );
}
