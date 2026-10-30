'use client';

import type { GameUi } from '@jackdaw/ui';
import type { SolitaireReveal } from '../rules';
import { PlayerScreen } from './player';
import { TvScreen, WatchScreen } from './tv';

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Under each player's verdict: cards still to go and cards put up, fewest left first. */
const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const r = result.reveal as SolitaireReveal;
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  const ids = Object.keys(r.left).sort((a, b) => r.left[a]! - r.left[b]!);
  return (
    <div className="sol-reveal">
      <table>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">To go</th>
            <th scope="col">Put up</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => (
            <tr key={id} className={result.winners.includes(id) ? 'sol-reveal--win' : undefined}>
              <th scope="row">{name(id)}</th>
              <td>{r.left[id]}</td>
              <td>{r.played[id]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {clock(r.ms)} played
        {r.pulls > 0 && ` · everyone was stuck ${r.pulls === 1 ? 'once' : `${r.pulls} times`}`}
        {r.blocked && ' · nobody could play in the end'}
      </p>
    </div>
  );
};

/** Solitaire: catalog art, detail page and screens. It uses Jackdaw's lobby. */
export const solitaireUi: GameUi = {
  art: { band: 'sable', field: 'bendy', glyph: 'patience' },
  about: {
    description:
      'Klondike, the solitaire everyone knows, played all at once round the table. Each of you lays out your own deck, but the aces go in the middle for everyone: build on anyone’s piles, race to put your cards up first, and be the first to get rid of every card.',
    steps: [
      'Everyone deals their own deck as usual: seven columns, the top card of each face up, the rest in the stock. Any uncovered aces go straight to the middle.',
      'Play by the usual rules. Build your columns down in alternating colours, put a king in an empty column, and turn the stock one or three cards at a time, as often as you like.',
      'The piles in the middle are everyone’s. Any ace starts a new one, and you can build up in suit on any of them, not just your own. Tap a card to send it up; if someone gets there first, it stays put.',
      'If nobody can play anything, even turning through their whole stock, everyone pulls one of their covered cards onto their waste at once, again until a card can be played.',
      'The first to get rid of every card wins. If nobody can play and nobody has a covered card left, the fewest cards left wins.',
    ],
    credit:
      'Klondike is a traditional patience game; this way of racing it together is a house rule.',
    pictures: [
      {
        src: '/games/solitaire/game-phone.png',
        alt: 'Solitaire on a phone: the other players and their cards to go along the top, the shared middle printed in green with the aces on it, your stock and waste, and your seven columns.',
      },
      {
        src: '/games/solitaire/desktop.png',
        alt: 'Solitaire on a TV: the shared middle across the top and every player’s layout below, each deck’s backs in its owner’s colour, with their cards to go.',
        desktop: true,
      },
    ],
  },
  optionHelp: {
    draw: {
      'Draw one': 'Turn the stock one card at a time, so every card comes round.',
      'Draw three': 'Turn three at a time and play the top one. Harder: some cards stay buried.',
    },
  },
  fit: true,
  PlayerScreen,
  TvScreen,
  WatchScreen,
  Reveal,
};
