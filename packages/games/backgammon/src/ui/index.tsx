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
      'Two of you, fifteen checkers each, running opposite ways round the tables. Every roll is a choice: race for home, build a wall of points the other cannot pass, or hit a checker standing alone and send it back to start again. Play a single game or a match, with the doubling cube to raise the stakes.',
    steps: [
      'Each of you rolls one die. The higher moves first, playing both numbers.',
      'Move one checker by each die, or one checker by both. A point with two or more of the other colour is closed to you. Land on a single one and it is hit: it goes to the bar.',
      'A checker on the bar must come back in, through the other side’s home board, before you move anything else. Doubles are played four times.',
      'Once all fifteen are in your home board, bear them off. First to bear off all fifteen wins the game.',
      'Before you roll you may double. The other player takes, and the game is worth twice as much, or drops and loses it as it stands. Win before they bear off any and it is a gammon, worth double.',
    ],
    credit:
      'Backgammon is a traditional game, played in Europe since the Middle Ages as tables. Played here by the usual modern rules: the doubling cube, gammons and backgammons, and the Crawford rule in matches.',
    pictures: [
      {
        src: '/games/backgammon/game-phone.png',
        alt: 'Backgammon on a phone: the walnut tables with red and blue points, ivory and ebony checkers, two bone dice just played, and Undo and Done below.',
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
