'use client';

import { useState } from 'react';
import { nameClash, type Avatar, type ClientMessage, type LobbySnapshot } from '@jackdaw/engine';
import { AvatarPicker, Plaque, Sheet, Token, takenAvatars } from '@jackdaw/ui';
import { rememberAvatar, rememberName } from '@/lib/identity';

/** Changing your own name, crest and colour once you're seated (not mid-game). */
export function MeSheet({
  open,
  onClose,
  snapshot: s,
  send,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: LobbySnapshot;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const me = s.players.find((p) => p.id === s.me);
  return (
    <Sheet open={open && Boolean(me)} onClose={onClose} title="You at the table">
      {/* Mounted only while open, so each opening starts from what the server has now. */}
      {me && open && <MeForm snapshot={s} send={send} onDone={onClose} />}
    </Sheet>
  );
}

function MeForm({
  snapshot: s,
  send,
  onDone,
}: {
  snapshot: LobbySnapshot;
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
  onDone: () => void;
}) {
  const me = s.players.find((p) => p.id === s.me)!;
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState<Avatar>(me.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playing = s.status === 'in_game' && me.seated;
  const trimmed = name.trim();
  const changedName = trimmed !== me.name;
  const changedAvatar = avatar.crest !== me.avatar.crest || avatar.tint !== me.avatar.tint;

  async function save() {
    if (!trimmed) return setError('Type a name, so the table knows who you are.');
    const clash = changedName ? nameClash(s.players, trimmed, s.me) : null;
    if (clash) return setError(clash);
    setBusy(true);
    setError(null);
    let ok = true;
    if (changedAvatar) {
      ok = Boolean(await send({ type: 'setAvatar', avatar }));
      if (ok) rememberAvatar(avatar);
    }
    if (ok && changedName) {
      ok = Boolean(await send({ type: 'rename', name: trimmed }));
      if (ok) rememberName(trimmed);
    }
    setBusy(false);
    if (ok) onDone();
  }

  if (playing) {
    return (
      <div className="me-sheet">
        <div className="me-sheet__who">
          <Token avatar={me.avatar} size={64} />
          <b>{me.name}</b>
        </div>
        <p className="me-sheet__note">
          You can change your name, crest and colour once this game ends.
        </p>
        <Plaque onClick={onDone}>Close</Plaque>
      </div>
    );
  }

  return (
    <div className="me-sheet">
      <div className="me-sheet__who">
        <Token avatar={avatar} size={64} />
        <label className="me-sheet__name">
          <span className="jd-label">Your name</span>
          <input
            className="jd-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </label>
      </div>
      <AvatarPicker value={avatar} onChange={setAvatar} takenBy={takenAvatars(s.players, s.me)} />
      {error && (
        <p role="alert" className="join-card__error">
          {error}
        </p>
      )}
      <Plaque go onClick={save} disabled={busy || (!changedName && !changedAvatar)}>
        {busy ? 'Saving…' : 'Save'}
      </Plaque>
    </div>
  );
}
