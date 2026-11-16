import type { Category, Fact } from './types';
import { facts as animals } from './animals';
import { facts as nature } from './nature';
import { facts as food } from './food';
import { facts as body } from './body';
import { facts as words } from './words';

/**
 * Every card, by tab. Server only: the rules import this; screens never do (a bank in the page
 * would hand everyone the answers).
 */
export const BANK: Record<Category, Fact[]> = {
  animals,
  nature,
  food,
  body,
  history: [],
  people: [],
  science: [],
  space: [],
  inventions: [],
  places: [],
  customs: [],
  names: [],
  sports: [],
  culture: [],
  records: [],
  words,
};
