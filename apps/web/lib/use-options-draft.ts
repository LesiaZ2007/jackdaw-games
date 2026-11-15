'use client';

import { useState } from 'react';
import { createSaveQueue } from './save-queue';

type Options = Record<string, unknown>;

/**
 * A game's options as the host is changing them. Changes show at once and stack while saves are
 * in flight, so two quick taps on − both count; once every save is back, the server's copy wins.
 * Saves are sent in order, one at a time (see `createSaveQueue`), so a later change is never
 * undone by an earlier request arriving last.
 */
export function useOptionsDraft(options: Options, save: (next: Options) => unknown) {
  const [draft, setDraft] = useState<Options | null>(null);
  const [pending, setPending] = useState(0);
  const [push] = useState(() => createSaveQueue((n) => setPending((p) => p - n)));
  if (pending === 0 && draft !== null) setDraft(null);
  const current = draft ?? options;

  const set = (next: Options) => {
    setDraft(next);
    setPending((n) => n + 1);
    push(next, save);
  };
  return [current, set] as const;
}
