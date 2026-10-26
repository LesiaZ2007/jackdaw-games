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
          <EndedChart key={id} id={id} rv={rv} label={name(id)} size="phone" />
        ))}
      </div>
    </div>
  );
};

/**
 * The TV's results, in the slot beside the standings. The battle is over, so both seas show
 * every ship, with the hits, the misses, and the tally under each chart. During the game the
 * TV still hides any ship that has not sunk.
 */
export const TvReveal: NonNullable<GameUi['TvReveal']> = ({ result, players }) => {
  const rv = result.reveal as BattleshipReveal;
  const look = useTheme();
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className="bs bs-tv-end" data-look={look}>
      {rv.players.map((id) => (
        <EndedChart key={id} id={id} rv={rv} label={`${name(id)}'s sea`} size="tv" />
      ))}
    </div>
  );
};

function EndedChart({
  id,
  rv,
  label,
  size,
}: {
  id: string;
  rv: BattleshipReveal;
  label: string;
  size: 'phone' | 'tv';
}) {
  const fleet = rv.fleets[id] ?? [];
  const wrecks = rv.wrecks[id] ?? [];
  return (
    <Chart
      label={label}
      size={size}
      cells={marks(rv.shots[id] ?? [], wrecks)}
      hulls={hulls(fleet, wrecks)}
      fresh={null}
      sinking={[]}
      settling={null}
      tally={{ afloat: fleet.length - wrecks.length, sunk: wrecks.length }}
      smoke="own"
      interactive={false}
    />
  );
}

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
