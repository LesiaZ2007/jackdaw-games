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
      'Each of you hides a fleet on a chart the other can’t see. Then you take turns calling squares. Hits and misses are marked, and a ship is named only once it goes down. Sink the whole fleet first to win.',
    steps: [
      'Place your carrier, battleship, cruiser, submarine and destroyer, with water between the ships.',
      'Once both fleets are placed, one of you is picked to fire first.',
      'Call a square. A hit lets you fire again, and a miss ends your turn.',
      'A ship shows on the chart only once it sinks. Until then, the squares you haven’t fired at stay blank.',
      'Sink the last enemy ship to win. With Salvo on, you fire once for each ship you still have afloat.',
    ],
    credit:
      'Battleship is a trademark of Hasbro. The game was published by Milton Bradley. Played here by the classic rules, with a Salvo option from the same family.',
    pictures: [
      {
        src: '/games/battleship/game-phone.png',
        alt: 'Battleship on a phone: Wren’s fleet on a pale printed sea, each ship its own silhouette, carrier, battleship, cruiser, submarine and destroyer in heraldic colors.',
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
