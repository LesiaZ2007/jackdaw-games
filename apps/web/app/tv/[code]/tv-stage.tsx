'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

const W = 1920;
const H = 1080;

const subscribeResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * A fixed 1920×1080 stage scaled to fit the screen, so the TV layout never scrolls and looks
 * the same on a 720p set, a laptop or a 4K TV. Spare space is filled by the table.
 */
export function TvStage({ children }: { children: ReactNode }) {
  const size = useSyncExternalStore(subscribeResize, windowSize, () => `${W}x${H}`);
  const [vw, vh] = size.split('x').map(Number) as [number, number];
  const scale = Math.min(vw / W, vh / H);
  const fit = { scale, x: (vw - W * scale) / 2, y: (vh - H * scale) / 2 };

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
