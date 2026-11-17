'use client';

import type { GameUi } from '@jackdaw/ui';
import { optionHelp } from './help';
import { FictionaryLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';
import { TvReveal } from './tv-reveal';

/** Fictionary: catalog art, detail page, its own lobby (the book's title page) and screens. */
export const fictionaryUi: GameUi = {
  art: { band: 'purpure', field: 'lozengy', glyph: 'quill' },
  about: {
    description:
      'Every card is a true fact so odd it sounds made up, with one word missing, or a real word nobody has heard of. Everyone writes a lie to fill the gap, then tries to spot the truth among all the lies. Find the truth to score, and score again for every friend your lie fools.',
    steps: [
      'Someone chooses a tab of the dictionary: Animals, History, Space, the words nobody knows…',
      'The card shows a true fact with a blank. Write a lie that sounds true enough to fool the table.',
      'Stuck? Ask the house to help you lie. Type the real answer and you’re told to try again.',
      'Every lie and the truth are listed together. Pick the one you think is true, and like the lie you love.',
      'Each lie that fooled someone is stamped FIB, then the truth is stamped FACT. Round 2 doubles the points, and the Final Fib triples them.',
    ],
    credit:
      'Fictionary is the old parlor game, also called the Dictionary game, played here as bluffing trivia. Every fact, word and house lie in the book is Jackdaw’s own.',
  },
  optionHelp,
  fit: true,
  Lobby: FictionaryLobby,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
