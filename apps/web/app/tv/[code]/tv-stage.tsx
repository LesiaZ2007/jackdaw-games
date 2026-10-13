'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

const W = 1920;
const H = 1080;

const subscribeResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * A TV-pixel stage scaled to the screen, so the TV layout looks the same on a 720p set, a laptop
 * or a 4K TV. It is at least 1920×1080 and takes the window's own shape (a 16:10 laptop gets a
 * 1920×1200 stage), so every screen fills the display edge to edge, with no bars (up to 4:3 or
 * 21:9; anything narrower or wider is centred).
 *
 * With `below`, the first screen fills the window exactly and the extra content (the lobby's
 * night so far) is a second screen of at least the same height; scrolling snaps between them,
 * so each one takes over the display. Without it the stage never scrolls.
 */
export function TvStage({ children, below }: { children: ReactNode; below?: ReactNode }) {
  const size = useSyncExternalStore(subscribeResize, windowSize, () => `${W}x${H}`);
  const [vw, vh] = size.split('x').map(Number) as [number, number];
  const scale = Math.min(vw / W, vh / H);
  // The stage in TV pixels: the window's shape, never smaller than 1920×1080.
  const sw = vw / scale;
  const sh = vh / scale;
  const [measure, stageHeight] = useStageHeight(sh);

  if (below) {
    return (
      <div className="tv-viewport tv-viewport--scroll" style={{ height: stageHeight * scale }}>
        {/* Snap areas in window pixels: the first screen, then everything after it. */}
        <span className="tv-snap" style={{ top: 0, height: vh }} aria-hidden="true" />
        <span
          className="tv-snap"
          style={{ top: vh, height: Math.max(vh, stageHeight * scale - vh) }}
          aria-hidden="true"
        />
        <div
          ref={measure}
          className="tv-stage tv-stage--scroll"
          style={{ width: sw, transform: `scale(${scale})` }}
        >
          <div className="tv-screen" style={{ height: sh }}>
            {children}
          </div>
          <div className="tv-below" style={{ minHeight: sh }}>
            {below}
          </div>
        </div>
      </div>
    );
  }

  // A game or results screen stretches to the window up to 4:3 or 21:9 (a TV, a laptop, an
  // ultrawide), and sits centred beyond that, so a portrait phone doesn't get a sliver.
  const fw = Math.min(sw, (H * 21) / 9);
  const fh = Math.min(sh, (W * 3) / 4);
  const x = ((sw - fw) / 2) * scale;
  const y = ((sh - fh) / 2) * scale;
  return (
    <div className="tv-viewport">
      <div
        className="tv-stage"
        style={{
          width: fw,
          height: fh,
          transform: `translate(${x}px, ${y}px) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** The stage's own height in TV pixels, kept up to date as its content grows. */
function useStageHeight(initial: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(initial * 2);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, height] as const;
}

/** Keeps the TV from dimming or sleeping while a lobby is on screen (where supported). */
export function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen');
          if (cancelled) void lock.release();
        }
      } catch {
        // Not allowed here (e.g. no user gesture yet, or an old browser): the screen may sleep.
      }
    };
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, []);
}
