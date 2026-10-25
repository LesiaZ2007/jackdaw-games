'use client';

import type { GameUi } from '@jackdaw/ui';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';

/** Monopoly: a printed board of a market town. It uses Jackdaw's lobby. */
export const monopolyUi: GameUi = {
  art: { band: 'vert', field: 'fretty', glyph: 'house' },
  about: {
    description:
      'Go round the town buying streets, coaching inns and guilds. Own a whole colour group and you can build houses and hotels, and the rent climbs fast. Trade to finish your sets, mortgage when money runs short, and keep going until everyone else is bankrupt.',
    steps: [
      'Roll the dice and move. Pass GO and collect $200.',
      'Land on a deed nobody owns and buy it, or let it go to auction, where anyone can bid.',
      'Land on someone else’s deed and pay rent. A full colour group doubles it, and houses raise it far more.',
      'Own a whole group and build on it evenly, one house at a time, up to a hotel.',
      'Trade deeds, cash and Jail cards at any time from the Trade sheet. Mortgage deeds when you need money.',
      'Can’t pay? Sell buildings and mortgage until you can, or go bankrupt. The last one standing wins, or the richest when the rounds run out.',
    ],
    credit:
      'Monopoly is a trademark of Hasbro. Played here by the classic rules, on a board of our own: the streets, inns and guilds of a market town.',
    pictures: [
      {
        src: '/games/monopoly/game-phone.png',
        alt: 'Monopoly on a phone: the printed board with its colour bands and tokens, the dice in the pale green centre, everyone’s cash below and the End turn plaque.',
      },
      {
        src: '/games/monopoly/tv.png',
        alt: 'Monopoly on a TV: the whole board with every street named, a Chance card drawn in the middle, and each player’s cash and the story so far beside it.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    ends: {
      'Last one standing':
        'Play until everyone but one is bankrupt. The classic game, and a long one.',
      'After 30 rounds': 'When every player has had 30 turns, the richest wins.',
      'After 20 rounds': 'When every player has had 20 turns, the richest wins.',
    },
    unbought: {
      'Goes to auction':
        'A deed the player declines goes to auction for everyone. The printed rule.',
      'Stays with the bank': 'A declined deed stays unsold until someone else lands on it.',
    },
    parking: {
      Nothing: 'Free Parking is just a rest. The printed rule.',
      'Collects the taxes': 'Taxes and fines go in a pot that whoever lands on Free Parking takes.',
    },
    turnTimer:
      'Out of time, the table moves for you: it rolls, lets a deed go, ends your turn, or raises what you owe.',
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  Reveal,
};
