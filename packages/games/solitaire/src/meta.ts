import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'solitaire',
  name: 'Solitaire',
  tagline: 'Everyone plays their own deck onto the same aces. First to clear out wins.',
  minPlayers: 1,
  maxPlayers: 6,
  category: 'card',
  minutes: [10, 25],
  complexity: 1,
};
