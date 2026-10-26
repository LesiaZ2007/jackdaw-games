'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Wavelength: catalog art, detail page and screens. It uses Jackdaw's lobby. */
export const wavelengthUi: GameUi = {
  art: { band: 'purpure', field: 'bendy', glyph: 'dial' },
  about: {
    description:
      'One of you can see where the target sits on a dial between two opposites, like Cold and Hot. You give a clue that lands right there, and your team turns the dial to where they think you mean. The closer it lands, the more you score, and the arguing over the needle is half the fun.',
    steps: [
      'The psychic sees a hidden target on the dial and picks one of two cards, like Underrated to Overrated.',
      'They give a clue that sits at the target: “Pineapple on pizza”, maybe.',
      'Their team drags the dial to where they think the clue points and locks it in.',
      'Teams: the other team calls whether the target is left or right of the needle, for a point.',
      'The shutter opens: 4 for the bullseye, 3 or 2 for near it.',
      'Teams take turns and the first to the goal wins. Together, everyone plays as one team for a set number of rounds.',
    ],
    credit:
      'Wavelength is by Alex Hague, Justin Vickers and Wolfgang Warsch. Played here by its rules, with Jackdaw’s own spectrum cards.',
    pictures: [
      {
        src: '/games/wavelength/game-phone.png',
        alt: 'Wavelength on a phone: the clue at the top, the dial with its shutter open on the banded target zone, the needle where the team left it, and the points stamped below.',
      },
      {
        src: '/games/wavelength/tv.png',
        alt: 'Wavelength on a TV: the clue across the top, the big dial revealing the target zone with the points stamped across it, and the Sun and Moon teams down either side.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    mode: {
      Teams: 'Two teams take turns, and the other team can steal a point. Needs 4 or more.',
      Together: 'Everyone on one team, playing for the best score.',
    },
    teams: {
      Random: 'Teams are dealt at random when the game starts.',
      Chosen: 'The host puts everyone on Sun or Moon above. They stay for Play again.',
    },
    guessing: {
      'Shared dial': 'One dial anyone on the team can drag. It locks when most of the team agrees.',
      'Everyone guesses':
        'Everyone sets their own dial in secret. The team’s guess is the average.',
    },
    length: {
      Short: 'Teams play to 7. Together plays 5 rounds.',
      Standard: 'Teams play to 10. Together plays 7 rounds.',
      Long: 'Teams play to 15. Together plays 10 rounds.',
    },
    timer: 'When time runs out, the dial locks where it is.',
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
};
