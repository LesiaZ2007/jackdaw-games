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
      'Everyone gets four cards face down in a square and peeks at the nearest ones once, then play begins.',
      'On your turn draw from the stock, take the top discard into your grid, or call Cambio.',
      'A drawn card can replace one of yours or be discarded, and some discarded cards let you peek, spy or swap blind, or look at two and maybe swap; the host can change which.',
      'After Cambio is called everyone else plays one last turn, then every hand is turned face up and counted, with Kings and face cards worth what the table says.',
      'The caller scores nothing with the lowest hand and takes a penalty if not, everyone else scores their total, and the lowest score wins.',
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
    peekCards: 'A drawn card of these ranks, discarded, lets you look at one of your own cards.',
    spyCards:
      'A drawn card of these ranks, discarded, lets you look at one card of another player.',
    swapCards:
      'A drawn card of these ranks, discarded, swaps one of your cards with another player’s, unseen. Two powers can’t share the same cards.',
    kingPower:
      'A drawn King, discarded, lets you look at one of yours and one of theirs, then swap or not. Black Kings only, every King, or none.',
    redKings: 'What a red King counts. Black Kings are always 13.',
    callerPenalty:
      'A caller who doesn’t have the lowest hand adds this to their total. Double doubles it, and leaves a total of 0 or less alone.',
    callerBonus:
      'What a caller with the lowest hand scores: nothing, their own total (no bonus), or −5.',
    openingPeek:
      'Cards you look at when a round starts. Two: your bottom cards. One: the bottom left. None: the round starts at once.',
    exactly100:
      'In a game to 100: land on exactly 100 after a round and you drop to 50, and the game goes on.',
    jokers: 'Two jokers in each deck, worth 0, with no power.',
  },
  fit: true,
  LobbySeats,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
  TvReveal,
};
