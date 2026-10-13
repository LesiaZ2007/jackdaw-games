'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ChatMessage, LobbySnapshot } from '@jackdaw/engine';
import { BirdMark, Lid, Plaque, Toast, type ScreenPlayer } from '@jackdaw/ui';
import { forgetSeat, rememberedSeat, rememberSeat } from '@/lib/identity';
import { readSeen, unreadCount, writeSeen } from '@/lib/unread';
import { useLobby } from '@/lib/use-lobby';
import { LobbyBar, type Panel } from './bar';
import { Chat } from './chat';
import { GameShell } from './game-shell';
import { JoinCard } from './join-card';
import { MenuSheet } from './menu-sheet';
import { MeSheet } from './me-sheet';
import { Results } from './results';
import { ShareSheet } from './share-sheet';
import { StatsSheet } from './stats-sheet';
import { Waiting } from './waiting';
import '../lobby.css';

const WIDE = '(min-width: 1024px)';
/** True when chat is docked beside the game (laptops), so it is always on screen. */
function useChatDocked(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(WIDE);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * The time of the last chat message this tab has seen. It starts at the newest message on the
 * first snapshot (or where this tab left off before a refresh) and catches up whenever the chat
 * is on screen.
 */
function useChatSeen(code: string, chat: ChatMessage[] | undefined, onScreen: boolean) {
  const latest = chat?.[chat.length - 1]?.at ?? 0;
  const [seen, setSeen] = useState<number | null>(null);
  if (seen === null && chat) setSeen(readSeen(code) ?? latest);
  if (onScreen && seen !== null && seen < latest) setSeen(latest);
  useEffect(() => {
    if (seen !== null) writeSeen(code, seen);
  }, [code, seen]);
  return seen ?? latest;
}

export function screenPlayers(s: LobbySnapshot): ScreenPlayer[] {
  return s.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, online: p.online }));
}

/** One lobby, from joining through games and results, on this device. */
export function LobbyRoom({ code }: { code: string }) {
  const { snapshot, error, missing, send, clearError } = useLobby(code, 'player');
  const [panel, setPanel] = useState<Panel>(null);
  const [hadSeat, setHadSeat] = useState<string | null>(null);

  // A seat remembered from an earlier visit means a missing seat now was a removal.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after hydration
    setHadSeat(rememberedSeat(code));
  }, [code]);
  // Remember this device's seat so a refresh drops straight back in.
  useEffect(() => {
    if (snapshot?.me) rememberSeat(code, snapshot.me);
  }, [code, snapshot?.me]);
  // Seated during this visit too (adjusting state while rendering, not in an effect).
  if (snapshot?.me && hadSeat !== snapshot.me) setHadSeat(snapshot.me);

  // Players learn when the host stops a game early; the chat also says so.
  const [info, setInfo] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState(snapshot?.status ?? null);
  const status = snapshot?.status ?? null;
  if (status !== lastStatus) {
    setLastStatus(status);
    const endedEarly = lastStatus === 'in_game' && status === 'waiting';
    if (endedEarly && snapshot?.me && snapshot.hostId !== snapshot.me)
      setInfo('The host ended the game. It won’t be scored.');
  }

  const notice = error?.message ?? info;
  const dismiss = useCallback(() => {
    clearError();
    setInfo(null);
  }, [clearError]);
  const close = useCallback(() => setPanel(null), []);

  const players = useMemo(() => (snapshot ? screenPlayers(snapshot) : []), [snapshot]);
  const docked = useChatDocked();
  const seenAt = useChatSeen(code, snapshot?.chat, docked || panel === 'chat');

  if (missing) {
    return (
      <Centered>
        <Lid className="grid gap-3 p-6 text-center">
          <BirdMark width={84} height={84} className="mx-auto" />
          <h1 className="jd-display" style={{ fontSize: 'var(--step-3)' }}>
            That lobby has closed
          </h1>
          <p style={{ margin: 0, color: 'var(--ink-2)' }}>
            Lobby {code} doesn&rsquo;t exist, or it sat empty for a day and was tidied away.
          </p>
          <Link className="jd-plaque jd-plaque--go" href="/">
            Back to the start
          </Link>
        </Lid>
      </Centered>
    );
  }

  if (!snapshot) {
    return (
      <Centered>
        <p className="jd-label" role="status" style={{ fontSize: 16 }}>
          Finding lobby {code}…
        </p>
      </Centered>
    );
  }

  if (!snapshot.me) {
    const removed = Boolean(hadSeat);
    return (
      <Centered>
        <JoinCard
          code={code}
          snapshot={snapshot}
          removed={removed}
          onJoined={() => setHadSeat(null)}
          send={send}
          onForget={() => {
            forgetSeat(code);
            setHadSeat(null);
          }}
        />
        <Toast message={notice} onDone={dismiss} />
      </Centered>
    );
  }

  const me = snapshot.me;
  const isHost = snapshot.hostId === me;
  const unread = unreadCount(snapshot.chat, me, seenAt);

  return (
    <div className="lobby-page">
      <LobbyBar code={code} status={snapshot.status} onOpen={setPanel} unread={unread} />
      <div className="lobby-layout">
        <main className="lobby-main">
          {snapshot.status === 'waiting' && (
            <Waiting
              snapshot={snapshot}
              players={players}
              isHost={isHost}
              send={send}
              onOpen={setPanel}
            />
          )}
          {snapshot.status === 'in_game' && (
            <GameShell snapshot={snapshot} players={players} send={send} />
          )}
          {snapshot.status === 'results' && (
            <Results snapshot={snapshot} players={players} isHost={isHost} send={send} />
          )}
        </main>
        <aside className="lobby-dock" aria-label="Chat">
          <Chat snapshot={snapshot} players={players} send={send} />
        </aside>
      </div>

      <ShareSheet open={panel === 'share'} onClose={close} code={code} />
      <StatsSheet open={panel === 'stats'} onClose={close} code={code} snapshot={snapshot} />
      <MenuSheet
        open={panel === 'menu'}
        onClose={close}
        code={code}
        snapshot={snapshot}
        send={send}
        onEdit={() => setPanel('me')}
      />
      <MeSheet open={panel === 'me'} onClose={close} snapshot={snapshot} send={send} />
      {panel === 'chat' && (
        <ChatSheet onClose={close}>
          <Chat snapshot={snapshot} players={players} send={send} />
        </ChatSheet>
      )}
      <Toast message={notice} onDone={dismiss} />
    </div>
  );
}

function ChatSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="jd-sheet" role="presentation">
      <button
        type="button"
        className="jd-sheet__backdrop"
        aria-label="Close chat"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="jd-sheet__panel chat-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Table talk"
      >
        <header className="jd-sheet__head">
          <h2 className="jd-display jd-sheet__title">Table talk</h2>
          <Plaque small onClick={onClose}>
            Close
          </Plaque>
        </header>
        <div className="chat-sheet__body">{children}</div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[460px] content-center gap-4 px-4 py-8">
      {children}
    </main>
  );
}
