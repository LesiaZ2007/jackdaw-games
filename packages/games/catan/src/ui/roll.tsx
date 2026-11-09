'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { EventFace } from '../ck';
import { Die, EventDie } from './common';
import './roll.css';

/**
 * A roll takes the screen: the two dice tumble big in the middle, settle on the numbers with the
 * total under them, then glide up and shrink into the dice in the turn strip (`target`, measured
 * live, so it lands on the phone's strip and the TV's turn card alike). Tap to skip it; reduced
 * motion skips it altogether. `onDone` runs once it has landed.
 */
const EVENTS: EventFace[] = ['ship', 'science', 'ship', 'trade', 'ship', 'politics'];

export function RollMoment({
  dice,
  seq,
  target,
  tv = false,
  onDone,
  event = null,
  robberSleeps = false,
}: {
  dice: [number, number];
  seq: number;
  /** Cities & Knights: the event die (the first number die is then the red one). */
  event?: EventFace | null;
  /** Before the barbarians first land, a 7 doesn't move the robber. */
  robberSleeps?: boolean;
  /** A selector for the dice it lands on. */
  target: string;
  tv?: boolean;
  onDone: () => void;
}) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const root = useRef<HTMLDivElement>(null);
  const pair = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState<CSSProperties>({});
  // Faces flicker while the dice tumble, then settle on the roll. Deterministic per roll.
  const [tick, setTick] = useState(0);
  const TUMBLE = 9;

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      done.current();
      return;
    }
    const flicker = setInterval(() => setTick((k) => (k < TUMBLE ? k + 1 : k)), 75);
    // A fallback, should the browser never report the animation's end.
    const safety = setTimeout(() => done.current(), 3400);
    return () => {
      clearInterval(flicker);
      clearTimeout(safety);
    };
  }, []);

  // Where the strip's dice are, relative to where the big pair sits (in the overlay's own
  // pixels, which on the TV stage are scaled).
  useLayoutEffect(() => {
    const to = document.querySelector(target)?.getBoundingClientRect();
    const box = root.current?.getBoundingClientRect();
    const from = pair.current?.getBoundingClientRect();
    if (!to || !box || !from || !root.current) return;
    const k = box.width / (root.current.offsetWidth || box.width) || 1;
    const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) / k;
    const dy = (to.top + to.height / 2 - (from.top + from.height / 2)) / k;
    setGlide({
      '--gx': `${dx.toFixed(1)}px`,
      '--gy': `${dy.toFixed(1)}px`,
      '--gs': (to.width / from.width).toFixed(3),
    } as CSSProperties);
  }, [target]);

  const face = (i: number) =>
    tick >= TUMBLE ? dice[i]! : ((seq * 5 + tick * (3 + i * 2) + i) % 6) + 1;
  const total = dice[0] + dice[1];
  return (
    <div
      ref={root}
      className={tv ? 'ctn-roll ctn-roll--tv' : 'ctn-roll'}
      onClick={() => done.current()}
      role="status"
      aria-label={`Rolled ${total}`}
    >
      <div
        ref={pair}
        className="ctn-roll__pair"
        style={glide}
        onAnimationEnd={(e) => e.animationName === 'ctn-roll-glide' && done.current()}
      >
        <span className="ctn-roll__die ctn-roll__die--a">
          <Die n={face(0)} red={!!event} />
        </span>
        <span className="ctn-roll__die ctn-roll__die--b">
          <Die n={face(1)} red={!event} />
        </span>
        {event && (
          <span className="ctn-roll__die ctn-roll__die--c">
            <EventDie face={tick >= TUMBLE ? event : EVENTS[(seq + tick) % 6]!} />
          </span>
        )}
      </div>
      <p className={total === 7 ? 'ctn-roll__total ctn-roll__total--seven' : 'ctn-roll__total'}>
        <b>{total}</b>
        {total === 7 && <span>{robberSleeps ? 'Discard over the limit' : 'The robber moves'}</span>}
        {event && total !== 7 && (
          <span className="ctn-roll__event">
            {event === 'ship'
              ? 'The barbarian ship sails on'
              : `${event[0]!.toUpperCase()}${event.slice(1)} gate: progress cards`}
          </span>
        )}
      </p>
    </div>
  );
}
