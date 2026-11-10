import { useEffect, useState } from 'react';

const reduced = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The reveal beat for a round that resolves while this screen is open (never one from before a
 * refresh). `count` is the public number of rounds played so far. The step runs:
 * 0 idle, 1 to 3 the count (One, Two, Three, 300ms each), 4 the flip (420ms),
 * 5 the verdict may land, 6 the discs go back to the table.
 * With reduced motion there is no count and no flip: it jumps to 5.
 */
export function useRevealBeat(count: number): number {
  const [seen, setSeen] = useState(count);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  // Adjusting state while rendering (the same pattern as the kit's useMoment).
  if (count !== seen) {
    setSeen(count);
    if (count > seen) {
      setStep(reduced() ? 5 : 1);
      setRun((r) => r + 1);
    } else {
      setStep(0);
    }
  }
  useEffect(() => {
    if (run === 0) return;
    const plan: Array<[number, number]> = reduced()
      ? [[3600, 6]]
      : [
          [300, 2],
          [600, 3],
          [900, 4],
          [1350, 5],
          [3700, 6],
        ];
    const timers = plan.map(([ms, s]) => window.setTimeout(() => setStep(s), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [run]);
  return step;
}

/** The discs of the round just played are on the ring (face down while counting, then up). */
export const revealing = (step: number) => step >= 1 && step < 6;
/** They are face up. */
export const flipped = (step: number) => step >= 4 && step < 6;
