import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'mafia',
  name: 'Mafia',
  tagline: 'Someone at this table is a killer. The app runs the night; you run the trial.',
  minPlayers: 5,
  maxPlayers: 15,
  category: 'social-deduction',
  minutes: [20, 45],
  complexity: 2,
};
