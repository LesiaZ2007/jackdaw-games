/** Join class names, skipping anything falsy. */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');

/** "2" or "2–6" for a [min, max] pair. */
export const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);
