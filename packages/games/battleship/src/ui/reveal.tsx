'use client';

import { useTheme, type GameUi } from '@jackdaw/ui';
import type { ShipId } from '../fleet';
import type { BattleshipReveal, LaidShip, Mark, Wreck } from '../rules';
import { Chart, type HullDraw } from './chart';
import './battleship.css';

/** After the battle the fleets are public. Both charts sit under the verdict. */
export const Reveal: NonNullable<GameUi['Reveal']> = ({ result, players }) => {
  const rv = result.reveal as BattleshipReveal;
  const look = useTheme();
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className="bs bs-reveal" data-look={look}>
      <div className="bs-reveal__charts">
        {rv.players.map((id) => (
          <Chart
            key={id}
            label={name(id)}
            size="phone"
            cells={marks(rv.shots[id] ?? [], rv.wrecks[id] ?? [])}
            hulls={hulls(rv.fleets[id] ?? [], rv.wrecks[id] ?? [])}
            fresh={null}
            sinking={[]}
            settling={null}
            tally={{
              afloat: (rv.fleets[id]?.length ?? 0) - (rv.wrecks[id]?.length ?? 0),
              sunk: rv.wrecks[id]?.length ?? 0,
            }}
            smoke="own"
            interactive={false}
          />
        ))}
      </div>
    </div>
  );
};

function marks(shots: { cell: number; result: string }[], wrecks: Wreck[]): Mark[] {
  const cells: Mark[] = Array.from({ length: 100 }, () => 'blank');
  for (const shot of shots) cells[shot.cell] = shot.result === 'miss' ? 'miss' : 'hit';
  for (const wreck of wrecks) for (const cell of wreck.cells) cells[cell] = 'sunk';
  return cells;
}

function hulls(fleet: LaidShip[], wrecks: Wreck[]): HullDraw[] {
  const sunk = new Set(wrecks.map((w) => w.id));
  return fleet.map((ship) => ({
    id: ship.id as ShipId,
    dir: ship.dir,
    cells: ship.cells,
    sunk: sunk.has(ship.id),
  }));
}
