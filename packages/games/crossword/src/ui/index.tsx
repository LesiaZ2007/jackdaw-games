'use client';
import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen, TvScreen, Reveal, TvReveal } from './screen';
export const crosswordUi: GameUi = {
  art: { band: 'azure', field: 'checky', glyph: 'crossword' },
  about: {
    description:
      'Choose a 5 × 5, 9 × 9 or 13 × 13 crossword. Solve one shared grid together, or race on separate copies of the same puzzle. Fresh interlocking grids are generated from hundreds of original clues; the three original minis are also available.',
    steps: [
      'Choose the size and Cooperative or Race. Random generates a fresh interlocking crossword; named minis use a fixed 5 × 5 grid.',
      'Tap a white square to type with your normal phone keyboard. Tap the clue bar to switch across and down. Physical keyboards support arrows, Backspace and Tab. Scroll larger grids to see every square.',
      'In Cooperative, everyone writes into the same grid. Checks mark errors with ×; revealed letters are underlined. Assistance is optional.',
      'In Race, everyone gets the same puzzle on a private grid. Progress counts are public, but opponents’ letters stay hidden. Checks and reveals are disabled. The first completely correct grid wins.',
      'Rejoining restores your saved grid. Choose Play again for a fresh generated puzzle.',
    ],
    pictures: [
      {
        src: '/games/crossword/phone.png',
        alt: 'Wren and Rook solving a shared crossword on a phone, with the grid, active clue and native letter inputs.',
      },
      {
        src: '/games/crossword/desktop.png',
        alt: 'The shared crossword on a laptop, with across and down clues beside the grid.',
        desktop: true,
      },
    ],
    credit:
      'Original grids and clues created for Jackdaw Games. Cooperative play inspired by The Washington Post’s Play Together crossword experience (washingtonpost.com/games/) and Amuse Labs’ PuzzleMe (amuselabs.com). This is an independent implementation; no publisher puzzles, code, branding or artwork are used.',
  },
  optionHelp: {
    size: {
      mini: '5 × 5 · a short solve.',
      standard: '9 × 9 · more words and crossings.',
      large: '13 × 13 · a longer solve. Scroll the grid on phones.',
    },
    mode: {
      cooperative: 'One shared grid. Everyone wins together.',
      race: 'Identical puzzles, separate private grids. First correct finish wins; no assistance.',
    },
    puzzle: {
      random: 'A fresh generated crossword from hundreds of original clues.',
      ink: 'A little ink · fixed 5 × 5 mini.',
      camp: 'Small adventures · fixed 5 × 5 mini.',
      post: 'Drop us a line · fixed 5 × 5 mini.',
    },
    help: 'Allow checks and letter reveals in Cooperative. Race always turns help off.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
