'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats, RiskTvLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';

/** What happens when the turn clock runs out (rules.ts `timeUp`). */
const LATE = 'When time runs out, any armies left are placed for you and your turn ends.';

/**
 * Risk: catalog art, detail page and screens. It uses Jackdaw's lobby with its own seats (the war
 * council's banners) and its own TV lobby.
 */
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
  optionHelp: {
    map: {
      World: 'The classic board: 42 territories over six continents.',
      Realm: 'Jackdaw’s own island kingdom: 42 provinces, six regions, a few sea crossings.',
    },
    goal: {
      'Secret missions':
        'Everyone gets a hidden goal; the first to finish theirs wins. About an hour.',
      'World domination': 'Take every territory on the map. The long game: two hours or more.',
    },
    setup: {
      Quick: 'Territories are dealt at random and armies spread out for you.',
      Draft: 'Territories are dealt, then everyone places their starting armies at once, unseen.',
    },
    cardSets: {
      Rising: 'Each set traded is worth more than the last (4, 6, 8, 10, 12, 15…).',
      Fixed: 'A set’s worth depends on its symbols: 4, 6 or 8 for three alike, 10 for one of each.',
    },
    turnTimer: {
      Off: 'Take as long as you like.',
      '1 minute': LATE,
      '2 minutes': LATE,
      '3 minutes': LATE,
    },
  },
  fit: true,
  LobbySeats,
  TvLobby: RiskTvLobby,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
