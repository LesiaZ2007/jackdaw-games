import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'codenames',
  name: 'Codenames',
  tagline: 'Give your team a one-word clue and hope they get it.',
  minPlayers: 4,
  maxPlayers: 15,
  category: 'word',
  minutes: [15, 30],
  complexity: 1,
};
