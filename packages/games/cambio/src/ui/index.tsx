'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats } from './lobby';
import { PlayerScreen } from './player';
import { Reveal, TvReveal } from './reveal';
import { TvScreen } from './tv';
import { WatchScreen } from './watch';

/** Cambio: catalog art, detail page and screens. It sits round a purpure felt in the back room. */
export const cambioUi: GameUi = {
  art: { band: 'azure', field: 'wavy', glyph: 'peek' },
  about: {
    description:
      'The memory and swap card game. Everyone has four cards face down and knows only two of them. Draw, swap and spy to bring your total down, and call Cambio when you think yours is the lowest. Everyone else gets one last turn, and call it too soon and it costs you.',
    steps: [
      'Everyone gets four cards face down in a square and peeks at the two nearest them once, then play begins.',
      'On your turn draw from the stock, take the top discard into your grid, or call Cambio.',
      'A drawn card can replace one of yours or be discarded, and a discarded 7 or 8 lets you peek at your own, a 9 or 10 spy on another player, a Jack or Queen swap blind, and a black King look at two and maybe swap.',
      'After Cambio is called everyone else plays one last turn, then every hand is turned face up and counted: Ace 1, Jack 11, Queen 12, black King 13 and red King 0.',
      'The caller scores 0 with the lowest hand and their total plus 10 if not, everyone else scores their total, and the lowest score wins.',
    ],
    credit:
      'Cambio is a traditional card game, also played as Cactus or Pablo, with many house rules. Played here with a standard deck (two from six players), and cards and table drawn for Jackdaw.',
    pictures: [],
  },
  optionHelp: {
    goal: {
      'First to 100': 'Rounds until someone reaches 100 points, and the lowest score wins.',
      'First to 50': 'A shorter game: rounds until someone reaches 50, and the lowest score wins.',
      '3 rounds': 'Three rounds, and the lowest total wins.',
      '5 rounds': 'Five rounds, and the lowest total wins.',
    },
    turnTimer: 'Out of time, you draw and discard, and play moves on.',
    memory: {
      'Remember it yourself':
        'The real game: cards show face down, and a card you learn turns up for a few seconds and back.',
      'Keep notes':
        'The cards you know carry a small note on their backs, yours and other players’, so you can’t forget.',
    },
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
