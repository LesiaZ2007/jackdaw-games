import type { GameCategory, GameMeta } from '@jackdaw/engine';
import { avalonUi } from '@jackdaw/game-avalon/ui';
import { catanUi } from '@jackdaw/game-catan/ui';
import { codenamesUi } from '@jackdaw/game-codenames/ui';
import { unoUi } from '@jackdaw/game-uno/ui';
import { pokerUi } from '@jackdaw/game-poker/ui';
import { riskUi } from '@jackdaw/game-risk/ui';
import { rpsUi } from '@jackdaw/game-rps/ui';
import { secretHitlerUi } from '@jackdaw/game-secret-hitler/ui';
import { wavelengthUi } from '@jackdaw/game-wavelength/ui';
import { wordhoardUi } from '@jackdaw/game-wordhoard/ui';
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
  catan: catanUi,
  codenames: codenamesUi,
  uno: unoUi,
  poker: pokerUi,
  risk: riskUi,
  rps: rpsUi,
  'secret-hitler': secretHitlerUi,
  wavelength: wavelengthUi,
  wordhoard: wordhoardUi,
};

const upcoming: Omit<CatalogEntry, 'playable'>[] = [
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

/** The order games are listed in: grouped loosely by kind. */
const KIND_ORDER: GameCategory[] = ['social-deduction', 'word', 'card', 'board'];

/** Every game, playable ones first, each group by kind and then by name. */
export const catalog: CatalogEntry[] = [
  ...Object.values(games).flatMap((g) => {
    const ui = gameUis[g.meta.id];
    return ui ? [{ meta: g.meta, art: ui.art, about: ui.about, playable: true, ui }] : [];
  }),
  ...upcoming.filter((u) => !games[u.meta.id]).map((u) => ({ ...u, playable: false })),
].sort(
  (a, b) =>
    Number(b.playable) - Number(a.playable) ||
    KIND_ORDER.indexOf(a.meta.category) - KIND_ORDER.indexOf(b.meta.category) ||
    a.meta.name.localeCompare(b.meta.name),
);

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
