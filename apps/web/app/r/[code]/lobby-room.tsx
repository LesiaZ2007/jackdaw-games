'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { systemText, type ChatMessage, type LobbySnapshot } from '@jackdaw/engine';
import { BirdMark, Lid, Plaque, Toast, type LobbyChat, type ScreenPlayer } from '@jackdaw/ui';
import { catalogEntry } from '@/lib/catalog';
import { forgetSeat, rememberedSeat, rememberSeat } from '@/lib/identity';
import { readSeen, unreadCount, writeSeen } from '@/lib/unread';
import { useTurnAlert } from '@/lib/alerts';
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

/** Jackdaw's chat docks beside the lobby from here; a game's own lobby docks its chat from 1240px. */
const WIDE = '(min-width: 1024px)';
const WIDE_OWN = '(min-width: 1240px)';
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Switch between Jackdaw's lobby and a game's own lobby as a view transition: each player's crest
 * and name fly from their seat on the track to their seat in the game's lobby (and back), and the
 * rest cross-fades. Without View Transitions, or with reduced motion, it just switches.
 */
function useLobbySwitch(want: boolean, shown: boolean, setShown: (full: boolean) => void) {
  const running = useRef(false);
  useEffect(() => {
    if (want === shown || running.current) return;
    // Start from the top, where the seats are in both layouts (the game list sits lower down).
    const swap = () => {
      flushSync(() => setShown(want));
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof document.startViewTransition !== 'function') {
      swap();
      return;
    }
    running.current = true;
    const t = document.startViewTransition(swap);
    void t.finished.finally(() => {
      running.current = false;
    });
  }, [want, shown, setShown]);
}

/**
 * The snapshot to draw. When a game that draws its own seats (`fullBleed`) starts or ends, the
 * old screen stays up for one frame while a view transition captures it, then the new one comes
 * in: each player's crest and name fly from their lobby seat to their place at the table, and
 * back again. Without View Transitions, or with reduced motion, it just switches.
 */
function useStatusSwitch(snapshot: LobbySnapshot | null): LobbySnapshot | null {
  const [shown, setShown] = useState(snapshot);
  const running = useRef(false);
  // Bumped when a transition finishes, to catch up with anything that arrived meanwhile.
  const [settled, setSettled] = useState(0);
  const flies = (s: LobbySnapshot | null) =>
    Boolean(
      s &&
      catalogEntry(
        s.status === 'in_game'
          ? s.session?.gameId
          : s.status === 'results'
            ? s.results?.gameId
            : s.selectedGameId,
      )?.ui?.fullBleed,
    );
  const animate = Boolean(
    snapshot &&
    shown &&
    snapshot.status !== shown.status &&
    flies(snapshot) &&
    flies(shown) &&
    snapshot.me === shown.me,
  );
  // Same screen (or nothing to fly): keep up with every poll.
  if (!animate && shown !== snapshot) setShown(snapshot);
  useEffect(() => {
    if (!animate || running.current) return;
    const swap = () => {
      flushSync(() => setShown(snapshot));
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
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
  }, [animate, snapshot, settled]);
  return animate ? shown : snapshot;
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
  const { snapshot: live, error, missing, send, clearError } = useLobby(code, 'player');
  const snapshot = useStatusSwitch(live);
  useTurnAlert(live);
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
  const [picking, setPicking] = useState(false);
  // A game with its own lobby (Avalon's round table) takes the whole screen under the bar,
  // with chat behind the bar's button, until the host goes back to the list of games.
  const wantFull =
    status === 'waiting' && !picking && Boolean(catalogEntry(snapshot?.selectedGameId)?.ui?.Lobby);
  const [shownFull, setShownFull] = useState(wantFull);
  if (status !== lastStatus) {
    setLastStatus(status);
    setPicking(false);
    // Arriving in the waiting room: show the right lobby at once, with nothing to animate from.
    setShownFull(
      status === 'waiting' && Boolean(catalogEntry(snapshot?.selectedGameId)?.ui?.Lobby),
    );
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
  useLobbySwitch(wantFull, shownFull, setShownFull);
  const full = status === 'waiting' && shownFull;
  // A game drawn edge to edge (Secret Hitler, as secret-hitler.online) fills the main column.
  const bleed =
    (status === 'in_game' && Boolean(catalogEntry(snapshot?.session?.gameId)?.ui?.fullBleed)) ||
    (status === 'results' && Boolean(catalogEntry(snapshot?.results?.gameId)?.ui?.Results));
  // A game that fits the screen (Letterhoard's board, rack and buttons) never scrolls.
  const fit = status === 'in_game' && Boolean(catalogEntry(snapshot?.session?.gameId)?.ui?.fit);
  const wide = useMedia(WIDE);
  const wideOwn = useMedia(WIDE_OWN);
  // A game's own lobby, or a game drawn edge to edge, draws table talk in its own style.
  const ownChat = full || bleed;
  // True when the chat is on screen without opening it.
  const docked = ownChat ? wideOwn : wide;
  const seenAt = useChatSeen(code, snapshot?.chat, docked || panel === 'chat');

  // The same chat, worded for a game's own lobby to draw in its own style.
  const lobbyChat = useMemo<LobbyChat>(() => {
    const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
    return {
      lines: (snapshot?.chat ?? []).map((m) => ({
        id: m.id,
        system: Boolean(m.system),
        text: m.system ? systemText(m, names) : m.text,
        playerId: m.playerId,
        name: m.playerId ? names[m.playerId] : undefined,
        mine: Boolean(m.playerId && m.playerId === snapshot?.me),
      })),
      send: async (text) => (await send({ type: 'chat', text })) !== null,
      open: panel === 'chat',
      close,
    };
  }, [snapshot?.chat, snapshot?.me, players, send, panel, close]);

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
    <div
      className={
        full
          ? 'lobby-page lobby-page--full'
          : bleed
            ? 'lobby-page lobby-page--bleed'
            : fit
              ? 'lobby-page lobby-page--fit'
              : 'lobby-page'
      }
    >
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
              picking={picking}
              themed={full}
              setPicking={setPicking}
              chat={lobbyChat}
            />
          )}
          {snapshot.status === 'in_game' && (
            <GameShell snapshot={snapshot} players={players} send={send} chat={lobbyChat} />
          )}
          {snapshot.status === 'results' && (
            <Results
              snapshot={snapshot}
              players={players}
              isHost={isHost}
              send={send}
              chat={lobbyChat}
            />
          )}
        </main>
        {!ownChat && (
          <aside className="lobby-dock" aria-label="Chat">
            <Chat snapshot={snapshot} players={players} send={send} />
          </aside>
        )}
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
      {panel === 'chat' && !ownChat && (
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
