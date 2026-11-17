/** Clue vocabulary, not a solved grid or another player's state. Server only. */
import { WORD_BANK } from './bank';
import { CHALLENGE_WORDS, HARD_CLUES } from './challenge';
const extras = `
POT|A home for a houseplant
ERAS|Long spans of history
TEXTS|Messages sent from a phone
SEAL|A flippered animal that basks on rocks
DRY|Ready to fold, after a tumble in the machine
PET|A companion animal
ORES|Sources of mined metal
TAXED|Charged a levy on
STAR|The sun, for one
SLY|Cunning; not easily outfoxed
TINED|Having prongs, like a fork
STAR|A point of light in the night sky
SLY|Like a fox in a fable
IRIS|The coloured part of your eye
PEA|Small green vegetable in a pod
`
  .trim()
  .split('\n')
  .map((line) => {
    const [answer, ...clue] = line.split('|');
    return { answer: answer!, clue: clue.join('|') };
  });
export const CLUE_KNOWLEDGE = [
  ...WORD_BANK,
  ...CHALLENGE_WORDS,
  ...extras,
  ...Object.entries(HARD_CLUES).map(([answer, clue]) => ({ answer, clue })),
];
