'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import { Chits, Plaque, Sheet } from '@jackdaw/ui';
import { forgetSeat } from '@/lib/identity';
import { ThemeToggle } from '../../theme-toggle';

/** Less frequent things: move your seat to another phone, leave, switch day and dark. */
export function MenuSheet({
  open,
  onClose,
  code,
  snapshot: s,
  send,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  snapshot: LobbySnapshot;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const router = useRouter();
  const [confirmLeave, setConfirmLeave] = useState(false);
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
