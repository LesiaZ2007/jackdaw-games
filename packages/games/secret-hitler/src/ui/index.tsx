'use client';

import type { GameUi } from '@jackdaw/ui';
import { ShLobby } from './lobby';
import { PlayerScreen } from './player';
import { Reveal } from './reveal';
import { TvScreen } from './tv';

/** Secret Hitler: catalog art, detail page, its own lobby, and the screens. */
export const secretHitlerUi: GameUi = {
  art: { band: 'gules', field: 'lozengy', glyph: 'ballot' },
  about: {
    description:
      'Liberals and Fascists sit in one parliament, and only the Fascists know who is who. Each round a president and chancellor pass one policy from a stacked deck, and everyone argues about what they really drew. Up to 15 players, with house rules past 10.',
    steps: [
      'The president nominates a chancellor; everyone votes Ja or Nein at once.',
      'The president draws three policies and discards one; the chancellor enacts one of the last two.',
      'Fascist policies give the president a power: peek, investigate, special election or execution.',
      'Liberals win with five Liberal policies or by executing Hitler. Fascists win with six Fascist policies, or by electing Hitler chancellor once three are down.',
    ],
    credit:
      'Secret Hitler by Goat, Wolf & Cabbage (Mike Boxleiter, Tommy Maranges and Max Temkin), used under CC BY-NC-SA 4.0. Original art; not for sale.',
  },
  PlayerScreen,
  TvScreen,
  Reveal,
  Lobby: ShLobby,
};
