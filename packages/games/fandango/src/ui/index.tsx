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
      'A square board to fill with suns and moons. Every row and every column holds as many suns as moons, and never three of the same next to each other. An = between two squares means they match; an × means they differ. A few squares come filled in. Every puzzle is made fresh for the game, has exactly one answer, and can be worked out without guessing. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board, from 4×4 to 10×10, and how many puzzles, from 1 to 20.',
      'Tap a square for a sun, tap again for a moon, and once more to clear it. Squares that came filled in stay put.',
      'Marks that break a rule turn red. Undo and Clear are under the board.',
      'A finished board counts by itself and the next puzzle opens. Everyone gets the same puzzles in the same order.',
      'Most puzzles solved wins, and the quickest to get there breaks a tie. Once someone has solved them all, everyone else has two minutes.',
    ],
    credit:
      'After Tango, the daily puzzle on LinkedIn, itself a cousin of the binary puzzles known as Takuzu. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/fandango/game-phone.png',
        alt: 'Fandango on a phone: a 6×6 board part filled with suns and moons, = and × signs between some squares, Undo and Clear, and the race between Heron, Wren and a bot.',
      },
      {
        src: '/games/fandango/desktop.png',
        alt: 'Fandango on a laptop: the board on the left part filled, the race beside it, and table talk on the right.',
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
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
