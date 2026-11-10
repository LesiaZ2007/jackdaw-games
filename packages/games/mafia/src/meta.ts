import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'mafia',
  name: 'Mafia / Werewolf',
  tagline: 'Someone at the table is a killer. Find them by day.',
  minPlayers: 5,
  maxPlayers: 15,
  category: 'social-deduction',
  minutes: [20, 45],
  complexity: 2,
};
