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
      'Everyone throws at the same time. You score a point for every player your throw beats, so it pays to guess what the rest of the table will pick. Most points after the last round wins.',
    steps: [
      'Pick rock, paper or scissors. Nobody sees it yet.',
      'Once everyone has picked, all the throws are revealed at once.',
      'You score a point for each player you beat.',
      'Most points after the last round wins. Ties share the win.',
    ],
    credit: 'The playground classic. It’s also the game we test Jackdaw with.',
    pictures: [
      {
        src: '/games/rps/game-phone.png',
        alt: 'Rock Paper Scissors on a phone: everyone around a printed ring with their throws face down, the beats diagram in the middle, the scores, and the three throw discs.',
      },
      {
        src: '/games/rps/desktop.png',
        alt: 'Rock Paper Scissors on a laptop: the ring on the left, and the scores and the three throw discs beside it.',
        desktop: true,
      },
    ],
  },
  fit: true,
  optionHelp: {
    rounds: 'How many throws before the scores are added up. Each round takes a few seconds.',
  },
  PlayerScreen,
  TvScreen,
  WatchScreen,
};
