'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen, WatchScreen } from './tv';

/** Backgammon: the tables, a folding walnut case with ivory and ebony. It uses Jackdaw's lobby. */
export const backgammonUi: GameUi = {
  art: { band: 'gules', field: 'paly', glyph: 'tables' },
  about: {
    description:
      'Two players, fifteen checkers each, racing in opposite directions around the board. Every roll is a choice: run for home, build a wall of points the other side can’t pass, or hit a lone checker and send it back to the start. Play a single game or a match, with the doubling cube to raise the stakes.',
    steps: [
      'Each of you rolls one die. The higher roll moves first, using both numbers.',
      'Move by each die. Two or more enemy checkers close a point, and a lone one is hit and sent to the bar.',
      'A checker on the bar must re-enter before you move anything else. Doubles are played four times.',
      'Before you roll, you may double. Your opponent takes it, or drops and loses the game.',
      'Bear off all fifteen checkers first to win. Win before they bear off any and it counts double.',
    ],
    credit:
      'Backgammon is a traditional game, played in Europe since the Middle Ages as tables. Played here by the usual modern rules: the doubling cube, gammons and backgammons, and the Crawford rule in matches.',
    pictures: [
      {
        src: '/games/backgammon/game-phone.png',
        alt: 'Backgammon on a phone: the walnut tables with red and blue points, ivory and ebony checkers, both name plates with their pip counts, and Double and Roll below.',
      },
      {
        src: '/games/backgammon/desktop.png',
        alt: 'Backgammon on a laptop: the board beside both name plates and the last moves, with Double and Roll under it and table talk on the right.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    matchTo: {
      '1 point': 'One game decides it. The cube still raises the stakes of that game.',
      '3 points': 'Games are played until someone has three points. A gammon counts two.',
      '5 points': 'Games are played until someone has five points. A gammon counts two.',
      '7 points': 'A long match, to seven points.',
    },
    cube: {
      On: 'Before rolling you may double the stakes. The other player takes or drops.',
      Off: 'Every game is worth one, two for a gammon, three for a backgammon.',
    },
    turnTimer: 'Out of time, the table rolls or moves for you, and takes a cube offered to you.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
