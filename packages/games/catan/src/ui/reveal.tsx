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
  const first = r.points[r.seats[0]!]!;
  const ck = first.metros !== undefined;
  const sea = first.islands !== undefined;
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
          {ck ? (
            <>
              <th scope="col" title="Metropolises">
                Metro
              </th>
              <th scope="col" title="Defender of Catan">
                Def.
              </th>
            </>
          ) : (
            <th scope="col" title="Largest Army">
              Army
            </th>
          )}
          {sea && (
            <th scope="col" title="New islands settled">
              Isles
            </th>
          )}
          <th
            scope="col"
            title={ck ? 'Printer, Constitution and the merchant' : 'Victory point cards'}
          >
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
              {ck ? (
                <>
                  <td>{pt.metros ? pt.metros * 2 : '–'}</td>
                  <td>{pt.defender || '–'}</td>
                </>
              ) : (
                <td>{pt.army ? '2' : '–'}</td>
              )}
              {sea && <td>{pt.islands ? pt.islands * 2 : '–'}</td>}
              <td>{(ck ? pt.progress : pt.vp) || '–'}</td>
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
          ships={r.ships}
          pirate={r.pirate ?? null}
          knights={r.ckKnights}
          walls={r.walls}
          metros={r.metros}
          merchant={r.merchant ?? null}
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
          ships={r.ships}
          pirate={r.pirate ?? null}
          knights={r.ckKnights}
          walls={r.walls}
          metros={r.metros}
          merchant={r.merchant ?? null}
          label="The island at the end"
          pad={0.8}
        />
      </div>
      <Scores r={r} players={players} />
    </div>
  );
};
