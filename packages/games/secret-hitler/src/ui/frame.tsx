'use client';

import type { ReactNode } from 'react';
import { LobbyChatPanel, type LobbyChat, type ScreenPlayer } from '@jackdaw/ui';
import './sho/sho.css';
import './sho/jackdaw.css';

/**
 * Every Secret Hitler screen on a phone: secret-hitler.online's page, with table talk in the
 * same look beside it on a laptop (from 1240px) or in a drawer the bar's chat button opens.
 */
export function ShFrame({
  chat,
  players,
  className,
  children,
}: {
  chat?: LobbyChat;
  players: ScreenPlayer[];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={['sho sho-page sho-frame', className].filter(Boolean).join(' ')}>
      <div className="sho-frame__main">{children}</div>
      {chat && (
        <LobbyChatPanel chat={chat} players={players} title="TABLE TALK" className="sho-chat" />
      )}
    </div>
  );
}
