import type { Puzzle } from './grid';
/** Original Jackdaw constructions and clues. Server only. */
export const PUZZLES: Puzzle[] = [
  {
    id: 'ink',
    title: 'A little ink',
    author: 'Jackdaw Games',
    rows: ['PEN##', 'ERAS#', 'ARIAS', '#SLIP', '##SLY'],
    across: [
      'A ballpoint, for one',
      'Chapters of history',
      'Opera solos',
      'Lose your footing',
      'Clever in a sneaky way',
    ],
    down: [
      'Small green vegetable in a pod',
      'Makes mistakes',
      'Things a hammer drives',
      'Catch the wind on a boat',
      'An undercover agent',
    ],
  },
  {
    id: 'camp',
    title: 'Small adventures',
    author: 'Jackdaw Games',
    rows: ['PIT##', 'ORES#', 'TINED', '#STAR', '##SLY'],
    across: [
      'The stone inside a peach',
      'Rocks mined for metals',
      'Having prongs, like a fork',
      'A point of light in the night sky',
      'Like a fox in a fable',
    ],
    down: [
      'A vessel for simmering soup',
      'The coloured part of your eye',
      'Portable shelters at a campsite',
      'A wax impression on a letter',
      'The opposite of wet',
    ],
  },
  {
    id: 'post',
    title: 'Drop us a line',
    author: 'Jackdaw Games',
    rows: ['POT##', 'ERAS#', 'TEXTS', '#SEAL', '##DRY'],
    across: [
      'A home for a houseplant',
      'Long spans of history',
      'Messages sent from a phone',
      'A flippered animal that basks on rocks',
      'Ready to fold, after a tumble in the machine',
    ],
    down: [
      'A companion animal',
      'Sources of mined metal',
      'Charged a levy on',
      'The sun, for one',
      'Cunning; not easily outfoxed',
    ],
  },
];

export { generatePuzzle, withDifficulty } from './generator';
