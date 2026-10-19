'use client';

import type { GameUi } from '@jackdaw/ui';
import { AvalonLobby } from './lobby';
import { PlayerScreen, TvScreen } from './screens';
import { AvalonTvLobby } from './tv-lobby';

/** Avalon, linked: catalog art, detail page, its own lobby, and the hand-off screens. */
export const avalonUi: GameUi = {
  fullTv: true,
  // Parchment wherever you are, unless you switch Avalon to Night in its lobby.
  look: 'light',
  art: { band: 'azure', field: 'wavy', glyph: 'avalon' },
  about: {
    description:
      "You're all knights of the Round Table, except a few of you secretly work for Mordred. Each quest needs a team, and the traitors want on it so they can sink it. Good needs three successful quests, and even then the Assassin gets one guess at who Merlin is to steal the win.",
    steps: [
      'The leader picks a team for the quest.',
      'Everyone votes on the team at the same time.',
      'If it passes, the team secretly plays Success or Fail.',
      'A single Fail sinks the quest (quest 4 needs two Fails with 7 or more players).',
    ],
    credit:
      'Based on The Resistance: Avalon by Don Eskridge. The game runs in the Avalon app; Jackdaw seats everyone and keeps score.',
    pictures: [
      {
        src: '/games/avalon/lobby-phone.jpg',
        alt: 'Avalon lobby on a phone: the round table with everyone’s shield.',
      },
      {
        src: '/games/avalon/game-phone.jpg',
        alt: 'Avalon on a phone during the first quest, while the leader picks a team.',
      },
      {
        src: '/games/avalon/desktop.jpg',
        alt: 'Avalon on a laptop: the round table, the quest track and whose turn it is.',
        desktop: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
  Lobby: AvalonLobby,
  TvLobby: AvalonTvLobby,
};
