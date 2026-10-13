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
 * A fixed 1920×1080 stage scaled to fit the screen, so the TV layout looks the same on a 720p
 * set, a laptop or a 4K TV. Spare space is filled by the table.
 *
 * With `below`, the first screen still fills the window exactly and the extra content follows it
 * at the same scale, so the page scrolls down to it (the lobby's night so far). Without it the
 * stage never scrolls.
 */
export function TvStage({ children, below }: { children: ReactNode; below?: ReactNode }) {
  const size = useSyncExternalStore(subscribeResize, windowSize, () => `${W}x${H}`);
  const [vw, vh] = size.split('x').map(Number) as [number, number];
  const scale = Math.min(vw / W, vh / H);
  const fit = { scale, x: (vw - W * scale) / 2, y: (vh - H * scale) / 2 };
  const [measure, stageHeight] = useStageHeight();

  if (below) {
    return (
      <div className="tv-viewport tv-viewport--scroll" style={{ height: stageHeight * scale }}>
        <div
          ref={measure}
          className="tv-stage tv-stage--scroll"
          style={{ transform: `translate(${fit.x}px, 0) scale(${fit.scale})` }}
        >
          <div className="tv-screen">{children}</div>
          {below}
        </div>
      </div>
    );
  }

  return (
    <div className="tv-viewport">
      <div
        className="tv-stage"
        style={{ transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

/** The stage's own height in TV pixels, kept up to date as its content grows. */
function useStageHeight() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(H);
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
