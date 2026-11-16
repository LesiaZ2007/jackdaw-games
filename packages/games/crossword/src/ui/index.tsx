'use client';
import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen, TvScreen, Reveal, TvReveal } from './screen';
export const crosswordUi: GameUi = {
  art: { band: 'azure', field: 'checky', glyph: 'crossword' },
  about: {
    description:
      'A small crossword for the whole table. Everyone writes into the same grid at once, with a shared clock and teammates’ selected clues beside their names. Three original 5 × 5 minis make a short, friendly solve. Play alone or invite up to fourteen friends through your Jackdaw lobby.',
    steps: [
      'Choose a mini, or let Jackdaw pick one. Everyone shares one grid; there are no turns.',
      'Choose a square or a clue. Tap a selected square again to switch across and down. Use the letter buttons or a physical keyboard.',
      'Letters appear for everyone. Teammates’ selected clues stay visible for thirty seconds after their last move. Use Table talk to compare ideas.',
      'If help is on, check a word or the grid to mark incorrect letters with ×. Reveal letter asks for a second tap and underlines the answer.',
      'Fill every square correctly to finish together. The shared time, checks and revealed letters appear in the result. Rejoining keeps the saved grid.',
    ],
    pictures: [
      {
        src: '/games/crossword/phone.png',
        alt: 'Wren and Rook solving a shared crossword on a phone, with the grid, active clue and letter keyboard.',
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
    puzzle: {
      random: 'One of three original minis, chosen at random.',
      ink: 'A little ink · 5 × 5 · 10 clues.',
      camp: 'Small adventures · 5 × 5 · 10 clues.',
      post: 'Drop us a line · 5 × 5 · 10 clues.',
    },
    help: 'Allow checks and individual letter reveals. Every use is shown in the shared result.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
