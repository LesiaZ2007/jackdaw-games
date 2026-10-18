import type { GameMeta } from '@jackdaw/engine';

export const meta: GameMeta = {
  id: 'rps',
  name: 'Rock Paper Scissors',
  tagline: 'Rock, paper, scissors with the whole table at once.',
  minPlayers: 2,
  maxPlayers: 10,
  category: 'board',
  minutes: [2, 5],
  complexity: 1,
};
