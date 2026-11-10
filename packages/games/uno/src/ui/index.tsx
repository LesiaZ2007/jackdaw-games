'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** UNO: catalog art, detail page and screens. It uses Jackdaw's lobby, seated around the mat. */
export const unoUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'uno' },
  about: {
    description:
      'The shedding game everyone knows. Match the card on the pile by color, number or symbol, hit the next player with Skips, Reverses and Draw Twos, and change the color with a Wild. When you’re down to your last card, say UNO before someone catches you.',
    steps: [
      'Everyone gets seven cards and one is turned up. Play starts to the dealer’s left.',
      'Play a card that matches the pile, or a Wild. If you can’t, draw, and play that card if it fits.',
      'Skip misses the next player, Reverse flips direction, and Draw Two makes them take two and miss a turn.',
      'Play a Wild Draw Four only with no card in the color in play. If challenged, a bluffer draws four and a wrong challenger six.',
      'Tap UNO! on your last card, or draw two if caught. Go out first to win the round and score the leftovers.',
    ],
    credit:
      'UNO is a trademark of Mattel. Played here by its published rules, with Jackdaw’s own cards.',
    pictures: [
      {
        src: '/games/uno/game-phone.png',
        alt: 'UNO on a phone: the table from your seat with the draw pile and the discard pile ringed in the color in play, a Skip stamp across it, and your hand along the bottom.',
      },
      {
        src: '/games/uno/tv.png',
        alt: 'UNO on a TV: the table printed in the color in play, the piles large in the middle, every player’s hand fanned face down around it with the count on a chit, and the play by play.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    length: {
      'One round': 'The first to go out wins.',
      'To 200 points': 'Rounds until someone has 200 points. About half an hour.',
      'To 500 points': 'The official game: rounds until someone has 500.',
    },
    drawing: {
      'Draw one': 'The official rule: draw one card, and play it if it goes.',
      'Draw until you can play': 'Keep drawing until a card goes.',
    },
    stacking: {
      No: 'The official rule: a Draw Two or Four always lands.',
      Yes: 'Pass a Draw Two on with another Draw Two or a Draw Four, and a Draw Four with a Draw Four. The next player takes the lot.',
    },
    turnTimer: 'Out of time, you draw and play moves on.',
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
  WatchScreen,
};
