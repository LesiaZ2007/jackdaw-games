import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'codenames',
  name: 'Codenames',
  tagline: 'One-word clues, two rival spymasters.',
  minPlayers: 4,
  maxPlayers: 15,
  category: 'word',
  minutes: [15, 30],
  complexity: 1,
};
