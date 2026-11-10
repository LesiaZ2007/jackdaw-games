'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Zap: a printed puzzle book of one-line routes. It uses Jackdaw's lobby. */
export const zapUi: GameUi = {
  art: { band: 'tenne', field: 'bendy', glyph: 'bolt' },
  about: {
    description:
      'A square board with a few numbered squares and some walls. Draw one line from 1 that passes through every square exactly once, hits the numbers in order and ends on the last. Each puzzle has exactly one answer. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board size, from 5×5 to 8×8, and 1 to 20 puzzles.',
      'Press on 1 and drag to draw. The line goes up, down, left or right, never through a wall or itself.',
      'Drag back along the line to undo, or tap a square on it to cut back. Undo and Clear sit under the board.',
      'Playing alone, ask for a hint or a mistake check. Both are counted, and neither is allowed in a race.',
      'Most puzzles solved wins, and speed breaks ties. Once someone finishes, everyone else has two minutes.',
    ],
    credit:
      'After Zip, the daily puzzle on LinkedIn, itself a cousin of the Hamiltonian path puzzles. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/zap/game-phone.png',
        alt: 'Zap on a phone: each racer’s line of ink across the top, a puzzle-book page with numbered squares and a few walls, the next number ringed in gold, and Undo and Clear.',
      },
      {
        src: '/games/zap/desktop.png',
        alt: 'Zap on a laptop: the page on the left, each racer’s line of ink and the tools beside it, and table talk on the right.',
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
