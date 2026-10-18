'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';

/** Wordhoard: catalog art, detail page and screens. It uses Jackdaw's own lobby. */
export const wordhoardUi: GameUi = {
  art: { band: 'azure', field: 'checky', glyph: 'tiles' },
  about: {
    description:
      'A crossword race with letter tiles. Lay words across the board, hooked onto the words already there, and land your best letters on the coloured bonus squares. Every word you make has to be a real one; the game checks.',
    steps: [
      'Everyone draws seven tiles. The first word covers the star in the middle.',
      'On your turn, lay tiles in one line to make words joined to the board. Every new word counts.',
      'Letters score their value; bonus squares double or triple a letter or the whole word. All seven tiles at once earns 50 more.',
      'Or swap some tiles for new ones, or pass.',
      'When the bag is empty and someone plays their last tile, what’s left on the other racks goes to them. Most points wins.',
      'With five or more (or four, if you like), play in pairs: partners are drawn at random, share a rack and a score, and either can make the move.',
    ],
    credit:
      'A classic crossword tile game, with Jackdaw’s own board and tile mix. Words from ENABLE (public domain).',
    pictures: [
      {
        src: '/games/wordhoard/game-phone.png',
        alt: 'Wordhoard on a phone: the scores, the board with the words so far, and your rack of seven tiles.',
      },
      {
        src: '/games/wordhoard/tv.png',
        alt: 'Wordhoard on a TV: the board large, with the scores and the latest plays beside it.',
        wide: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
};
