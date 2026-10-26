'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats, RiskTvLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

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
      'Build up armies, attack your neighbours and try to take over the map. Play the classic world map or our own island kingdom. With secret missions the first person to finish theirs wins, which keeps it to about an hour. World domination goes until one player owns everything.',
    steps: [
      'Territories are handed out at random and your armies are spread across them (or everyone places their own, all at once).',
      'At the start of your turn you get new armies: a third of your territories (at least 3), plus extra for whole continents and traded-in cards.',
      'Attack next door. Roll once at a time, or Blitz to fight until it’s settled. The defender wins ties.',
      'Take at least one territory and you get a card. Three of a kind, or one of each, trade in for more armies.',
      'Finish with one move between territories you hold that connect. Complete your mission, or take everything, to win.',
    ],
    credit: 'Based on Risk by Albert Lamorisse, with our own maps and pieces.',
    pictures: [
      {
        src: '/games/risk/game-phone.png',
        alt: 'Risk on a phone: the map zoomed in, a territory picked to attack, and Roll and Blitz at the bottom.',
      },
      {
        src: '/games/risk/desktop.png',
        alt: 'Risk on a laptop: the whole map with every army, and each player’s lands, armies and cards.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    map: {
      World: 'The classic board: 42 territories over six continents.',
      Realm: 'Jackdaw’s own island kingdom: 42 provinces, six regions, a few sea crossings.',
      Skerries: 'An archipelago: 42 territories on fifteen islands, every group reached by sea.',
      'Twin Crowns':
        'Two kingdoms facing each other across a strait, joined only by four stepping stones.',
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
    fog: {
      false: 'Everyone sees the whole map.',
      true: 'You see only your own territories and the ones next door. The rest stays hidden until the end.',
    },
  },
  fit: true,
  LobbySeats,
  TvLobby: RiskTvLobby,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
