import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'catan',
  name: 'Catan',
  tagline: 'Settle the island, trade for what you lack, build to ten points.',
  minPlayers: 3,
  maxPlayers: 6,
  category: 'board',
  minutes: [60, 120],
  complexity: 2,
};
