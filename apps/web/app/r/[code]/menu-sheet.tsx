'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import { AvatarButton, Chits, Plaque, ReactionBar, Sheet } from '@jackdaw/ui';
import { forgetSeat } from '@/lib/identity';
import { ThemeToggle } from '../../theme-toggle';

/**
 * Ending a game takes two taps, as in Avalon: the first arms it for four seconds, the second
 * ends it for everyone.
 */
function EndGameButton({ onEnd }: { onEnd: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Plaque
      small
      className={armed ? 'menu__end is-armed' : 'menu__end'}
      disabled={busy}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        await onEnd();
        setBusy(false);
        setArmed(false);
      }}
    >
      {armed ? 'Tap again to end the game for everyone' : 'End this game'}
    </Plaque>
  );
}

/** Less frequent things: move your seat to another phone, leave, switch day and dark. */
export function MenuSheet({
  open,
  onClose,
  code,
  snapshot: s,
  send,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  snapshot: LobbySnapshot;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const me = s.players.find((p) => p.id === s.me);
  const rejoin = s.rejoinCode;
  const inGame = s.status === 'in_game' && s.players.find((p) => p.id === s.me)?.seated;
  const until = rejoin
    ? new Date(rejoin.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  async function leave() {
    const out = await send({ type: 'leave' });
    if (out) {
      forgetSeat(code);
      router.push('/');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Lobby menu">
      {me && (
        <section className="menu__block">
          <h3 className="jd-label">You</h3>
          <div className="menu__me">
            <AvatarButton avatar={me.avatar} size={48} onClick={onEdit} />
            <b>{me.name}</b>
            <Plaque small onClick={onEdit}>
              Change
            </Plaque>
          </div>
        </section>
      )}

      {me && s.status !== 'waiting' && (
        <section className="menu__block">
          <h3 className="jd-label">React</h3>
          <p>Pops up over your seat for everyone at the table.</p>
          <ReactionBar
            onReact={(kind) => {
              void send({ type: 'react', kind });
              onClose();
            }}
          />
        </section>
      )}

      {s.status === 'in_game' && s.hostId === s.me && (
        <section className="menu__block">
          <h3 className="jd-label">This game</h3>
          <p>Stop the game for everyone and go back to the lobby. It won&rsquo;t be scored.</p>
          <EndGameButton
            onEnd={async () => {
              if (await send({ type: 'endGame' })) onClose();
            }}
          />
        </section>
      )}

      <section className="menu__block">
        <h3 className="jd-label">Move to another phone</h3>
        {rejoin ? (
          <>
            <Chits code={rejoin.code} size={40} label="Rejoin code" />
            <p>
              On the other phone, open this lobby and choose &ldquo;Enter your rejoin code&rdquo;.
              It works once, until {until}.
            </p>
          </>
        ) : (
          <>
            <p>
              Get a one-time code that moves your seat, and everything you can see, to a different
              phone.
            </p>
            <Plaque small onClick={() => send({ type: 'createRejoinCode' })}>
              Get a rejoin code
            </Plaque>
          </>
        )}
      </section>

      <section className="menu__block">
        <h3 className="jd-label">Look</h3>
        <ThemeToggle />
      </section>

      <section className="menu__block">
        <h3 className="jd-label">Leave</h3>
        {inGame ? (
          <p>You can leave once this game ends. Closing the tab keeps your seat.</p>
        ) : confirmLeave ? (
          <div className="flex flex-wrap gap-2">
            <Plaque small onClick={leave}>
              Yes, leave the lobby
            </Plaque>
            <Plaque small onClick={() => setConfirmLeave(false)}>
              Stay
            </Plaque>
          </div>
        ) : (
          <Plaque small onClick={() => setConfirmLeave(true)}>
            Leave lobby
          </Plaque>
        )}
      </section>
    </Sheet>
  );
}
