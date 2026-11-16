/**
 * One card in Fictionary's bank: a true fact (or a real word) with one blank. Players write a lie
 * for the blank, then everyone tries to pick the truth out of the lies.
 *
 * The bank is server only: the rules deal cards, and screens only ever see the card in play, so
 * nobody can look the answer up in the page.
 */
export interface Fact {
  /** The fact with exactly one blank, written as four underscores: "A group of owls is called a ____." */
  q: string;
  /** The true answer, as it reads in the blank: "parliament". */
  a: string;
  /** Other ways of writing the truth that also count (a typed lie matching one is refused). */
  alt?: string[];
  /** Four believable wrong answers, worded like the truth: house lies and "Help me lie". */
  lies: [string, string, string, string];
  /** One short line shown with the truth on the reveal: the story behind it. */
  note: string;
  /** Where it can be checked: a Wikipedia article title. */
  src: string;
}

/** The kinds of card, each one a tab in the dictionary. */
export const CATEGORIES = {
  animals: 'Animals',
  nature: 'Nature',
  food: 'Food and drink',
  body: 'The human body',
  history: 'History',
  people: 'Famous lives',
  science: 'Science',
  space: 'Space',
  inventions: 'Inventions',
  places: 'Places',
  customs: 'Laws and customs',
  names: 'Names and origins',
  sports: 'Sports and games',
  culture: 'Arts and culture',
  records: 'Records and oddities',
  words: 'The dictionary',
} as const;

export type Category = keyof typeof CATEGORIES;
