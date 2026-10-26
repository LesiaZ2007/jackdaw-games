'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Letterhoard: catalog art, detail page and screens. It uses Jackdaw's own lobby. */
export const wordhoardUi: GameUi = {
  art: { band: 'azure', field: 'checky', glyph: 'tiles' },
  about: {
    description:
      'A crossword game with letter tiles. Build off the words already on the board, try to land your big letters on the bonus squares, and keep an eye on what you leave open for the next player. Every word has to be real, and the game checks for you.',
    steps: [
      'Everyone draws seven tiles. The first word has to cover the star in the middle.',
      'On your turn, put tiles down in a single line so they connect to what’s on the board. Every new word you make counts.',
      'Letters are worth their number, and bonus squares double or triple a letter or a whole word. Use all seven tiles at once for 50 extra.',
      'You can also swap tiles or pass.',
      'Once the bag is empty and someone plays their last tile, they get the points left on everyone else’s racks. Highest score wins.',
      'With five or more players (or four, if you want), you play in pairs. Partners share a rack and a score, and either one can play.',
    ],
    credit:
      'A classic crossword tile game, with our own board and tile mix. Words come from ENABLE (public domain).',
    pictures: [
      {
        src: '/games/wordhoard/game-phone.png',
        alt: 'Letterhoard on a phone: the scores, the board and your rack of seven tiles.',
      },
      {
        src: '/games/wordhoard/desktop.png',
        alt: 'Letterhoard on a laptop: the board, your rack, the scores and the latest plays.',
        desktop: true,
      },
    ],
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
