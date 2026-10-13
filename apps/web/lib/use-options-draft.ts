'use client';

import { useState } from 'react';

type Options = Record<string, unknown>;

/**
 * A game's options as the host is changing them. Changes show at once and stack while saves are
 * in flight, so two quick taps on − both count; once every save is back, the server's copy wins.
 */
export function useOptionsDraft(options: Options, save: (next: Options) => unknown) {
  const [draft, setDraft] = useState<Options | null>(null);
  const [pending, setPending] = useState(0);
  if (pending === 0 && draft !== null) setDraft(null);
  const current = draft ?? options;

  const set = (next: Options) => {
    setDraft(next);
    setPending((n) => n + 1);
    void Promise.resolve(save(next)).finally(() => setPending((n) => n - 1));
  };
  return [current, set] as const;
}
