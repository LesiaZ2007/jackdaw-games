import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'battleship',
  name: 'Battleship',
  tagline: 'Hide your fleet, then find theirs and sink it.',
  minPlayers: 2,
  maxPlayers: 2,
  category: 'board',
  minutes: [15, 30],
  complexity: 1,
};
