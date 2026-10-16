'use client';

import { useMoment } from '@jackdaw/ui';
import { useEffect, useRef } from 'react';
import { phaseBanner } from '../status';
import type { ShTableView } from '../rules';

/**
 * The phase banner, as on secret-hitler.online: a printed band sweeps across the middle of the
 * screen with the phase name ("Legislative session") whenever a new phase starts, then leaves on
 * its own. It never takes taps (they go straight through), it waits while a VerdictMoment is up
 * so the two never show at once, and it's keyed on the public phase so a refresh doesn't replay
 * it. With reduced motion it only fades.
 */
export function PhaseBanner({
  t,
  waiting,
  tv = false,
}: {
  t: ShTableView;
  /** A moment is showing: hold the banner until it clears. */
  waiting: boolean;
  tv?: boolean;
}) {
  const b = phaseBanner(t);
  const [fresh, clear] = useMoment(b?.key ?? 'over');
  if (!b || fresh === null || waiting) return null;
  return <Band key={fresh} title={b.title} onDone={clear} tv={tv} />;
}

function Band({ title, onDone, tv }: { title: string; onDone: () => void; tv: boolean }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 2200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className={`sh-banner${tv ? ' sh-banner--tv' : ''}`} aria-hidden="true">
      <div className="sh-banner__band">
        <span className="sh-banner__rule" />
        <span className="sh-banner__title">{title}</span>
        <span className="sh-banner__rule" />
      </div>
    </div>
  );
}
