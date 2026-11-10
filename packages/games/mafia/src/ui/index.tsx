'use client';

import type { GameUi } from '@jackdaw/ui';
import { LobbySeats, MafiaTvLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvReveal } from './tv-reveal';
import { TvScreen } from './tv';

/** Mafia (and Werewolf): catalog art, detail page and screens. It uses Jackdaw's lobby. */
export const mafiaUi: GameUi = {
  art: { band: 'gules', field: 'fretty', glyph: 'fedora' },
  about: {
    description:
      'Somebody at this table is a killer, and everyone is lying a little. At night the killers pick a victim on their phones while the Angel guards and the Sheriff investigates. By day the table argues and votes someone out. The app runs the night, so nobody has to sit out as moderator. Switch to Werewolf for a village with a Seer, a Witch, a Hunter and Cupid.',
    steps: [
      'Everyone gets a secret card: Mafia, Angel, Sheriff or Civilian (Werewolf, Seer or Villager in the village).',
      'Night: killers pick a victim and the powers act. Everyone else taps too, so nothing gives you away.',
      'Morning: the narrator reads out who died. Then talk it over until most of you are ready to vote.',
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
        alt: 'Werewolf on a phone: “The cards are dealt” on a scroll, and a card to tap and look at in secret before the first night.',
      },
      {
        src: '/games/mafia/tv.png',
        alt: 'Mafia on a TV: “The cards are dealt” across the front page of The Jackdaw Courier, everyone’s placard, and the roles in the deck.',
        desktop: true,
      },
      {
        src: '/games/mafia/werewolf-tv.png',
        alt: 'Werewolf on a TV: “The cards are dealt” on the village’s scroll, the players as cottages, and the roles in the deck.',
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
  TvReveal,
};
