import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'rps',
  name: 'Rock Paper Scissors',
  tagline: 'Everyone throws at once. Beat as many friends as you can.',
  minPlayers: 2,
  maxPlayers: 10,
  category: 'board',
  minutes: [2, 5],
  complexity: 1,
};
