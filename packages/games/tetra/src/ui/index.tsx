'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';

/** Tetra: falling stones cut in heraldic tinctures. It uses Jackdaw's lobby. */
export const tetraUi: GameUi = {
  art: { band: 'azure', field: 'checky', glyph: 'stones' },
  about: {
    description:
      'Stones of four squares fall into your well. Turn them, slide them, and fill whole rows to clear them. Play alone against the clock, or against bots and friends: every clear throws rubble into someone else’s well, and the last one standing takes the round.',
    steps: [
      'Slide and turn the falling stone, then drop it. A full row clears.',
      'Hold one stone back for later, and watch the next five coming.',
      'In Versus, clearing two or more rows throws rubble at someone else. Four rows at once, a T turned into its slot, clears back to back and chains of clears all throw more.',
      'Rubble you’re owed shows as a red bar beside your well. Clear lines before it lands to cancel it; otherwise it rises from the floor after your next stone.',
      'Stones pile over the top and you’re out. Last one standing wins the round; first to the set number of rounds wins the match.',
      'Sprint: clear forty lines as fast as you can. Blitz: score all you can in two minutes.',
    ],
    credit:
      'Tetra is a falling-block game in the tradition of the stacking puzzles of the 1980s, played by the modern rules: turning with wall kicks, shuffled sets of seven, hold, and rubble thrown between players.',
    pictures: [
      {
        src: '/games/tetra/game-phone.png',
        alt: 'Tetra on a phone: the well with stones in red, blue, green, gold and purple, the hold and the next five beside it, a rival’s well above, and the pad below.',
      },
      {
        src: '/games/tetra/desktop.png',
        alt: 'Tetra on the TV: two wells side by side in a Sprint, with names, lines cleared and the clock.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    mode: {
      Versus: 'Everyone plays at once and throws rubble. Needs two or more (bots count).',
      Sprint: 'Forty lines, fastest wins. Good alone.',
      Blitz: 'Two minutes, best score wins. Good alone.',
    },
    firstTo: 'Versus only: round wins needed to take the match.',
    targeting: {
      Even: 'Rubble goes to whoever has had the least so far.',
      Random: 'Rubble goes to anyone still standing.',
      Payback: 'Rubble goes back to whoever last threw at you.',
    },
    pace: 'Versus only: how fast stones fall at first, and how quickly they speed up.',
  },
  fit: true,
  livePollMs: 800,
  PlayerScreen,
  TvScreen,
  Reveal,
  TvReveal,
};
