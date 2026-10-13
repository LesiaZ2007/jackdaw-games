'use client';

import { useCallback } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import type { ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

/**
 * Runs the chosen game's own screen. Seated players get their private view plus the public
 * table; latecomers watch the table and are seated next game.
 */
export function GameShell({
  snapshot: s,
  players,
  send,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const session = s.session;
  const entry = catalogEntry(session?.gameId);
  const ui = entry?.ui;
  const seated = s.players.find((p) => p.id === s.me)?.seated ?? false;

  const sendAction = useCallback(
    (action: unknown) => {
      if (!session) return;
      void send({ type: 'action', sessionId: session.id, seq: session.seq, action });
    },
    [send, session],
  );

  if (!session || !ui) {
    return <p className="game-missing">This game can&rsquo;t be shown on this device yet.</p>;
  }

  if (!seated || s.view === undefined) {
    const Tv = ui.TvScreen;
    return (
      <div className="game-shell">
        <p className="spectator" role="status">
          You&rsquo;re watching this round of {entry.meta.name}. You&rsquo;ll be seated in the next
          game.
        </p>
        <Tv tableView={s.tableView} players={players} />
      </div>
    );
  }

  const Screen = ui.PlayerScreen;
  return (
    <div className="game-shell">
      <Screen
        view={s.view}
        tableView={s.tableView}
        me={s.me!}
        players={players}
        sendAction={sendAction}
      />
    </div>
  );
}
