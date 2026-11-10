'use client';

import type { GameUi } from '@jackdaw/ui';
import { CatanTvLobby, LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

const LATE =
  'When time runs out, the step finishes for you: a roll, a discard, or the end of your turn.';

/**
 * Catan: catalog art, detail page and screens. It uses Jackdaw's lobby with its own seats (ships
 * bound for the island) and its own TV lobby.
 */
export const catanUi: GameUi = {
  art: { band: 'tenne', field: 'semee', glyph: 'hexes' },
  about: {
    description:
      'Settle an island of forests, fields, hills, pastures and mountains. The dice decide what the land gives each turn, so you trade with everyone for what you’re missing, then build roads, settlements and cities. First to ten points wins. Five or six players get a bigger island, and two expansions are optional: Seafarers, and Cities & Knights.',
    steps: [
      'Take turns placing two settlements and two roads. Your second settlement earns your first cards.',
      'On your turn, roll the dice. Each settlement beside that number takes a card, and each city takes two.',
      'Trade with the others or the bank (4 for 1, better at a harbor), then build what you can afford.',
      'Roll a 7 and the robber moves. Hands over 7 cards give half back, and you steal a card.',
      'First to ten points wins: settlements 1, cities 2, Longest Road and Largest Army 2 each, plus hidden cards.',
    ],
    credit:
      'Based on CATAN by Klaus Teuber. CATAN is a trademark of CATAN GmbH; this is a fan version for friends, with our own art.',
    pictures: [
      {
        src: '/games/catan/game-phone.png',
        alt: 'Catan on a phone: the island, everyone’s cards and points, your hand and the Build, Trade, Cards and End buttons.',
      },
      {
        src: '/games/catan/desktop.png',
        alt: 'Catan on a laptop: the island large, with whose turn it is, the dice, your hand and the buttons beside it.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    expansion: {
      'Base game': 'The classic game.',
      Seafarers:
        'A sea map with small islands and gold fields. Ships sail out from your coast, the pirate roams the sea, and your first settlement on each new island is worth 2 more. Played to 4 more points.',
      'Cities & Knights':
        'Cities make commodities for three tracks of improvements and metropolises; knights hold off the barbarian ship, and progress cards replace development cards. Played to 3 more points.',
      'Seafarers + Cities & Knights':
        'Both at once: the sea map with ships and the pirate, plus knights, barbarians and improvements. Played to 7 more points.',
    },
    board: {
      Balanced:
        'Tiles and harbors shuffled, numbers laid around the island as in the rulebook, no 6 and 8 side by side.',
      Random: 'Everything shuffled, numbers too. A 6 and an 8 still never touch.',
      Beginner:
        'The rulebook’s starting island, the same every time. With five or six players you get a balanced one.',
    },
    points: {
      '10': 'The standard game.',
      '8': 'A shorter night.',
      '12': 'A longer game with more building.',
    },
    robber: {
      Standard: 'The robber can go anywhere.',
      Friendly: 'The robber leaves alone anyone on 2 points or fewer.',
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
  TvLobby: CatanTvLobby,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
