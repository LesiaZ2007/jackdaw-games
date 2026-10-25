'use client';

import type { GameUi } from '@jackdaw/ui';
import { CodenamesLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';
import { CodenamesTvLobby } from './tv-lobby';

/** Codenames: catalog art, detail page, its own lobby, and the screens. */
export const codenamesUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'grid' },
  about: {
    description:
      'Two teams, 25 words on the table. Only the spymasters know which words belong to which team, and they can only help with one word and a number. Guess wrong and you might hand the other team a point, or hit the assassin and lose right there.',
    steps: [
      'The host splits everyone into Red and Blue, and each team gets a spymaster.',
      'Your spymaster gives a one-word clue and a number.',
      'Tap a word to suggest it. It gets guessed once most of your team agrees, or someone holds it down.',
      'You get as many guesses as the number, plus one. A wrong guess ends your turn.',
      'Find all your words first to win. Touch the assassin and you lose.',
    ],
    credit: 'Based on Codenames by Vlaada Chvátil, with our own word list and art.',
    pictures: [
      {
        src: '/games/codenames/operative-phone.png',
        alt: 'Codenames on a phone: the clue at the top and the 25 words, two already turned over.',
      },
      {
        src: '/games/codenames/desktop.png',
        alt: 'Codenames on a laptop: the board of words, the clue, both teams and the clues so far.',
        desktop: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
  Reveal,
  Lobby: CodenamesLobby,
  TvLobby: CodenamesTvLobby,
};
