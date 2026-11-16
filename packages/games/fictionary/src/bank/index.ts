import type { Category, Fact } from './types';
import { facts as animals } from './animals';
import { facts as nature } from './nature';
import { facts as food } from './food';
import { facts as body } from './body';
import { facts as history } from './history';
import { facts as people } from './people';
import { facts as science } from './science';
import { facts as space } from './space';
import { facts as inventions } from './inventions';
import { facts as places } from './places';
import { facts as customs } from './customs';
import { facts as names } from './names';
import { facts as sports } from './sports';
import { facts as culture } from './culture';
import { facts as records } from './records';
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
  history,
  people,
  science,
  space,
  inventions,
  places,
  customs,
  names,
  sports,
  culture,
  records,
  words,
};
