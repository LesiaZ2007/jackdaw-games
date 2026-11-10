'use client';

import type { GameUi } from '@jackdaw/ui';
import { CodenamesLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';
import { TvReveal } from './tv-reveal';
import { CodenamesTvLobby } from './tv-lobby';
import { WatchScreen } from './watch';

/** Codenames: catalog art, detail page, its own lobby, and the screens. */
export const codenamesUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'grid' },
  about: {
    description:
      'Two teams, 25 words on the table. Only the spymasters know which words belong to which team, and they can help with just one word and a number. A wrong guess might hand the other team a point, or hit the assassin and lose on the spot.',
    steps: [
      'The host splits everyone into Red and Blue, and each team gets a spymaster.',
      'Your spymaster gives a one-word clue and a number.',
      'Tap a word to suggest it. It’s guessed once most of your team agrees, or someone holds it down.',
      'Guess as many words as the number, plus one. A wrong guess ends your turn.',
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
  optionHelp: {
    balance: 'Move operatives at the start so the teams differ by one at most.',
    newSpymasters:
      "Draw each team's spymaster at random every game instead of keeping the host's picks.",
  },
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
  Lobby: CodenamesLobby,
  TvLobby: CodenamesTvLobby,
};
