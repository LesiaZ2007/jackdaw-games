'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { TvScreen } from './tv';

/** Poker: catalog art, detail page and screens. It uses Jackdaw's own lobby. */
export const pokerUi: GameUi = {
  art: { band: 'vert', field: 'lozengy', glyph: 'cards' },
  about: {
    description:
      'No-limit Texas Hold’em with chips instead of money. You get two cards only you can see, and five more get dealt face up in the middle for everyone. Bet big when you’ve got it, bluff when you don’t, and win the pot with the best hand or by getting everyone else to fold.',
    steps: [
      'Everyone starts with the same stack. The two players after the dealer put in the blinds.',
      'You get two cards. Starting after the big blind, fold, call or raise.',
      'Three cards go in the middle (the flop), then one (the turn), then one more (the river). There’s a round of betting after each.',
      'Best five cards out of your two and the five in the middle takes the pot. Side pots are sorted out for you.',
      'Run out of chips and you’re out. When the hands run out, the biggest stack wins.',
    ],
    credit: 'Texas Hold’em is a traditional card game. Cards and table drawn for Jackdaw.',
    pictures: [
      {
        src: '/games/poker/game-phone.png',
        alt: 'Poker on a phone: the table from your seat, the flop and the pot, your two cards and the betting buttons.',
      },
      {
        src: '/games/poker/desktop.png',
        alt: 'Poker on a laptop: the whole table with every seat, the cards in the middle and the pot.',
        desktop: true,
      },
    ],
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
};
