'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Kings: a printed puzzle book of colored boards. It uses Jackdaw's lobby. */
export const kingsUi: GameUi = {
  art: { band: 'gules', field: 'checky', glyph: 'crown' },
  about: {
    description:
      'Fill a square board of colored regions with kings. Put one in every row, every column and every color, and no two may touch, even at a corner. Each puzzle has exactly one answer. Play alone, or race the table through the same puzzles.',
    steps: [
      'The host picks the board size, from 5×5 to 10×10, and 1 to 20 puzzles.',
      'Tap a square once to cross it out, twice for a king, three times to clear it. Drag to cross out a run.',
      'Kings that break a rule turn red. With Auto-cross on, squares your kings rule out are crossed for you.',
      'Playing alone, ask for a hint or a mistake check. Both are counted, and neither is allowed in a race.',
      'Most puzzles solved wins, and speed breaks ties. Once someone finishes, everyone else has two minutes.',
    ],
    credit:
      'After Queens, the daily puzzle on LinkedIn, itself a cousin of the Star Battle puzzles. The puzzles here are Jackdaw’s own.',
    pictures: [
      {
        src: '/games/kings/game-phone.png',
        alt: 'Kings on a phone: the puzzle on a ribbon and the clock on a shield, an 8×8 board of hatched heraldic regions, Undo, Clear and Auto-cross, and each racer’s row of crowns.',
      },
      {
        src: '/games/kings/desktop.png',
        alt: 'Kings on a laptop: the board of hatched regions on the left, the tools and each racer’s crowns beside it, and table talk on the right.',
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
