import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'backgammon',
  name: 'Backgammon',
  tagline: 'Race your fifteen home, hit what stands alone, and double when you dare.',
  minPlayers: 2,
  maxPlayers: 2,
  category: 'board',
  minutes: [15, 45],
  complexity: 2,
};
