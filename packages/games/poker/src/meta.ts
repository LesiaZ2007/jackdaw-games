import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'poker',
  name: 'Poker',
  tagline: 'Texas Hold’em, played for chips.',
  minPlayers: 2,
  maxPlayers: 10,
  category: 'card',
  minutes: [30, 90],
  complexity: 2,
};
