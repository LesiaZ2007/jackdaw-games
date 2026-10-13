'use client';

import type { GameUi } from '@jackdaw/ui';
import { AvalonLobby } from './lobby';
import { PlayerScreen, TvScreen } from './screens';

/** Avalon, linked: catalog art, detail page, its own lobby, and the hand-off screens. */
export const avalonUi: GameUi = {
  art: { band: 'azure', field: 'wavy', glyph: 'avalon' },
  about: {
    description:
      "Arthur's knights go on five quests, but a few of them secretly serve Mordred. Leaders pick teams, everyone votes, and each team plays Success or Fail in secret. Good wins three quests, unless the Assassin can name Merlin at the end.",
    steps: [
      'The leader proposes a team for the quest.',
      'Everyone votes to approve or reject it, all at once.',
      'An approved team secretly plays Success or Fail.',
      'One Fail sinks the quest (two on quest 4 with 7 or more players).',
    ],
    credit:
      'Based on The Resistance: Avalon by Don Eskridge. Played in the Avalon app; Jackdaw seats the table and keeps the score.',
    pictures: [
      {
        src: '/games/avalon/lobby-phone.png',
        alt: 'Avalon lobby on a phone: the round table with six shields.',
      },
      {
        src: '/games/avalon/game-phone.png',
        alt: 'Avalon on a phone during Quest 1: the leader is choosing two knights.',
      },
      {
        src: '/games/avalon/tv.png',
        alt: 'Avalon on a TV: the round table and quest track, with whose turn it is.',
        wide: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
  Lobby: AvalonLobby,
};
