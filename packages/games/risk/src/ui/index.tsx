'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';

/** Risk: catalog art, detail page and screens. It uses Jackdaw's own lobby. */
export const riskUi: GameUi = {
  art: { band: 'tenne', field: 'checky', glyph: 'banners' },
  about: {
    description:
      'Raise armies, roll the dice and take the world, one territory at a time. Play the classic world map or Jackdaw’s own island realm. With secret missions (the quick game) the first to complete theirs wins; in world domination, the last army standing.',
    steps: [
      'The territories are dealt at random and everyone’s armies spread across them (or place your own, all at once).',
      'Each turn, add armies: a third of your territories (at least 3), plus bonuses for whole continents and sets of cards.',
      'Attack your neighbours: Roll for one throw of the dice, or Blitz to fight it out. The defender wins ties.',
      'Take a territory and earn a card. Three that match, or one of each, trade in for more armies.',
      'End your turn with one move between your joined-up territories. Complete your mission, or take everything, to win.',
    ],
    credit: 'Based on Risk by Albert Lamorisse. Jackdaw’s own maps and pieces.',
    pictures: [
      {
        src: '/games/risk/game-phone.png',
        alt: 'Risk on a phone: the map zoomed in on Asia, Irkutsk picked to attack Siberia, with Back, Stop, Blitz and Roll at the bottom.',
      },
      {
        src: '/games/risk/tv.png',
        alt: 'Risk on a TV: the whole world map with every army, the players’ lands, armies and cards, the last dice and who holds each continent.',
        wide: true,
      },
    ],
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
