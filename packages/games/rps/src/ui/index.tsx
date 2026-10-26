'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Rock Paper Scissors: catalog art, detail page and screens. */
export const rpsUi: GameUi = {
  art: { band: 'purpure', field: 'paly', glyph: 'rps' },
  about: {
    description:
      'Everyone picks at the same time. You get a point for every person your throw beats, so it pays to guess what the rest of the table will do. Most points after the last round wins.',
    steps: [
      'Pick rock, paper or scissors. Nobody sees it yet.',
      'Once everyone has picked, all the throws are shown at once.',
      'You score a point for each player you beat.',
      'Most points after the last round wins. Ties share the win.',
    ],
    credit: 'The playground classic. It’s also the game we test Jackdaw with.',
    pictures: [
      {
        src: '/games/rps/game-phone.png',
        alt: 'Rock Paper Scissors on a phone: who has picked, the scores, last round’s throws and the three buttons.',
      },
      {
        src: '/games/rps/desktop.png',
        alt: 'Rock Paper Scissors on a laptop: the round, the scores, last round’s throws and the three buttons.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    rounds: 'How many throws before the scores are added up. Each round takes a few seconds.',
  },
  PlayerScreen,
  TvScreen,
  WatchScreen,
};
