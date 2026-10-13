'use client';

import Link from 'next/link';
import type { LobbyStatus } from '@jackdaw/engine';
import { BirdMark, Chits, Icon } from '@jackdaw/ui';
import { badgeText } from '@/lib/unread';

export type Panel = 'share' | 'stats' | 'chat' | 'menu' | 'me' | null;

/** The Jackdaw frame's top bar: always shows the code, sharing, stats and chat, even mid-game. */
export function LobbyBar({
  code,
  status,
  onOpen,
  unread,
}: {
  code: string;
  status: LobbyStatus;
  onOpen: (p: Panel) => void;
  /** Messages from others since the chat was last open (phones only; laptops dock the chat). */
  unread: number;
}) {
  return (
    <header className="lobby-bar">
      <Link href="/" className="lobby-bar__home" aria-label="Jackdaw home">
        <BirdMark width={40} height={40} weight={3} />
      </Link>
      <button
        type="button"
        className="lobby-bar__code"
        onClick={() => onOpen('share')}
        aria-label={`Lobby ${code}. Share it`}
      >
        {status === 'waiting' && <span className="jd-label lobby-bar__label">Lobby</span>}
        <Chits code={code} size={28} />
      </button>
      <div className="lobby-bar__actions">
        <button
          type="button"
          className="jd-iconbtn lobby-bar__share"
          onClick={() => onOpen('share')}
          aria-label="Invite people"
        >
          <Icon.share />
        </button>
        <button
          type="button"
          className="jd-iconbtn"
          onClick={() => onOpen('stats')}
          aria-label="Game stats"
        >
          <Icon.stats />
        </button>
        <button
          type="button"
          className="jd-iconbtn lobby-bar__chat"
          onClick={() => onOpen('chat')}
          aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
        >
          <Icon.chat />
          {unread > 0 && (
            // Keyed on the count, so each new message pops the badge again.
            <span key={unread} className="lobby-bar__badge" aria-hidden="true">
              {badgeText(unread)}
            </span>
          )}
        </button>
        <button
          type="button"
          className="jd-iconbtn"
          onClick={() => onOpen('menu')}
          aria-label="Lobby menu"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="19" cy="12" r="2" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
