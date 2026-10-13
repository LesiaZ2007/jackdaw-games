'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { RecapEvent } from '@jackdaw/engine';
import { Icon } from './icons';
import './overlays.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/**
 * A sheet: a printed card that slides up from the bottom on phones and sits as a centred card
 * (or a right-hand panel with `side="right"`) on wider screens. Escape and the backdrop close it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  side = 'bottom',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: 'bottom' | 'right';
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={cx('jd-sheet', `jd-sheet--${side}`)} role="presentation">
      <button
        type="button"
        className="jd-sheet__backdrop"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panel}
        className={cx('jd-sheet__panel', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="jd-sheet__head">
          <h2 className="jd-display jd-sheet__title">{title}</h2>
          <button type="button" className="jd-iconbtn" onClick={onClose} aria-label="Close">
            <Icon.close />
          </button>
        </header>
        <div className="jd-sheet__body">{children}</div>
      </div>
    </div>
  );
}

/** A brief message (rule refusals, network trouble). Disappears on its own after a few seconds. */
export function Toast({
  message,
  onDone,
  ms = 3600,
}: {
  message: string | null;
  onDone: () => void;
  ms?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, ms);
    return () => clearTimeout(t);
  }, [message, onDone, ms]);
  if (!message) return null;
  return (
    <div className="jd-toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}

/** Replace player ids in recap text with names, so "p_ab12 played Fail" reads "Bran played Fail". */
export function withNames(text: string, names: Record<string, string>): string {
  let out = text;
  for (const [id, name] of Object.entries(names)) if (id) out = out.split(id).join(name);
  return out;
}

/**
 * The end-of-game timeline: every event in order, grouped by round, with the hidden truth
 * behind each one revealed. Games may also render their own reveal; this is the default.
 */
export function RecapTimeline({
  events,
  names,
  title = 'How it went',
}: {
  events: RecapEvent[];
  names: Record<string, string>;
  title?: string;
}) {
  if (events.length === 0) return null;
  const rounds: { round: number | null; items: RecapEvent[] }[] = [];
  for (const e of events) {
    const round = e.round ?? null;
    const last = rounds[rounds.length - 1];
    if (last && last.round === round) last.items.push(e);
    else rounds.push({ round, items: [e] });
  }
  return (
    <section className="jd-recap" aria-label={title}>
      <h3 className="jd-display jd-recap__title">{title}</h3>
      <ol className="jd-recap__list">
        {rounds.map((r, i) => (
          <li key={i} className="jd-recap__round">
            {r.round !== null && <span className="jd-recap__n">Round {r.round}</span>}
            <ul>
              {r.items.map((e, j) => (
                <li key={j} className="jd-recap__event">
                  <span>
                    {e.actor && <b>{names[e.actor] ?? 'Someone'}: </b>}
                    {withNames(e.text, names)}
                  </span>
                  {e.secret && (
                    <span className="jd-recap__secret">{withNames(e.secret, names)}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
