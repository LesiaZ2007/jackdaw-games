'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** UNO: catalog art, detail page and screens. It uses Jackdaw's lobby, seated round the mat. */
export const unoUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'uno' },
  about: {
    description:
      'The shedding game everyone knows. Match the card on the pile by colour, number or symbol, hit the next player with Skips, Reverses and Draw Twos, and change the colour with a Wild. Down to your last card? Say UNO before someone catches you.',
    steps: [
      'Everyone gets seven cards and one is turned up. Play goes round from the dealer’s left.',
      'On your turn play a card that matches the pile by colour, number or symbol, or a Wild. Otherwise draw: if the card goes, you can play it.',
      'Skip misses the next player, Reverse turns play round, and Draw Two makes the next player take two and miss their go.',
      'A Wild Draw Four is only fair if you hold nothing in the colour in play. The next player can challenge it: a bluff costs the bluffer four, a fair one costs the challenger six.',
      'Down to one card, tap UNO! Anyone who catches you before the next player moves makes you take two.',
      'Go out first to win the round and score everyone’s leftover cards: numbers at face value, action cards 20, Wilds 50.',
      'Two small changes from the printed rules: the card turned up to start is always a number card, and with stacking on, a bluffer caught out takes the whole stack.',
    ],
    credit:
      'UNO is a trademark of Mattel. Played here by its published rules, with Jackdaw’s own cards.',
    pictures: [
      {
        src: '/games/uno/game-phone.png',
        alt: 'UNO on a phone: the table from your seat with the draw pile and the discard pile ringed in the colour in play, your hand fanned along the bottom, and Draw.',
      },
      {
        src: '/games/uno/tv.png',
        alt: 'UNO on a TV: the table printed in the colour in play, the piles large in the middle, every player’s hand fanned face down round it with the count on a chit, and the play by play.',
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
