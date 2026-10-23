import type { GameMeta } from '@jackdaw/engine';
import type { GameAbout, GameArt } from '@jackdaw/ui';
import { games } from './registry';

/**
 * Games still being built, listed in the catalog greyed as "Coming soon". Plain data with no
 * React, so server code (page titles) can read it too.
 */
export const upcoming: { meta: GameMeta; art: GameArt; about: GameAbout }[] = [
  {
    meta: {
      id: 'werewolf',
      name: 'Werewolf',
      tagline: 'Nobody has to sit out and narrate.',
      minPlayers: 6,
      maxPlayers: 15,
      category: 'social-deduction',
      minutes: [20, 40],
      complexity: 2,
    },
    art: { band: 'sable', field: 'semee', glyph: 'wolf' },
    about: {
      description:
        'At night the wolves pick someone to eat while the seer and the doctor do their thing. In the morning the village finds out who’s gone, argues about it and votes someone out. The app runs the night, so everyone gets to play.',
      steps: [
        'Night: the wolves pick a target and the special roles act.',
        'Morning: everyone finds out who died.',
        'Day: talk it over, then vote someone out.',
        'The village wins when the wolves are gone. The wolves win once there are as many of them as villagers.',
      ],
      credit: 'A classic party game in the public domain.',
    },
  },
  {
    meta: {
      id: 'spyfall',
      name: 'Spyfall',
      tagline: 'Everyone knows where you are, except the spy.',
      minPlayers: 3,
      maxPlayers: 15,
      category: 'social-deduction',
      minutes: [8, 15],
      complexity: 1,
    },
    art: { band: 'tenne', field: 'fretty', glyph: 'spy' },
    about: {
      description:
        'Everyone except the spy knows where you all are. Ask each other questions that show you know the place without giving it away, while the spy bluffs along and tries to work it out.',
      steps: [
        'Everyone gets the location and a role, except the spy.',
        'Take turns asking each other questions.',
        'Once a round, anyone can call a vote on who they think the spy is.',
        'The spy can stop the round at any time and guess where you are.',
      ],
      credit: 'Based on Spyfall by Alexandr Ushan. Original locations.',
    },
  },
];

/** A game's metadata by id, playable or coming soon, for server code; undefined if unknown. */
export function knownGame(id: string): GameMeta | undefined {
  return games[id]?.meta ?? upcoming.find((u) => u.meta.id === id)?.meta;
}
