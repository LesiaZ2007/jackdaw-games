import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'uno',
  name: 'UNO',
  tagline: 'Match the colour or the number. Don’t forget to call it.',
  minPlayers: 2,
  maxPlayers: 10,
  category: 'card',
  minutes: [15, 45],
  complexity: 1,
};
