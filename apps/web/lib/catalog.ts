import type { GameCategory, GameMeta } from '@jackdaw/engine';
import { avalonUi } from '@jackdaw/game-avalon/ui';
import { codenamesUi } from '@jackdaw/game-codenames/ui';
import { rpsUi } from '@jackdaw/game-rps/ui';
import { secretHitlerUi } from '@jackdaw/game-secret-hitler/ui';
import type { GameAbout, GameUi } from '@jackdaw/ui';
import { games } from './registry';
import type { GameArt } from '@jackdaw/ui';

/**
 * Everything the catalog and lobby know about each game. Playable games come from the
 * registry (rules) plus their UI module (art, about, screens). Games still being built are
 * listed too, greyed as "Coming soon", so friends can see what's next.
 */
export interface CatalogEntry {
  meta: GameMeta;
  art: GameArt;
  about: GameAbout;
  playable: boolean;
  /** Present only for playable games. */
  ui?: GameUi;
}

/** Client UI modules for registered games, by id. Add a game's `./ui` export here. */
export const gameUis: Record<string, GameUi> = {
  avalon: avalonUi,
  codenames: codenamesUi,
  rps: rpsUi,
  'secret-hitler': secretHitlerUi,
};

const upcoming: Omit<CatalogEntry, 'playable'>[] = [
  {
    meta: {
      id: 'secret-hitler',
      name: 'Secret Hitler',
      tagline: 'Elect a government. Find the fascists.',
      minPlayers: 5,
      maxPlayers: 15,
      category: 'social-deduction',
      minutes: [45, 60],
      complexity: 2,
    },
    art: { band: 'gules', field: 'lozengy', glyph: 'ballot' },
    about: {
      description:
        'Liberals and fascists sit in one parliament, and only the fascists know who is who. Each round a president and chancellor pass one policy from a stacked deck, and everyone argues about what they really drew.',
      steps: [
        'The president nominates a chancellor; everyone votes Ja or Nein at once.',
        'The president draws three policies and discards one.',
        'The chancellor enacts one of the last two.',
        'Fascist policies unlock presidential powers: peek, investigate, execute.',
      ],
      credit: 'Secret Hitler by Goat, Wolf & Cabbage, used under CC BY-NC-SA 4.0.',
    },
  },
  {
    meta: {
      id: 'werewolf',
      name: 'Werewolf',
      tagline: 'The app narrates. Nobody sits out.',
      minPlayers: 6,
      maxPlayers: 15,
      category: 'social-deduction',
      minutes: [20, 40],
      complexity: 2,
    },
    art: { band: 'sable', field: 'semee', glyph: 'wolf' },
    about: {
      description:
        'By night the wolves choose a victim while the seer and doctor work in secret. By day the village argues and votes someone out. The app runs the night, so everyone gets to play.',
      steps: [
        'Night: wolves pick a target; special roles act.',
        'Morning: the village learns who died.',
        'Day: discuss, then vote to eliminate a suspect.',
        'Villagers win when the wolves are gone; wolves win when they match the village.',
      ],
      credit: 'A classic party game in the public domain.',
    },
  },
  {
    meta: {
      id: 'spyfall',
      name: 'Spyfall',
      tagline: 'Everyone knows where you are. Except one.',
      minPlayers: 3,
      maxPlayers: 15,
      category: 'social-deduction',
      minutes: [8, 15],
      complexity: 1,
    },
    art: { band: 'tenne', field: 'fretty', glyph: 'spy' },
    about: {
      description:
        'Everyone but the spy sees the same location. Take turns asking each other questions that prove you know it without giving it away, while the spy tries to work out where everyone is.',
      steps: [
        'Everyone sees the location and a role, except the spy.',
        'Players take turns asking one another questions.',
        'Anyone can call a vote on a suspect, once a round.',
        'The spy can stop the round at any time and guess the location.',
      ],
      credit: 'Based on Spyfall by Alexandr Ushan. Original locations.',
    },
  },
];

export const catalog: CatalogEntry[] = [
  ...Object.values(games).flatMap((g) => {
    const ui = gameUis[g.meta.id];
    return ui ? [{ meta: g.meta, art: ui.art, about: ui.about, playable: true, ui }] : [];
  }),
  ...upcoming.filter((u) => !games[u.meta.id]).map((u) => ({ ...u, playable: false })),
];

export function catalogEntry(id: string | null | undefined): CatalogEntry | undefined {
  return catalog.find((e) => e.meta.id === id);
}

export const CATEGORY_LABEL: Record<GameCategory, string> = {
  'social-deduction': 'Hidden roles',
  word: 'Word and party',
  card: 'Card',
  board: 'Board',
};

export const COMPLEXITY_LABEL: Record<1 | 2 | 3, string> = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };

/** Why a game can't be played with this many players, or null if it can. */
export function unfitReason(meta: GameMeta, players: number): string | null {
  if (players >= meta.minPlayers && players <= meta.maxPlayers) return null;
  return meta.minPlayers === meta.maxPlayers
    ? `Needs exactly ${meta.minPlayers} players`
    : `Needs ${meta.minPlayers} to ${meta.maxPlayers} players`;
}
