import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'monopoly',
  name: 'Monopoly',
  tagline: 'Buy up the town street by street, build, and bankrupt your friends.',
  minPlayers: 2,
  maxPlayers: 6,
  category: 'board',
  minutes: [45, 120],
  complexity: 2,
};
