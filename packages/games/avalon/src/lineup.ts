/**
 * Avalon's deal, ported unchanged from the live app's `lib/rules.js` so Jackdaw's lobby can show
 * the same deal preview the Avalon lobby shows. The Avalon app does the real deal.
 */

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 15;
/** The box stops at 10. Bigger tables use the app's house rules. */
export const OFFICIAL_MAX = 10;

/** Knights sent on each of the five quests, by player count. */
export const QUEST_SIZES: Record<number, number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
  11: [3, 4, 4, 5, 5],
  12: [3, 4, 4, 5, 5],
  13: [4, 4, 5, 5, 6],
  14: [4, 5, 5, 6, 6],
  15: [4, 5, 5, 6, 6],
};

export const EVIL_COUNT: Record<number, number> = {
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
  11: 4,
  12: 5,
  13: 5,
  14: 5,
  15: 6,
};

/** With 7+ players the fourth quest only fails with two Fail cards. */
export const failsNeeded = (players: number, questIdx: number) =>
  players >= 7 && questIdx === 3 ? 2 : 1;

export type Role =
  'merlin' | 'percival' | 'servant' | 'assassin' | 'morgana' | 'mordred' | 'oberon' | 'minion';

export const ROLES: Record<Role, { name: string; team: 'good' | 'evil' }> = {
  merlin: { name: 'Merlin', team: 'good' },
  percival: { name: 'Percival', team: 'good' },
  servant: { name: 'Loyal Servant of Arthur', team: 'good' },
  assassin: { name: 'Assassin', team: 'evil' },
  morgana: { name: 'Morgana', team: 'evil' },
  mordred: { name: 'Mordred', team: 'evil' },
  oberon: { name: 'Oberon', team: 'evil' },
  minion: { name: 'Minion of Mordred', team: 'evil' },
};

export const MODES = {
  classic: { label: 'Merlin & Assassin', hint: 'The recommended setup for new groups.' },
  full: { label: 'Full set', hint: 'Every special role that fits your player count.' },
  custom: { label: 'Custom', hint: 'Pick roles yourself.' },
  plain: { label: 'No special roles', hint: 'Servants and minions only.' },
} as const;
export type Mode = keyof typeof MODES;

export const OPTIONAL_ROLES = ['merlin', 'percival', 'morgana', 'mordred', 'oberon'] as const;
export type OptionalRole = (typeof OPTIONAL_ROLES)[number];

/** Roles that only make sense alongside another one. */
export const ROLE_NEEDS: Partial<Record<OptionalRole, OptionalRole>> = {
  percival: 'merlin',
  mordred: 'merlin',
  morgana: 'percival',
};

/** Optional timers in seconds (0 is off), exactly the app's choices. */
export const TIMER_CHOICES = { talk: [0, 120, 180, 300], vote: [0, 30, 60, 120] } as const;
export const formatSeconds = (secs: number) => (secs < 60 ? `${secs}s` : `${secs / 60} min`);

export interface LineupSettings {
  mode: Mode;
  custom: Record<OptionalRole, boolean>;
}

export interface Lineup {
  players: number;
  good: Role[];
  evil: Role[];
  /** Evil specials that were picked but don't fit this player count. */
  dropped: Role[];
}

/** Work out which roles are dealt for a player count. Evil specials that don't fit are dropped. */
export function lineup(settings: LineupSettings, playerCount: number): Lineup {
  const n = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
  const evilN = EVIL_COUNT[n]!;
  const goodN = n - evilN;

  let picks: Partial<Record<OptionalRole, boolean>>;
  if (settings.mode === 'plain') picks = {};
  else if (settings.mode === 'classic') picks = { merlin: true };
  else if (settings.mode === 'full')
    picks = { merlin: true, percival: true, morgana: true, mordred: true, oberon: true };
  else picks = { ...settings.custom };

  for (const role of ['percival', 'mordred', 'morgana'] as const) {
    if (!picks[ROLE_NEEDS[role]!]) picks[role] = false;
  }

  const good: Role[] = [];
  const evil: Role[] = [];
  const dropped: Role[] = [];
  if (picks.merlin) {
    good.push('merlin');
    evil.push('assassin');
  }
  if (picks.percival) good.push('percival');
  for (const role of ['morgana', 'mordred', 'oberon'] as const) {
    if (!picks[role]) continue;
    if (evil.length < evilN) evil.push(role);
    else dropped.push(role);
  }
  while (good.length < goodN) good.push('servant');
  while (evil.length < evilN) evil.push('minion');
  return { players: n, good, evil, dropped };
}

/** "2 Loyal Servants", "Merlin", … in deal order, as the app's lobby lists them. */
export function describeRoles(roles: Role[]): string[] {
  const counts = new Map<Role, number>();
  for (const r of roles) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].map(([r, c]) => {
    const name = ROLES[r].name;
    if (c === 1) return name;
    const plural = r === 'servant' ? 'Loyal Servants' : r === 'minion' ? 'Minions' : name;
    return `${c} ${plural}`;
  });
}
