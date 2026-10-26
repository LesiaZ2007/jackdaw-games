'use client';

import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { cellName, GRID, shipOf, type Dir, type ShipId } from '../fleet';
import type { Mark, OwnShip, Volley, Wreck } from '../rules';

/** Heraldic fill for each ship, printed the same in day and dark. */
export const HULL: Record<ShipId, string> = {
  carrier: 'var(--gules)',
  battleship: 'var(--azure)',
  cruiser: 'var(--vert)',
  submarine: 'var(--purpure)',
  destroyer: 'var(--tenne)',
};

const LETTER: Record<ShipId, string> = {
  carrier: 'C',
  battleship: 'B',
  cruiser: 'R',
  submarine: 'S',
  destroyer: 'D',
};

const COLS = 'ABCDEFGHIJ'.split('');

/**
 * Plan views, bow at the left, drawn 20 units to a square so no ship is stretched. The hull
 * takes the ship's fill, the deck work a darker print of the same fill, guns are ink, and the
 * carrier's runway is cream. The vertical drawing swaps the axes.
 *
 * Carrier: a flight deck with an angled runway, catapults at the bow, and the island.
 * Battleship: two turrets forward, one aft, and the bridge between.
 * Cruiser: a turret at each end, a bridge, and a funnel.
 * Submarine: a cigar hull, the sail with its planes, and the stern planes.
 * Destroyer: a sharp bow, a cut transom, a gun at each end.
 */
const SHIP_ART: Record<ShipId, ReactNode> = {
  carrier: (
    <>
      <path
        className="bs-hull__body"
        d="M1 10 L5 4.6 C5.8 3.9 6.8 3.5 8.5 3.5 H96 C98 3.5 99 4.5 99 6 V15.5 C99 17.6 97.6 18.8 95 18.8 H42 L29 16.2 H8.5 C6.8 16.2 5.8 15.9 5 15.4 Z"
      />
      <path className="bs-hull__mark" d="M33 15.6 L96 11 M8 8 H34 M8 12 H26" />
      <rect className="bs-hull__deck" x="64" y="2" width="15" height="5" rx="1" />
    </>
  ),
  battleship: (
    <>
      <path
        className="bs-hull__body"
        d="M0.5 10 C6 4.5 14 2 24 2 H70 C76 2 79.5 5 79.5 10 C79.5 15 76 18 70 18 H24 C14 18 6 15.5 0.5 10 Z"
      />
      <path className="bs-hull__gun" d="M15 9 H8.5 M15 11 H8.5" />
      <circle className="bs-hull__deck" cx="15" cy="10" r="3.3" />
      <path className="bs-hull__gun" d="M25 9 H18 M25 11 H18" />
      <circle className="bs-hull__deck" cx="25" cy="10" r="3.6" />
      <path
        className="bs-hull__deck"
        d="M33 6.5 H48 C51 6.5 53 8 53 10 C53 12 51 13.5 48 13.5 H33 C31.5 13.5 31 12 31 10 C31 8 31.5 6.5 33 6.5 Z"
      />
      <path className="bs-hull__gun" d="M66 9 H73 M66 11 H73" />
      <circle className="bs-hull__deck" cx="66" cy="10" r="3.6" />
    </>
  ),
  cruiser: (
    <>
      <path
        className="bs-hull__body"
        d="M0.5 10 C5 6 11 3.2 20 3 H52 C57 3 59.5 6 59.5 10 C59.5 14 57 17 52 17 H20 C11 16.8 5 14 0.5 10 Z"
      />
      <path className="bs-hull__gun" d="M13 10 H6.5" />
      <circle className="bs-hull__deck" cx="13" cy="10" r="2.8" />
      <path
        className="bs-hull__deck"
        d="M23 7 H35 C36.5 7 37 8.5 37 10 C37 11.5 36.5 13 35 13 H23 C21.8 13 21 11.8 21 10 C21 8.2 21.8 7 23 7 Z"
      />
      <ellipse className="bs-hull__deck" cx="40.5" cy="10" rx="1.9" ry="2.3" />
      <path className="bs-hull__gun" d="M50 10 H56" />
      <circle className="bs-hull__deck" cx="50" cy="10" r="2.8" />
    </>
  ),
  submarine: (
    <>
      <path className="bs-hull__body" d="M47 10 L52.5 3 H56 L55.5 10 L56 17 H52.5 Z" />
      <path
        className="bs-hull__body"
        d="M1 10 C1 6.2 4.5 4.5 11 4.5 H44 C51 4.5 56.5 7.2 59.5 10 C56.5 12.8 51 15.5 44 15.5 H11 C4.5 15.5 1 13.8 1 10 Z"
      />
      <path
        className="bs-hull__deck"
        d="M25 4.8 L27 4.8 L27.5 7.3 H33 C36.5 7.3 38.5 8.6 38.5 10 C38.5 11.4 36.5 12.7 33 12.7 H27.5 L27 15.2 H25 L24.5 12.4 C23 12 22 11 22 10 C22 9 23 8 24.5 7.6 Z"
      />
    </>
  ),
  destroyer: (
    <>
      <path
        className="bs-hull__body"
        d="M0.5 10 C5 5.5 10 3.5 17 3.5 H39 V16.5 H17 C10 16.5 5 14.5 0.5 10 Z"
      />
      <path className="bs-hull__gun" d="M10.5 10 H4.5" />
      <circle className="bs-hull__deck" cx="10.5" cy="10" r="2.3" />
      <path
        className="bs-hull__deck"
        d="M16.5 6.8 H24 C25.5 6.8 26.5 8 26.5 10 C26.5 12 25.5 13.2 24 13.2 H16.5 C15.5 13.2 15 12 15 10 C15 8 15.5 6.8 16.5 6.8 Z"
      />
      <ellipse className="bs-hull__deck" cx="30" cy="10" rx="1.6" ry="2" />
      <path className="bs-hull__gun" d="M34.5 10 H38" />
      <circle className="bs-hull__deck" cx="34.5" cy="10" r="1.7" />
    </>
  ),
};

export interface HullDraw {
  id: ShipId;
  dir: Dir;
  cells: number[];
  sunk: boolean;
}

export interface ChartTally {
  afloat: number;
  sunk: number;
}

interface ChartProps {
  label: string;
  cells: readonly Mark[];
  /** Hulls to draw. Only sunk wrecks on a chart the other player or the TV can see. */
  hulls: readonly HullDraw[];
  /** Volley that just landed on this chart, so its pegs fly in and a new wreck sinks. */
  fresh: Volley | null;
  sinking: readonly ShipId[];
  settling: ShipId | null;
  /** How many of this chart's fleet are still up, and how many have gone down. */
  tally?: ChartTally | null;
  selected?: readonly number[];
  /** Faded preview while placing. Local to this screen. Never an enemy hull. */
  ghost?: { id: ShipId; dir: Dir; cells: number[]; illegal: boolean } | null;
  /** Mouse entered a square, or left the chart. Ignored for touch. */
  onAim?: (cell: number | null) => void;
  interactive: boolean;
  onCell?: (cell: number) => void;
  size: 'phone' | 'tv';
}

/**
 * A hull is painted over the chart, not placed in the grid. A grid item would occupy those
 * squares and push the pegs of a sunk ship onto the next row.
 */
function place(cells: number[], dir: Dir): CSSProperties {
  const start = Math.min(...cells);
  return {
    '--col': String(start % GRID),
    '--row': String(Math.floor(start / GRID)),
    '--w': String(dir === 'h' ? cells.length : 1),
    '--h': String(dir === 'v' ? cells.length : 1),
  } as CSSProperties;
}

function atCell(cell: number, lag: number): CSSProperties {
  return {
    '--col': String(cell % GRID),
    '--row': String(Math.floor(cell / GRID)),
    '--lag': `${lag * 70}ms`,
  } as CSSProperties;
}

/**
 * One fleet chart. `hulls` is the only place a ship is drawn: your own fleet while you place
 * and fight, or a wreck once it has sunk. A chart built from the table view never receives an
 * unsunk hull. Letters and numbers share the square's tracks, and they do not fire.
 */
export function Chart({
  label,
  cells,
  hulls,
  fresh,
  sinking,
  settling,
  tally,
  selected,
  ghost,
  onAim,
  interactive,
  onCell,
  size,
}: ChartProps) {
  const freshCells = new Set(fresh?.shots.map((shot) => shot.cell) ?? []);
  const covered = new Set(hulls.flatMap((hull) => hull.cells));
  const lagOf = (cell: number) =>
    freshCells.has(cell)
      ? Math.max(0, fresh?.shots.findIndex((shot) => shot.cell === cell) ?? 0)
      : 0;
  return (
    <section className={`bs-chart bs-chart--${size}`} aria-label={label}>
      <header className="bs-chart__head">
        <Compass />
        <h3 className="bs-chart__title">{label}</h3>
      </header>
      <div className="bs-chart__plate">
        <div className="bs-chart__board">
          <span className="bs-chart__corner" aria-hidden="true" />
          {COLS.map((letter, index) => (
            <span
              key={letter}
              className="bs-chart__lab bs-chart__lab--col"
              style={{ gridColumn: index + 2, gridRow: 1 }}
              aria-hidden="true"
            >
              {letter}
            </span>
          ))}
          {Array.from({ length: GRID }, (_, row) => (
            <span
              key={row}
              className="bs-chart__lab bs-chart__lab--row"
              style={{ gridColumn: 1, gridRow: row + 2 }}
              aria-hidden="true"
            >
              {row + 1}
            </span>
          ))}
          <div
            className="bs-chart__grid"
            onPointerLeave={
              onAim
                ? (event) => {
                    if (event.pointerType !== 'mouse') return;
                    onAim(null);
                  }
                : undefined
            }
          >
            <Sea />
            {cells.map((mark, cell) => {
              const picked = selected?.includes(cell) ?? false;
              const flying = freshCells.has(cell);
              const lag = lagOf(cell);
              const name = cellName(cell);
              const described =
                mark === 'blank'
                  ? name
                  : mark === 'miss'
                    ? `${name}, miss`
                    : mark === 'sunk'
                      ? `${name}, sunk`
                      : `${name}, hit`;
              const onHull = covered.has(cell) && mark !== 'miss';
              const peg =
                mark === 'blank' || onHull ? null : (
                  <span
                    className={`bs-peg bs-peg--${mark === 'miss' ? 'miss' : 'hit'}${flying ? ' is-fresh' : ''}`}
                    style={atCell(cell, lag)}
                  />
                );
              const cellClass = `bs-cell${mark === 'blank' ? '' : ` is-${mark}`}${flying ? ' is-fresh' : ''}${picked ? ' is-picked' : ''}`;
              const press = flying ? ({ '--lag': `${lag * 70}ms` } as CSSProperties) : undefined;
              if (!interactive) {
                return (
                  <span key={cell} className={cellClass} style={press} aria-label={described}>
                    {peg}
                  </span>
                );
              }
              return (
                <button
                  key={cell}
                  type="button"
                  className={cellClass}
                  style={press}
                  aria-label={mark === 'blank' ? name : described}
                  aria-pressed={picked || undefined}
                  disabled={mark !== 'blank'}
                  onPointerEnter={
                    onAim
                      ? (event: PointerEvent<HTMLButtonElement>) => {
                          if (event.pointerType !== 'mouse') return;
                          onAim(cell);
                        }
                      : undefined
                  }
                  onClick={() => onCell?.(cell)}
                >
                  {peg}
                </button>
              );
            })}
            {hulls.map((hull) => (
              <span
                key={hull.id}
                className={`bs-hull bs-hull--${hull.dir}${hull.sunk ? ' is-sunk' : ''}${sinking.includes(hull.id) ? ' is-sinking' : ''}${settling === hull.id ? ' is-settling' : ''}`}
                style={{ ...place(hull.cells, hull.dir), '--hull': HULL[hull.id] } as CSSProperties}
              >
                <HullGlyph id={hull.id} dir={hull.dir} />
                <span className="bs-hull__name">{LETTER[hull.id]}</span>
              </span>
            ))}
            {ghost && ghost.cells.length > 0 && (
              <span
                className={`bs-hull bs-hull--${ghost.dir} bs-hull--ghost${ghost.illegal ? ' is-illegal' : ''}`}
                style={
                  { ...place(ghost.cells, ghost.dir), '--hull': HULL[ghost.id] } as CSSProperties
                }
                aria-hidden="true"
              >
                <HullGlyph id={ghost.id} dir={ghost.dir} />
              </span>
            )}
            {cells.map((mark, cell) => {
              if (!covered.has(cell) || (mark !== 'hit' && mark !== 'sunk')) return null;
              const flying = freshCells.has(cell);
              return (
                <span key={`over-${cell}`} className="bs-pegover" style={atCell(cell, lagOf(cell))}>
                  <span className={`bs-peg bs-peg--hit${flying ? ' is-fresh' : ''}`} />
                </span>
              );
            })}
            {fresh?.shots.map((shot, index) => (
              <span
                key={`plane-${shot.cell}`}
                className="bs-plane"
                style={atCell(shot.cell, index)}
                aria-hidden="true"
              >
                <Plane />
              </span>
            ))}
          </div>
        </div>
      </div>
      {tally && (
        <p className="bs-chart__tally">
          {tally.afloat} afloat · {tally.sunk} sunk
        </p>
      )}
    </section>
  );
}

function HullGlyph({ id, dir }: { id: ShipId; dir: Dir }) {
  const long = shipOf(id).len * 20;
  const horizontal = dir === 'h';
  return (
    <svg
      className="bs-hull__shape"
      viewBox={horizontal ? `0 0 ${long} 20` : `0 0 20 ${long}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {horizontal ? SHIP_ART[id] : <g transform="matrix(0 1 1 0 0 0)">{SHIP_ART[id]}</g>}
    </svg>
  );
}

/** The same plan view, unstretched, for the dock and the fleet strip. */
export function ShipArt({ id }: { id: ShipId }) {
  return (
    <svg
      className="bs-hull__shape bs-shipart"
      viewBox={`0 0 ${shipOf(id).len * 20} 20`}
      aria-hidden="true"
    >
      {SHIP_ART[id]}
    </svg>
  );
}

/** Wings, tailplane, canopy, and the blur of the propeller, seen from above, nose to the right. */
const PLANE =
  'M63 32 C63 29.6 61 28.6 57 28.4 H47 L43.5 5.5 C43.2 4.4 42.4 4 41.3 4 H36.4 C35.4 4 34.8 4.6 34.8 5.6 L33 28.6 L17 29.4 L13.5 17.5 C13.3 16.8 12.8 16.5 12 16.5 H8.6 C7.9 16.5 7.5 17 7.6 17.7 L8.5 30 C6 30.5 4.5 31.2 4.5 32 C4.5 32.8 6 33.5 8.5 34 L7.6 46.3 C7.5 47 7.9 47.5 8.6 47.5 H12 C12.8 47.5 13.3 47.2 13.5 46.5 L17 34.6 L33 35.4 L34.8 58.4 C34.8 59.4 35.4 60 36.4 60 H41.3 C42.4 60 43.2 59.6 43.5 58.5 L47 35.6 H57 C61 35.4 63 34.4 63 32 Z';

/**
 * A printed plane flies across the chart and the peg drops after it, its shadow on the water
 * below. Ink and the sea colour only. It is not a hull, so it never shows where a ship is hiding.
 */
function Plane() {
  return (
    <svg viewBox="0 0 64 64">
      <path className="bs-plane__shadow" transform="translate(3 5)" d={PLANE} />
      <path className="bs-plane__body" d={PLANE} />
      <path
        className="bs-plane__line"
        d="M50 30 C54 30.4 55.5 31.1 55.5 32 C55.5 32.9 54 33.6 50 34 M64.5 23 V41 M25 32 H31"
      />
    </svg>
  );
}

/** A few engraved wave lines. Stroke only, so the sea stays flat print. */
function Sea() {
  const lines = [14, 30, 46, 62, 78, 94];
  return (
    <svg className="bs-sea" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {lines.map((y) => (
        <path
          key={y}
          d={`M0 ${y} Q 8 ${y - 2.2} 16 ${y} T 32 ${y} T 48 ${y} T 64 ${y} T 80 ${y} T 96 ${y}`}
        />
      ))}
    </svg>
  );
}

function Compass() {
  return (
    <svg className="bs-compass" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M32 12l6 20-6 4-6-4z" fill="currentColor" />
      <path d="M32 52l-6-20 6-4 6 4z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M32 8v6M32 50v6M8 32h6M50 32h6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function hullsFromShips(ships: readonly OwnShip[]): HullDraw[] {
  return ships.map((ship) => ({ id: ship.id, dir: ship.dir, cells: ship.cells, sunk: ship.sunk }));
}

export function hullsFromWrecks(wrecks: readonly Wreck[]): HullDraw[] {
  return wrecks.map((wreck) => ({ id: wreck.id, dir: wreck.dir, cells: wreck.cells, sunk: true }));
}
