'use client';

import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `at` (server time, from a game's table view), counting down live, or
 * null when there's no deadline. Pass the screen's `now()`, which is corrected for this device's
 * clock. Reaches 0 and stays there until the server moves on.
 */
export function useCountdown(at: number | null | undefined, now: () => number): number | null {
  const left = () => (at ? Math.max(0, Math.ceil((at - now()) / 1000)) : null);
  const [secs, setSecs] = useState(left);
  useEffect(() => {
    if (!at) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((at - now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [at, now]);
  return at ? secs : null;
}
