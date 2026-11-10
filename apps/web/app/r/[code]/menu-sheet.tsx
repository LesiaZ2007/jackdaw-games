'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import { AvatarButton, Chits, Plaque, ReactionBar, Sheet, Token } from '@jackdaw/ui';
import { forgetSeat } from '@/lib/identity';
import { ThemeChoice } from '../../theme-toggle';
import { AlertSettings } from './alert-settings';

/**
 * A step that can't be undone takes two taps, as in Avalon: the first arms it for four seconds,
 * the second does it.
 */
export function ConfirmButton({
  label,
  armedLabel,
  onConfirm,
}: {
  label: string;
  armedLabel: string;
  onConfirm: () => Promise<void>;
}) {
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
        await onConfirm();
        setBusy(false);
        setArmed(false);
      }}
    >
      {armed ? armedLabel : label}
    </Plaque>
  );
}

/** What ending early does to the scores, in words. */
const endNote = (canSave: boolean) =>
  canSave
    ? 'Stop the game for everyone. Save the rounds played so far (the leader wins), or end it without scoring.'
    : 'Stop the game for everyone and go back to the lobby. It won’t be scored.';

/**
 * The host's End game button in the bar opens this: the sheet is the confirm, so one tap ends it.
 * When the game has rounds worth keeping (2026-10-24), saving them is the first choice.
 */
export function EndGameSheet({
  open,
  onClose,
  send,
  canSave,
}: {
  open: boolean;
  onClose: () => void;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  canSave: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const end = async (save: boolean) => {
    setBusy(true);
    const out = await send({ type: 'endGame', save });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} title="End this game?">
      <section className="menu__block">
        <p>{endNote(canSave)}</p>
        <div className="flex flex-wrap gap-2">
          {canSave && (
            <Plaque small go disabled={busy} onClick={() => void end(true)}>
              Save the rounds so far
            </Plaque>
          )}
          <Plaque
            small
            className="menu__end is-armed"
            disabled={busy}
            onClick={() => void end(false)}
          >
            {canSave ? 'End without saving' : 'End it for everyone'}
          </Plaque>
          <Plaque small onClick={onClose}>
            Keep playing
          </Plaque>
        </div>
      </section>
    </Sheet>
  );
}

/**
 * Someone the host removed is asking to come back (2026-11-09: "have a notification pop up for
 * the host in case they do want to let them rejoin… also provide the option to block for 10
 * mins"). It opens by itself, one person at a time; closing it leaves them waiting, and it
 * comes back when someone else asks.
 */
export function KnockSheet({
  knocks,
  send,
}: {
  knocks: LobbySnapshot['knocks'];
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const [later, setLater] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const knock = knocks?.find((k) => !later.includes(k.id));
  // Keep the last one on screen while the sheet slides shut.
  const [shown, setShown] = useState(knock);
  if (knock && knock.id !== shown?.id) setShown(knock);

  const answer = async (allow: boolean) => {
    if (!knock) return;
    setBusy(true);
    await send({ type: 'answerKnock', id: knock.id, allow });
    setBusy(false);
    // Answered or gone stale: either way, don't ask about this one again.
    setLater((ids) => [...ids, knock.id]);
  };

  return (
    <Sheet
      open={Boolean(knock)}
      onClose={() => knock && setLater((ids) => [...ids, knock.id])}
      title={shown ? `${shown.name} wants back in` : 'Someone wants back in'}
    >
      {shown && (
        <section className="menu__block">
          <div className="menu__me">
            <Token avatar={shown.avatar} size={48} />
            <b>{shown.name}</b>
          </div>
          <p>
            You removed {shown.name} from this lobby, and they&rsquo;re asking to rejoin. Let them
            back in, or block them for 10 minutes. Closing this leaves them waiting.
          </p>
          <div className="flex flex-wrap gap-2">
            <Plaque small go disabled={busy} onClick={() => void answer(true)}>
              Let them back in
            </Plaque>
            <Plaque
              small
              className="menu__end is-armed"
              disabled={busy}
              onClick={() => void answer(false)}
            >
              Block for 10 minutes
            </Plaque>
          </div>
        </section>
      )}
    </Sheet>
  );
}

/**
 * Less frequent things: alerts for your move, move your seat to another phone, leave, switch day
 * and dark.
 */
export function MenuSheet({
  open,
  onClose,
  code,
  snapshot: s,
  send,
  onEdit,
  onLeaving,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  snapshot: LobbySnapshot;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  onEdit: () => void;
  /** Leaving has started (true) or was refused (false). */
  onLeaving: (leaving: boolean) => void;
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
    // Tell the page first, so the moment the seat is gone it doesn't read as a removal.
    onLeaving(true);
    const out = await send({ type: 'leave' });
    if (out) {
      forgetSeat(code);
      router.push('/');
    } else onLeaving(false);
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

      <section className="menu__block">
        <div className="menu__toggle">
          <h3 className="jd-label">Look</h3>
          <ThemeChoice />
        </div>
      </section>

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
          <p>{endNote(Boolean(s.canSave))}</p>
          <div className="flex flex-wrap gap-2">
            {s.canSave && (
              <ConfirmButton
                label="End and save the rounds"
                armedLabel="Tap again to save and end"
                onConfirm={async () => {
                  if (await send({ type: 'endGame', save: true })) onClose();
                }}
              />
            )}
            <ConfirmButton
              label={s.canSave ? 'End without saving' : 'End this game'}
              armedLabel="Tap again to end the game for everyone"
              onConfirm={async () => {
                if (await send({ type: 'endGame' })) onClose();
              }}
            />
          </div>
        </section>
      )}

      {s.hostId === s.me && (
        <section className="menu__block">
          <div className="menu__toggle">
            <h3 className="jd-label">Lobby door</h3>
            <Plaque small onClick={() => void send({ type: 'setLocked', locked: !s.locked })}>
              {s.locked ? 'Unlock the lobby' : 'Lock the lobby'}
            </Plaque>
          </div>
          <p>
            {s.locked
              ? 'Locked: nobody new can join with the code. Everyone here keeps their seat.'
              : 'Open: anyone with the code can join. Lock it once everyone is here.'}
          </p>
        </section>
      )}

      {me && <AlertSettings code={code} />}

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
            <p>Get a one-time code to carry your seat over to another phone.</p>
            <Plaque small onClick={() => send({ type: 'createRejoinCode' })}>
              Get a rejoin code
            </Plaque>
          </>
        )}
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
