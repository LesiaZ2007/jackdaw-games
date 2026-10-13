'use client';

import { useEffect, useState } from 'react';
import type { Avatar, ClientMessage, LobbySnapshot } from '@jackdaw/engine';
import {
  AvatarPicker,
  Chits,
  CREST_CHOICES,
  Lid,
  Plaque,
  TINT_CHOICES,
  takenAvatars,
  Token,
} from '@jackdaw/ui';
import {
  getDeviceToken,
  rememberAvatar,
  rememberedAvatar,
  rememberedName,
  rememberName,
  rememberSeat,
} from '@/lib/identity';
import { catalogEntry } from '@/lib/catalog';

/** Pick an avatar nobody else in the lobby has, preferring the one this device used before. */
function freeAvatar(taken: Avatar[], preferred: Avatar | null): Avatar {
  const crests = new Set(taken.map((a) => a.crest));
  const tints = new Set(taken.map((a) => a.tint));
  if (preferred && !crests.has(preferred.crest) && !tints.has(preferred.tint)) return preferred;
  return {
    crest: CREST_CHOICES.find((c) => !crests.has(c)) ?? CREST_CHOICES[0],
    tint: TINT_CHOICES.find((t) => !tints.has(t)) ?? TINT_CHOICES[0],
  };
}

/** Taking a seat: name, crest and colour. Also handles moving a seat over from another phone. */
export function JoinCard({
  code,
  snapshot,
  removed,
  onJoined,
  onForget,
  send,
}: {
  code: string;
  snapshot: LobbySnapshot;
  removed: boolean;
  onJoined: () => void;
  onForget: () => void;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const taken = snapshot.players.map((p) => p.avatar);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(() => freeAvatar(taken, null));
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState(false);
  const [rejoin, setRejoin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- device storage is only readable after hydration
    setName(rememberedName() ?? '');
    setAvatar(
      freeAvatar(
        snapshot.players.map((p) => p.avatar),
        rememberedAvatar(),
      ),
    );
    // Only on first render: later polls must not overwrite what the player picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const full = snapshot.players.length >= 15;
  const game = catalogEntry(snapshot.selectedGameId);
  const playing = snapshot.status === 'in_game';

  async function join() {
    const trimmed = name.trim();
    if (!trimmed) return setError('Type your name, so the table knows who you are.');
    setBusy(true);
    setError(null);
    rememberName(trimmed);
    rememberAvatar(avatar);
    const s = await send({ type: 'join', name: trimmed, avatar });
    setBusy(false);
    if (s?.me) {
      rememberSeat(code, s.me);
      onJoined();
    }
  }

  async function redeem() {
    if (rejoin.trim().length !== 6) return setError('Rejoin codes are 6 letters.');
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lobby/${code}/rejoin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-player-token': getDeviceToken() },
      body: JSON.stringify({ rejoinCode: rejoin.trim().toUpperCase() }),
    });
    const body = (await res.json().catch(() => null)) as
      (LobbySnapshot & { error?: { message: string } }) | null;
    setBusy(false);
    if (!res.ok || !body?.me)
      return setError(body?.error?.message ?? 'That rejoin code is wrong or has expired.');
    rememberSeat(code, body.me);
    onJoined();
    // The next poll picks up the moved seat; reload so every panel starts fresh.
    window.location.reload();
  }

  return (
    <Lid className="join-card">
      <div className="join-card__head">
        <span className="jd-label">Joining lobby</span>
        <Chits code={code} size={40} flip />
        {removed ? (
          <p className="join-card__note" role="alert">
            You were removed from this lobby, or your seat moved to another phone. You can take a
            new seat.
          </p>
        ) : (
          <p className="join-card__note">
            {snapshot.players.length} {snapshot.players.length === 1 ? 'person is' : 'people are'}{' '}
            here
            {game ? `, getting ready for ${game.meta.name}` : ''}.
            {playing ? ' A game is on; you’ll be seated for the next one.' : ''}
          </p>
        )}
      </div>

      {moving ? (
        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="jd-label">Rejoin code from your other phone</span>
            <input
              className="jd-input join-card__rejoin"
              value={rejoin}
              onChange={(e) =>
                setRejoin(
                  e.target.value
                    .replace(/[^a-z]/gi, '')
                    .toUpperCase()
                    .slice(0, 6),
                )
              }
              placeholder="ABCDEF"
              autoCapitalize="characters"
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && redeem()}
            />
          </label>
          <Plaque go onClick={redeem} disabled={busy}>
            Move my seat here
          </Plaque>
          <button type="button" className="home-link" onClick={() => setMoving(false)}>
            Take a new seat instead
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          <label className="join-card__name">
            <span className="jd-label">Your name</span>
            <span className="join-card__row">
              <Token avatar={avatar} size={52} />
              <input
                className="jd-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={20}
                placeholder="e.g. Jackdaw"
                autoComplete="nickname"
                onKeyDown={(e) => e.key === 'Enter' && join()}
              />
            </span>
          </label>
          <AvatarPicker
            value={avatar}
            onChange={setAvatar}
            takenBy={takenAvatars(snapshot.players)}
          />
          <Plaque go onClick={join} disabled={busy || full}>
            {full
              ? 'This lobby is full'
              : busy
                ? 'Taking a seat…'
                : playing
                  ? 'Watch, and play next game'
                  : 'Take a seat'}
          </Plaque>
          {removed && (
            <button type="button" className="home-link" onClick={onForget}>
              Dismiss this message
            </button>
          )}
          <button type="button" className="home-link" onClick={() => setMoving(true)}>
            Moving from another phone? Enter your rejoin code
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="join-card__error">
          {error}
        </p>
      )}
    </Lid>
  );
}
