import type { ZodType } from 'zod';
import type { LobbySnapshot } from '@jackdaw/engine';
import type { ScreenPlayer } from '@jackdaw/ui';

/** The players as every game screen takes them. */
export function screenPlayers(s: LobbySnapshot): ScreenPlayer[] {
  return s.players.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    online: p.online,
    ...(p.bot ? { bot: true } : {}),
  }));
}

/** "roundsToWin" → "Rounds to win". */
function words(key: string) {
  const w = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** The chosen options in one line, e.g. "Rounds: 3". Mirrors what OptionsPanel shows. */
export function optionsSummary(schema: ZodType, options: Record<string, unknown>): string {
  const shape = (schema as unknown as { shape?: Record<string, { description?: string }> }).shape;
  if (!shape) return '';
  return Object.entries(shape)
    .filter(([key]) => ['string', 'number', 'boolean'].includes(typeof options[key]))
    .map(([key, field]) => {
      const v = options[key];
      const shown =
        typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'string' ? words(v) : String(v);
      return `${field.description ?? words(key)}: ${shown}`;
    })
    .join(', ');
}
