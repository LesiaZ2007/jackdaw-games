'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';

/** Battleship: a printed naval chart. It uses Jackdaw's lobby. */
export const battleshipUi: GameUi = {
  art: { band: 'azure', field: 'fretty', glyph: 'ship' },
  about: {
    description:
      'Each of you hides a fleet on a chart the other cannot see. Then you take turns calling a square. A hit is marked, a miss is marked, and a ship is named only once it has gone down. First to sink the fleet wins.',
    steps: [
      'Lay the carrier, battleship, cruiser, submarine and destroyer. Horizontal or vertical, and ships may touch.',
      'When both fleets are placed, one of you is drawn to fire first.',
      'Call one square. A miss is an ink cross, a hit is a red peg, and the turn passes either way.',
      'Sink a ship and it is drawn on the chart. Until then, the squares you have not fired at stay blank.',
      'Salvo, if you turn it on, lets you fire once for each ship you still have afloat.',
    ],
    credit:
      'Battleship is a trademark of Hasbro. The game was published by Milton Bradley. Played here by the classic rules, with a Salvo option from the same family.',
    pictures: [
      {
        src: '/games/battleship/game-phone.png',
        alt: 'Battleship on a phone: Wren’s fleet laid on a cream chart ruled in ink, with the carrier, battleship, cruiser, submarine and destroyer as coloured counters.',
      },
      {
        src: '/games/battleship/tv.png',
        alt: 'Battleship on a TV: both seas side by side, a large Hit stamp over the square just fired at, and a sunk ship drawn on the chart.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    firing: {
      'One shot': 'You fire one square, then your opponent does, hit or miss. The classic game.',
      Salvo: 'You fire once for each ship you still have afloat, all in one turn.',
    },
    turnTimer:
      'Out of time, a shot is fired for you. While the fleets are still being placed, yours is laid out for you.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  Reveal,
};
