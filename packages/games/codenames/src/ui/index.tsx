'use client';

import type { GameUi } from '@jackdaw/ui';
import { CodenamesLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';
import { CodenamesTvLobby } from './tv-lobby';

/** Codenames: catalog art, detail page, its own lobby, and the screens. */
export const codenamesUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'agent' },
  about: {
    description:
      'Two teams race to find their agents among 25 words. Only the two spymasters can see which word is whose, and each turn they get one word and one number to steer their team. Find a bystander and your turn ends; find the assassin and you lose on the spot.',
    steps: [
      'The host splits the table into Red and Blue, each with a spymaster.',
      'Your spymaster gives a one-word clue and a number.',
      'Tap words to suggest them. Most of the team agreeing, or one long press, makes the guess.',
      'You get the number plus one guesses. A wrong colour ends the turn.',
      'First team to uncover all its words wins. The assassin loses it on the spot.',
    ],
    credit: 'Based on Codenames by Vlaada Chvátil. Jackdaw’s own word list and art.',
    pictures: [
      {
        src: '/games/codenames/operative-phone.png',
        alt: 'Codenames on a phone: the clue stamped at the top, both teams, and the 25 words with two already uncovered.',
      },
      {
        src: '/games/codenames/tv.png',
        alt: 'Codenames on a TV: the big board of words, the current clue, both teams and the clues so far.',
        wide: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
  Reveal,
  Lobby: CodenamesLobby,
  TvLobby: CodenamesTvLobby,
};
