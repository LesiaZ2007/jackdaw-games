'use client';

import { OutcomeChip, type GameUi, type ScreenPlayer } from '@jackdaw/ui';
import type { CatanReveal } from '../rules';
import { CatanBoard } from './board';
import { SeatToken } from './common';
import './catan.css';
import './tv.css';

/** How everyone made their points, the winner first. */
function Scores({ r, players }: { r: CatanReveal; players: ScreenPlayer[] }) {
  const order = [...r.seats].sort((a, b) => r.points[b]!.total - r.points[a]!.total);
  return (
    <table className="ctn-scores">
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col" title="Settlements">
            Settl.
          </th>
          <th scope="col">Cities</th>
          <th scope="col" title="Longest Road">
            Road
          </th>
          <th scope="col" title="Largest Army">
            Army
          </th>
          <th scope="col" title="Victory point cards">
            Cards
          </th>
          <th scope="col">Points</th>
        </tr>
      </thead>
      <tbody>
        {order.map((id) => {
          const p = players.find((x) => x.id === id);
          const pt = r.points[id]!;
          return (
            <tr key={id}>
              <td>
                <span className="ctn-scores__who">
                  <SeatToken p={p} seats={r.seats} size={26} />
                  {p?.name ?? 'Someone'}
                  {r.winners && r.winners.length > 1
                    ? r.winners.includes(id) && <OutcomeChip outcome="draw">Tied</OutcomeChip>
                    : id === r.winner && <OutcomeChip outcome="win">Won</OutcomeChip>}
                </span>
              </td>
              <td>{pt.settlements}</td>
              <td>{pt.cities}</td>
              <td>{pt.road ? '2' : '–'}</td>
              <td>{pt.army ? '2' : '–'}</td>
              <td>{pt.vp || '–'}</td>
              <td className="ctn-scores__total">{pt.total}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Under the verdict: how everyone made their points, and the island as it ended. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const r = result.reveal as CatanReveal;
  return (
    <div className="ctn ctn-reveal">
      <Scores r={r} players={players} />
      <div className="ctn-reveal__board">
        <CatanBoard
          board={r.board}
          buildings={r.buildings}
          roads={r.roads}
          robber={r.robber}
          seats={r.seats}
          label="The island at the end"
          pad={0.9}
        />
      </div>
    </div>
  );
};

/** The TV's results: the final island beside the scores. */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const r = result.reveal as CatanReveal;
  return (
    <div className="ctn ctn-reveal ctn-reveal--tv">
      <div className="ctn-reveal__board">
        <CatanBoard
          board={r.board}
          buildings={r.buildings}
          roads={r.roads}
          robber={r.robber}
          seats={r.seats}
          label="The island at the end"
          pad={0.8}
        />
      </div>
      <Scores r={r} players={players} />
    </div>
  );
};
