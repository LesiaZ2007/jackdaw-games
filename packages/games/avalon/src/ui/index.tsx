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
      'Good knights of the Round Table set out on quests, while a few secret traitors working for Mordred try to sink them. Each quest needs a team, and the traitors want a seat on it. Good wins with three successful quests, and even then the Assassin gets one guess at who Merlin is to steal the win.',
    steps: [
      'The leader picks a team for the quest.',
      'Everyone votes on the team at the same time.',
      'If it passes, the team secretly plays Success or Fail.',
      'One Fail sinks the quest (two on quest 4 with 7 or more players).',
      'Three failed quests win it for the traitors. Three successes win it for Good, unless the Assassin finds Merlin.',
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
