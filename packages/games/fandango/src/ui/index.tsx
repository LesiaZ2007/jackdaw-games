'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Fandango: a printed puzzle book of sun and moon grids. It uses Jackdaw's lobby. */
export const fandangoUi: GameUi = {
  art: { band: 'azure', field: 'semee', glyph: 'sunmoon' },
  about: {
    description:
      'Fill a square board with suns and moons. Every row and column holds the same number of each, and never three of a kind side by side. An = between two squares means they match, and an × means they differ. Each puzzle has exactly one answer and needs no guessing. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board size, from 4×4 to 10×10, and 1 to 20 puzzles.',
      'Tap a square for a sun, again for a moon, and once more to clear it. Marks that break a rule turn red.',
      'A finished board counts on its own and the next puzzle opens. Everyone gets the same puzzles in the same order.',
      'Playing alone, ask for a hint or a mistake check. Both are counted, and neither is allowed in a race.',
      'Most puzzles solved wins, and speed breaks ties. Once someone finishes, everyone else has two minutes.',
    ],
    credit:
      'After Tango, the daily puzzle on LinkedIn, itself a cousin of the binary puzzles known as Takuzu. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/fandango/game-phone.png',
        alt: 'Fandango on a phone: the racers’ tokens crossing a sky from sun to moon, a 6×6 board part filled with woodcut suns and moons, = and × signs between some squares, Undo and Clear, and the race list.',
      },
      {
        src: '/games/fandango/desktop.png',
        alt: 'Fandango on a laptop: the board on the left part filled, the sky track and the race beside it, and table talk on the right.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    board: {
      '4×4': 'A warm-up: a few seconds each.',
      '6×6': 'The usual daily size.',
      '8×8': 'A good deal more to work out.',
      '10×10': 'The largest. Long rows to balance.',
    },
    puzzles: 'How many puzzles in a row. Everyone gets the same ones, in the same order.',
    hints: {
      true: 'Playing alone, Hint explains the next step and Show a mistake points one out. Never in a race.',
      false: 'No hints, even when you play alone.',
    },
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
