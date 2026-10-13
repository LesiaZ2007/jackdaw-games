'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { LobbyChat, ScreenPlayer } from './game-ui';
import './lobby-chat.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/**
 * Table talk for a game's own lobby (see `GameLobbyProps.chat`): a drawer from the right that the
 * bar's chat button opens, docked as a column from 1240px wide, where the game places it in its
 * own layout (as Avalon docks its chat beside the table). Each name takes its speaker's tint, a
 * speaker's back-to-back lines are grouped, and the lobby's own lines are set apart.
 *
 * It uses the shell's tokens. A game restyles it in its own look by setting these on any
 * ancestor (or on `className`): `--lc-bg`, `--lc-ink`, `--lc-dim`, `--lc-rule`, `--lc-field`,
 * `--lc-radius`, `--lc-title-font` and `--lc-name-font`. Names use `--tint-<id>`, or
 * `--lc-name-<id>` when a game needs lighter versions on a dark ground.
 */
export function LobbyChatPanel({
  chat,
  players,
  title = 'Table talk',
  className,
}: {
  chat: LobbyChat;
  players: ScreenPlayer[];
  title?: string;
  className?: string;
}) {
  const [text, setText] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const tints = new Map(players.map((p) => [p.id, p.avatar.tint]));
  const last = chat.lines.at(-1)?.id;
  const { open, close } = chat;

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last, open]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    if (!(await chat.send(t))) setText(t);
  }

  return (
    <>
      <aside className={cx('jd-lchat', open && 'is-open', className)} aria-label={title}>
        <div className="jd-lchat__head">
          <h2 className="jd-lchat__title">{title}</h2>
          <button type="button" className="jd-lchat__close" onClick={close}>
            Close
          </button>
        </div>
        <div className="jd-lchat__log" ref={log} aria-live="polite">
          {chat.lines.length === 0 && <p className="jd-lchat__empty">Nothing said yet.</p>}
          {chat.lines.map((m, i) => {
            if (m.system)
              return (
                <p key={m.id} className="jd-lchat__line is-system">
                  {m.text}
                </p>
              );
            const prev = chat.lines[i - 1];
            const grouped = Boolean(prev && !prev.system && prev.playerId === m.playerId);
            const tint = m.playerId ? tints.get(m.playerId) : undefined;
            return (
              <p
                key={m.id}
                className={cx('jd-lchat__line', grouped && 'is-grouped')}
                style={
                  tint
                    ? ({
                        '--lc-name': `var(--lc-name-${tint}, var(--tint-${tint}))`,
                      } as CSSProperties)
                    : undefined
                }
              >
                {!grouped && (
                  <b className="jd-lchat__name">
                    {m.name ?? 'Someone'}
                    {m.mine && <span className="jd-lchat__you"> (you)</span>}
                  </b>
                )}
                {m.text}
              </p>
            );
          })}
        </div>
        <form className="jd-lchat__form" onSubmit={send}>
          <input
            aria-label="Message"
            className="jd-lchat__field"
            value={text}
            maxLength={280}
            placeholder="Say something…"
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="jd-lchat__send" disabled={!text.trim()}>
            Send
          </button>
        </form>
      </aside>
      {open && (
        <button type="button" className="jd-lchat__scrim" aria-label="Close chat" onClick={close} />
      )}
    </>
  );
}
