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
      'Everyone is a Liberal or a Fascist, and the Fascists know who each other are. Each round a president and a chancellor pass a law from a deck that’s stacked against the Liberals, then everyone argues about what they were really dealt. Played the way secret-hitler.online does it, for up to 15 players (house rules above 10).',
    steps: [
      'The president nominates a chancellor and everyone votes Ja or Nein at the same time.',
      'The president draws three policies and throws one away. The chancellor picks one of the other two to pass.',
      'Some Fascist policies give the president a power: look at the deck, check someone’s party, pick the next president or shoot someone.',
      'Liberals win with five Liberal policies or by shooting Hitler. Fascists win with six Fascist policies, or by getting Hitler elected chancellor after three are down.',
    ],
    credit:
      'Secret Hitler by Goat, Wolf & Cabbage (Mike Boxleiter, Tommy Maranges and Max Temkin). Screens, art and animations from Secret Hitler Online by ShrimpCryptid (secret-hitler.online, github.com/ShrimpCryptid/Secret-Hitler-Online), adapted for Jackdaw. Both CC BY-NC-SA 4.0; not for sale.',
    pictures: [
      {
        src: '/games/secret-hitler/game-phone.png',
        alt: 'Secret Hitler on a phone: the player tiles, the status bar and the boards.',
      },
      {
        src: '/games/secret-hitler/desktop.png',
        alt: 'Secret Hitler on a laptop: the player tiles, the status bar, the draw and discard piles, and both boards.',
        desktop: true,
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
