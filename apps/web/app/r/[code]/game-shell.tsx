'use client';

import { useCallback } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import type { LobbyChat, ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';

// Device time for now; a server-corrected clock comes with the first timed game.
const clock = () => Date.now();

/**
 * Runs the chosen game's own screen. Seated players get their private view plus the public
 * table; latecomers watch the table and are seated next game.
 */
export function GameShell({
  snapshot: s,
  players,
  send,
  chat,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  /** Table talk, for a game drawn edge to edge to draw itself. */
  chat: LobbyChat;
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
      <div className={ui.fullBleed ? 'game-shell game-shell--bleed' : 'game-shell'}>
        <p className="spectator" role="status">
          You&rsquo;re watching this round of {entry.meta.name}. You&rsquo;ll be seated in the next
          game.
        </p>
        <Tv
          tableView={s.tableView}
          players={players}
          now={clock}
          reactions={s.reactions}
          chat={ui.fullBleed ? chat : undefined}
        />
      </div>
    );
  }

  const Screen = ui.PlayerScreen;
  return (
    <div className={ui.fullBleed ? 'game-shell game-shell--bleed' : 'game-shell'}>
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
