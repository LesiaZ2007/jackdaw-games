'use client';

import { useTheme, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import { KIND_NAME, type BackgammonReveal } from '../rules';
import { CheckerIcon, Tables } from './table';
import './backgammon.css';

/** The match as a score sheet: each game, who took it, how, the cube and the running score. */
function Sheet({
  rv,
  players,
  size,
}: {
  rv: BackgammonReveal;
  players: ScreenPlayer[];
  size: 'phone' | 'tv';
}) {
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <table className={`bgm-sheet${size === 'tv' ? ' bgm-sheet--tv' : ''}`}>
      <caption>{rv.matchTo === 1 ? 'One game' : `Match to ${rv.matchTo}`}</caption>
      <thead>
        <tr>
          <th scope="col">Game</th>
          <th scope="col">Won by</th>
          <th scope="col">How</th>
          <th scope="col">
            <CheckerIcon side={0} size={size === 'tv' ? 26 : 16} />
            <span className="bgm-sr">{name(rv.players[0])}</span>
          </th>
          <th scope="col">
            <CheckerIcon side={1} size={size === 'tv' ? 26 : 16} />
            <span className="bgm-sr">{name(rv.players[1])}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rv.ends.map((e) => (
          <tr key={e.game}>
            <td>{e.game}</td>
            <td>{name(e.winner)}</td>
            <td>
              {e.dropped ? 'Dropped' : KIND_NAME[e.kind]}
              {e.cube > 1 ? ` ×${e.cube}` : ''} <b>+{e.points}</b>
            </td>
            <td>{e.score[0]}</td>
            <td>{e.score[1]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const rv = result.reveal as BackgammonReveal;
  const look = useTheme();
  return (
    <div className="bgm bgm-reveal" data-look={look}>
      <Sheet rv={rv} players={players} size="phone" />
      <div className="bgm-reveal__board">
        <Tables
          pos={rv.pos}
          viewer={0}
          dice={null}
          diceSide={null}
          cube={1}
          cubeOwner={null}
          showCube={false}
          label="The last game, as it finished"
        />
      </div>
    </div>
  );
};

export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const rv = result.reveal as BackgammonReveal;
  const look = useTheme();
  return (
    <div className="bgm bgm-tv-end" data-look={look}>
      <Sheet rv={rv} players={players} size="tv" />
      <div className="bgm-board">
        <Tables
          pos={rv.pos}
          viewer={0}
          dice={null}
          diceSide={null}
          cube={1}
          cubeOwner={null}
          showCube={false}
          label="The last game, as it finished"
        />
      </div>
    </div>
  );
};
