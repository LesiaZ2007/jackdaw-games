'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';

/** Rock Paper Scissors: catalog art, detail page and screens. */
export const rpsUi: GameUi = {
  art: { band: 'purpure', field: 'paly', glyph: 'rps' },
  about: {
    description:
      'Everyone throws at once, in secret. You score a point for every friend your throw beats. After the last round, the most points wins.',
    steps: [
      'Everyone picks rock, paper or scissors in secret.',
      'When the last pick is in, all throws are shown together.',
      'Score one point for each player your throw beats.',
      'Most points after the last round wins; ties share the win.',
    ],
    credit: 'A schoolyard classic. This is the test game for Jackdaw.',
    pictures: [
      {
        src: '/games/rps/game-phone.png',
        alt: 'Rock Paper Scissors on a phone: who has thrown, the scores, last round’s throws and the three throw buttons.',
      },
      {
        src: '/games/rps/tv.png',
        alt: 'Rock Paper Scissors on a TV: the round, who is still thinking, last round’s throws and the scores.',
        wide: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
};
