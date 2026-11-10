'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Letterhoard: catalog art, detail page and screens. It uses Jackdaw's own lobby. */
export const wordhoardUi: GameUi = {
  art: { band: 'azure', field: 'semee', glyph: 'tiles' },
  about: {
    description:
      'A crossword game with letter tiles. Build off the words already on the board, land your big letters on bonus squares, and watch what you leave open for the next player. Every word has to be real, and the game checks for you.',
    steps: [
      'Everyone draws seven tiles. The first word has to cover the star in the middle.',
      'On your turn, lay tiles in a single line that connects to the board. Every new word you make scores.',
      'Each letter has a value, and bonus squares double or triple a letter or word. Play all seven tiles for 50 extra.',
      'You can also swap tiles or pass. With five or more players, partners share a rack and a score.',
      'Once the bag is empty and someone plays their last tile, they collect the points left on every rack. Highest score wins.',
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
  optionHelp: {
    pairs: {
      'Past four players':
        'With five or more players you play in pairs, sharing a rack and a score. Up to four, everyone plays alone.',
      Always: 'Everyone plays in pairs, sharing a rack and a score. Needs at least three players.',
    },
    turnTimer: 'Out of time, your turn passes.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
