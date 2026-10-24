'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { RecapEvent } from '@jackdaw/engine';
import { Icon } from './icons';
import { recapLine } from './recap';
import './overlays.css';

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What every modal panel needs while `open`: focus moves into `panel` and back to where it was
 * on close, Escape calls `onClose`, and Tab stays inside the panel (it claims `aria-modal`).
 * `onClose` may be a fresh arrow each render; only `open` re-runs it.
 */
export function useModal(open: boolean, panel: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close.current();
      const box = panel.current;
      if (e.key !== 'Tab' || !box) return;
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return e.preventDefault();
      const at = document.activeElement;
      if (e.shiftKey && (at === first || at === box || !box.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !box.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open, panel]);
}

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
  useModal(open, panel, onClose);

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

/**
 * A brief message (rule refusals, network trouble) at the top of the screen. Disappears on its
 * own after a few seconds, or when tapped.
 */
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
    <div className="jd-toast" role="status" aria-live="polite" onClick={onDone}>
      {message}
    </div>
  );
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
              {r.items.map((e, j) => {
                const line = recapLine(e, names);
                return (
                  <li key={j} className="jd-recap__event">
                    <span>
                      {line.actor && <b>{line.actor}: </b>}
                      {line.text}
                    </span>
                    {line.secret && <span className="jd-recap__secret">{line.secret}</span>}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
