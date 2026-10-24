import type { RecapEvent } from '@jackdaw/engine';

/**
 * Replace player ids in recap text with names, so "{p_ab12} played Fail" (the chat convention,
 * see `systemText`) and "p_ab12 played Fail" both read "Rook played Fail". `{actor}` stands for
 * `actor` when one is given. Braced ids go first, so the bare pass never leaves stray braces.
 */
export function withNames(text: string, names: Record<string, string>, actor?: string): string {
  let out = text.replace(/\{([A-Za-z0-9_-]+)\}/g, (whole, id: string) => {
    const key = id === 'actor' && actor ? actor : id;
    return names[key] ?? whole;
  });
  for (const [id, name] of Object.entries(names)) if (id) out = out.split(id).join(name);
  return out;
}

/** One recap event ready to show: who did it (unless the text already names them), what, and the hidden truth. */
export interface RecapLine {
  /** The actor's name, to print before the text, or null when the text already names them. */
  actor: string | null;
  text: string;
  secret?: string;
}

export function recapLine(event: RecapEvent, names: Record<string, string>): RecapLine {
  const a = event.actor;
  // `includes(a)` covers both "{p_ab12}" and a bare "p_ab12".
  const named = !a || event.text.includes('{actor}') || event.text.includes(a);
  return {
    actor: named ? null : (names[a] ?? 'Someone'),
    text: withNames(event.text, names, a),
    ...(event.secret ? { secret: withNames(event.secret, names, a) } : {}),
  };
}
