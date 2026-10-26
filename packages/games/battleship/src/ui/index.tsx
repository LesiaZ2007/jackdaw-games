'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Battleship: a printed naval chart. It uses Jackdaw's lobby. */
export const battleshipUi: GameUi = {
  art: { band: 'azure', field: 'fretty', glyph: 'ship' },
  about: {
    description:
      'Each of you hides a fleet on a chart the other cannot see. Then you take turns calling a square. A hit is marked, a miss is marked, and a ship is named only once it has gone down. First to sink the fleet wins.',
    steps: [
      'Lay the carrier, battleship, cruiser, submarine and destroyer. Horizontal or vertical, with a water square between ships, even at the corners. On a computer, a faded copy of the ship follows the mouse.',
      'When both fleets are placed, one of you is drawn to fire first.',
      'Call one square. A hit, red on the ship, lets you fire again. A miss ends the turn. Sink the last ship and the battle ends.',
      'Sink a ship and it is drawn on the chart. Until then, the squares you have not fired at stay blank.',
      'Salvo, if you turn it on, lets you fire once for each ship you still have afloat.',
    ],
    credit:
      'Battleship is a trademark of Hasbro. The game was published by Milton Bradley. Played here by the classic rules, with a Salvo option from the same family.',
    pictures: [
      {
        src: '/games/battleship/game-phone.png',
        alt: 'Battleship on a phone: Wren’s fleet on a pale printed sea, each ship its own silhouette, carrier, battleship, cruiser, submarine and destroyer in heraldic colours.',
      },
      {
        src: '/games/battleship/tv.png',
        alt: 'Battleship on a TV: both charts on pale water, a large Sunk stamp, and the ship that went down drawn transparent and tilted on its squares.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    firing: {
      'One shot':
        'You fire one square. A hit lets you fire again. A miss ends your turn. The last ship ends the battle.',
      Salvo: 'You fire once for each ship you still have afloat, all in one turn.',
    },
    turnTimer:
      'Out of time, a shot is fired for you. While the fleets are still being placed, yours is laid out for you.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
