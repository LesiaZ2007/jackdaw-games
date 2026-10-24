'use client';

import { useEffect, useRef, useState } from 'react';
import { systemText, type ClientMessage, type LobbySnapshot } from '@jackdaw/engine';
import { Plaque, type ScreenPlayer } from '@jackdaw/ui';

/** Table talk: docked beside the game on wide screens, a sheet on phones. */
export function Chat({
  snapshot: s,
  players,
  send,
}: {
  snapshot: LobbySnapshot;
  players: ScreenPlayer[];
  send: (m: ClientMessage) => Promise<LobbySnapshot | null>;
}) {
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const byId = new Map(players.map((p) => [p.id, p]));
  const names = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const last = s.chat[s.chat.length - 1]?.id;

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [last]);

  async function post() {
    const t = text.trim();
    if (!t) return;
    setText('');
    // Not sent: put it back, unless they've started typing something else.
    if (!(await send({ type: 'chat', text: t }))) setText((now) => now || t);
  }

  return (
    <div className="chat">
      <h2 className="jd-display chat__title">Table talk</h2>
      <ol ref={list} className="chat__list" aria-live="polite">
        {s.chat.length === 0 && <li className="chat__empty">Nothing said yet. Say hello.</li>}
        {s.chat.map((m, i) => {
          if (m.system) {
            return (
              <li key={m.id} className="chat__system">
                {systemText(m, names)}
              </li>
            );
          }
          const p = m.playerId ? byId.get(m.playerId) : undefined;
          // Back-to-back messages from one person show the name once.
          const prev = s.chat[i - 1];
          const more = Boolean(prev && !prev.system && prev.playerId === m.playerId);
          return (
            <li
              key={m.id}
              className={['chat__msg', more && 'more', m.playerId === s.me && 'mine']
                .filter(Boolean)
                .join(' ')}
              style={
                p ? ({ '--c': `var(--tint-${p.avatar.tint})` } as React.CSSProperties) : undefined
              }
            >
              {/* Back-to-back messages leave the name column empty; screen readers still hear it. */}
              <b className={more ? 'chat__who sr-only' : 'chat__who'}>{p?.name ?? 'Someone'}</b>
              <span className="chat__text">{m.text}</span>
            </li>
          );
        })}
      </ol>
      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          void post();
        }}
      >
        <input
          className="jd-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          placeholder="Say something…"
          aria-label="Message"
        />
        <Plaque small type="submit" disabled={!text.trim()}>
          Send
        </Plaque>
      </form>
    </div>
  );
}
