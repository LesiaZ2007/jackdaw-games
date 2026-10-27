'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Kings: a printed puzzle book of coloured boards. It uses Jackdaw's lobby. */
export const kingsUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'crown' },
  about: {
    description:
      'A square board split into coloured regions. Place one king in every row, every column and every colour, and no two kings may touch, not even at a corner. Every puzzle is made fresh for the game and has exactly one answer. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board, from 5×5 to 10×10, and how many puzzles, from 1 to 20.',
      'Tap a square once to cross it out, twice for a king, and a third time to clear it. Drag across empty squares to cross out a row of them.',
      'Kings that break a rule turn red. Auto-cross, if you turn it on, crosses out every square your kings rule out.',
      'A finished board counts by itself and the next puzzle opens. Everyone gets the same puzzles in the same order.',
      'Playing alone, you can ask for a hint: it explains the next deduction and shows you where. Show a mistake points out the first thing that’s wrong. Hints are counted in the results, and are never there in a race.',
      'Most puzzles solved wins, and the quickest to get there breaks a tie. Once someone has solved them all, everyone else has two minutes.',
    ],
    credit:
      'After Queens, the daily puzzle on LinkedIn, itself a cousin of the Star Battle puzzles. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/kings/game-phone.png',
        alt: 'Kings on a phone: an 8×8 board in printed colours with four kings placed and two squares crossed out, Undo, Clear and Auto-cross, and the race between Wren, Rook and a bot.',
      },
      {
        src: '/games/kings/desktop.png',
        alt: 'Kings on a laptop: the board on the left with three kings placed, the race beside it, and table talk on the right.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    board: {
      '5×5': 'A warm-up: a minute or so each.',
      '6×6': 'Quick boards, good for a long race.',
      '7×7': 'About the size of an easy daily puzzle.',
      '8×8': 'The usual daily size.',
      '9×9': 'Bigger boards take a few minutes.',
      '10×10': 'The largest. Slow and satisfying.',
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
