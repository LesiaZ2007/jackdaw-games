'use client';

import { useEffect, useState } from 'react';

const reduce = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The seq of a log entry that arrived after this screen opened, for one flight of the checkers.
 * A refresh does not replay it. Reduced motion skips the flight.
 */
export function useArrival(seq: number): number | null {
  const [tracked, setTracked] = useState(seq);
  const [arrived, setArrived] = useState<number | null>(null);
  if (tracked !== seq) {
    setTracked(seq);
    setArrived(reduce() ? null : seq);
  }
  useEffect(() => {
    if (arrived == null) return;
    const t = window.setTimeout(() => setArrived(null), 1800);
    return () => window.clearTimeout(t);
  }, [arrived]);
  return arrived;
}
