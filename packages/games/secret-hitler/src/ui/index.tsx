'use client';

import type { GameUi } from '@jackdaw/ui';
import { ShLobby } from './lobby';
import { PlayerScreen } from './player';
import { Results } from './results';
import { TvScreen } from './tv';
import { ShTvLobby } from './tv-lobby';

/**
 * Secret Hitler, played and drawn as secret-hitler.online (ShrimpCryptid's Secret Hitler
 * Online): its lobby, game page, popups and victory screen, ported into Jackdaw.
 */
export const secretHitlerUi: GameUi = {
  art: { band: 'gules', field: 'lozengy', glyph: 'ballot' },
  about: {
    description:
      'Liberals and Fascists sit in one parliament, and only the Fascists know who is who. Each round a president and chancellor pass one policy from a stacked deck, and everyone argues about what they really drew. Played as on secret-hitler.online, for up to 15 players, with house rules past 10.',
    steps: [
      'The president nominates a chancellor; everyone votes Ja or Nein at once.',
      'The president draws three policies and discards one; the chancellor enacts one of the last two.',
      'Fascist policies give the president a power: peek, investigate, special election or execution. Then the president ends their term.',
      'Liberals win with five Liberal policies or by executing Hitler. Fascists win with six Fascist policies, or by electing Hitler chancellor once three are down.',
    ],
    credit:
      'Secret Hitler by Goat, Wolf & Cabbage (Mike Boxleiter, Tommy Maranges and Max Temkin). Screens, art and animations from Secret Hitler Online by ShrimpCryptid (secret-hitler.online, github.com/ShrimpCryptid/Secret-Hitler-Online), adapted for Jackdaw. Both CC BY-NC-SA 4.0; not for sale.',
    pictures: [
      {
        src: '/games/secret-hitler/lobby-phone.png',
        alt: 'Secret Hitler’s lobby on a phone: the lobby code, the invite link and everyone’s tile.',
      },
      {
        src: '/games/secret-hitler/tv.png',
        alt: 'Secret Hitler on a TV: the player tiles, the status bar, the draw and discard piles, and the Liberal and Fascist boards.',
        wide: true,
      },
    ],
  },
  PlayerScreen,
  TvScreen,
  Results,
  Lobby: ShLobby,
  TvLobby: ShTvLobby,
  fullBleed: true,
};
