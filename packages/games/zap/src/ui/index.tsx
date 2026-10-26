'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Zap: a printed puzzle book of one-line routes. It uses Jackdaw's lobby. */
export const zapUi: GameUi = {
  art: { band: 'tenne', field: 'checky', glyph: 'bolt' },
  about: {
    description:
      'A square board with a few numbered squares and some walls. Draw one line from 1 that passes through every square exactly once, through the numbers in order, and ends on the last. Every puzzle is made fresh for the game and has exactly one answer. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board, from 5×5 to 8×8, and how many puzzles, from 1 to 20.',
      'Press on 1 and drag to draw. The line moves up, down, left or right, never through a wall, and never crosses itself.',
      'Drag back along the line to take steps back, or tap a square on it to cut back to there. Undo and Clear are under the board.',
      'Numbers passed out of order turn red. A finished line counts by itself and the next puzzle opens. Everyone gets the same puzzles in the same order.',
      'Most puzzles solved wins, and the quickest to get there breaks a tie. Once someone has solved them all, everyone else has two minutes.',
    ],
    credit:
      'After Zip, the daily puzzle on LinkedIn, itself a cousin of the Hamiltonian path puzzles. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/zap/game-phone.png',
        alt: 'Zap on a phone: a 6×6 board with ten numbered squares and a few walls, an orange line drawn from 1 through 5 and on, Undo and Clear, and the race between Wren, Rook and a bot.',
      },
      {
        src: '/games/zap/desktop.png',
        alt: 'Zap on a laptop: the board on the left with the line part drawn, the race beside it, and table talk on the right.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    board: {
      '5×5': 'A warm-up: under a minute each.',
      '6×6': 'The usual daily size.',
      '7×7': 'A few more turns to find.',
      '8×8': 'The largest. Long winding lines.',
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
