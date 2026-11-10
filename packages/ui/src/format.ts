/** A duration in milliseconds as a stopwatch reads it: "0:41", "12:05", "1:02:09". */
export function clockMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The same, from whole seconds (a countdown). */
export function clockSeconds(secs: number): string {
  return clockMs(secs * 1000);
}

/** "1 card", "3 cards". */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
