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
      'Texas Hold’em with no limit, played with chips, not money. Everyone gets two cards nobody else sees, and five more are shared in the middle. Bet when you’re strong, bluff when you’re not, and take the pot with the best five cards, or by making everyone else fold.',
    steps: [
      'Everyone starts with the same chips. The two players left of the button post the blinds.',
      'You get two cards. Bet, call, raise or fold, starting left of the big blind.',
      'Three shared cards (the flop), then one (the turn), then one more (the river), with betting after each.',
      'The best five cards from your two and the shared five win the pot. Side pots go to whoever could win them.',
      'Out of chips, out of the game. Most chips when the hands run out wins, or the last player with any.',
    ],
    credit: 'Texas Hold’em is a traditional card game. Jackdaw’s own cards and table.',
    pictures: [
      {
        src: '/games/poker/game-phone.png',
        alt: 'Poker on a phone: the table from your seat with the flop and the pot, your two cards, and Fold, Call and Raise at the bottom.',
      },
      {
        src: '/games/poker/tv.png',
        alt: 'Poker on a TV: the oval table with every seat, the shared cards, the bets and the pot.',
        wide: true,
      },
    ],
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
};
