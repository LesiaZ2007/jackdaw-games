'use client';

import { clockMs, type GameUi } from '@jackdaw/ui';
import type { SolitaireReveal } from '../rules';
import { PlayerScreen } from './player';
import { TvScreen, WatchScreen } from './tv';

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
        {clockMs(r.ms)} played
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
      'Klondike, the solitaire everyone knows, played all at once around the table. Each of you lays out your own deck, but the aces go in the middle for everyone. Build on anyone’s piles, race to put your cards up first, and be the first to get rid of every card.',
    steps: [
      'Everyone deals their own deck: seven columns, plus the stock. Uncovered aces go straight to the middle.',
      'Build columns down in alternating colors, put a king in an empty column, and turn the stock as often as you like.',
      'The middle piles are shared. Any ace starts one, and anyone can build up in suit. Tap a card to send it up.',
      'If nobody can play, everyone pulls a covered card onto their waste at once.',
      'The first to get rid of every card wins. If nobody can move, the fewest cards left wins.',
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
        alt: 'Solitaire on a TV: the shared middle across the top and every player’s layout below, each deck’s backs in its owner’s color, with their cards to go.',
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
