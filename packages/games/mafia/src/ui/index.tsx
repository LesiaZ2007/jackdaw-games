'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats, MafiaTvLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';

/** Mafia (and Werewolf): catalog art, detail page and screens. It uses Jackdaw's lobby. */
export const mafiaUi: GameUi = {
  art: { band: 'gules', field: 'fretty', glyph: 'fedora' },
  about: {
    description:
      'Somebody at this table is a killer, and everyone is lying a little. Each night the killers pick a victim in secret on their phones, while the Angel guards someone and the Sheriff asks questions. Each morning the narrator reads out who didn’t make it, and the table argues it out and votes someone out. Nobody has to sit out as the moderator: the app runs the night and reads it aloud. Flip the setting to Werewolf and the city becomes the village of Thiercelieux, with werewolves, a Seer, a Witch, a Hunter and Cupid.',
    steps: [
      'Everyone gets a secret card: Mafia, Angel, Sheriff or Civilian (Werewolves, Seer and Villagers in the village).',
      'Night: shield your screen. Killers agree on a victim, the powers do their work, and everyone else names a suspect, so the tapping gives nothing away.',
      'Morning: the narrator reads out who died (and their card, if the dead are shown).',
      'Day: talk it over until most of you are ready, or the talk timer runs out.',
      'Vote someone out, or skip. A tie, or as many skips, means nobody goes.',
      'The town wins when every killer is gone. The killers win once they match everyone else.',
    ],
    credit:
      'Mafia was created by Dmitry Davidoff in 1986. Werewolf follows The Werewolves of Millers Hollow (Les Loups-garous de Thiercelieux) by Philippe des Pallières and Hervé Marly. Played here with Jackdaw’s own art and words.',
    pictures: [
      {
        src: '/games/mafia/vote-phone.png',
        alt: 'Mafia on a phone: “The Town Decides” across the front page, everyone’s mugshot placard with the dead one stamped, and the vote at the foot.',
      },
      {
        src: '/games/mafia/werewolf-phone.png',
        alt: 'Werewolf on a phone at night: the players as cottages under an indigo sky, and the Witch choosing whether to save the wolves’ victim.',
      },
      {
        src: '/games/mafia/tv.png',
        alt: 'Mafia on a TV: an EXTRA! stamp over “Town Runs Wren Out”, the placards with the votes counted, the deck, the tally and the obituaries.',
        desktop: true,
      },
      {
        src: '/games/mafia/werewolf-tv.png',
        alt: 'Werewolf on a TV at night: “Night falls on the village” over the cottages, the moon rising over the treeline.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    mode: {
      Mafia:
        'The city: Mafia, the Angel and the Sheriff. Add the Jester, Mayor or Serial Killer below.',
      Werewolf: 'The village: Werewolves and the Seer. Add the Witch, Hunter or Cupid below.',
    },
    killers: 'How many Mafia (or Werewolves). Auto deals about one in four.',
    talk: 'How long the day lasts before the vote opens by itself. The vote opens early once most are ready.',
    reveal: {
      Shown: 'When someone dies, everyone sees their card.',
      Hidden: 'The dead take their card to the grave until the game ends.',
    },
  },
  fit: true,
  LobbySeats,
  TvLobby: MafiaTvLobby,
  PlayerScreen,
  TvScreen,
  Reveal,
};
