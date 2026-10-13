'use client';

import { useCallback } from 'react';
import type { ClientMessage, LobbySnapshot, Reaction } from '@jackdaw/engine';
import type { ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

// Filled in by the platform work for Avalon: server-corrected clock and live reactions.
const clock = () => Date.now();
const NO_REACTIONS: Reaction[] = [];

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

  if (!seated || s.view === undefined) {
    const Tv = ui.TvScreen;
    return (
      <div className="game-shell">
        <p className="spectator" role="status">
          You&rsquo;re watching this round of {entry.meta.name}. You&rsquo;ll be seated in the next
          game.
        </p>
        <Tv tableView={s.tableView} players={players} now={clock} reactions={NO_REACTIONS} />
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
        now={clock}
        reactions={NO_REACTIONS}
      />
    </div>
  );
}
