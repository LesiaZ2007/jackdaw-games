'use client';

import type { CSSProperties, PointerEvent } from 'react';
import { cellName, GRID, type Dir, type ShipId } from '../fleet';
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

/** Broad hull: pointed bow at the start (left, or the top), then a rounded rectangle. */
const HULL_H =
  'M1 16 C18 5 28 2 38 2 H84 C96 2 99 8 99 16 C99 24 96 30 84 30 H38 C28 30 18 27 1 16 Z';
const HULL_V =
  'M16 1 C5 18 2 28 2 38 V84 C2 96 8 99 16 99 C24 99 30 96 30 84 V38 C30 28 27 18 16 1 Z';

export interface HullDraw {
  id: ShipId;
  dir: Dir;
  cells: number[];
  sunk: boolean;
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

/**
 * One fleet chart. `hulls` is the only place a ship is drawn: your own fleet while you place
 * and fight, or a wreck once it has sunk. A chart built from the table view never receives an
 * unsunk hull.
 */
export function Chart({
  label,
  cells,
  hulls,
  fresh,
  sinking,
  settling,
  selected,
  ghost,
  onAim,
  interactive,
  onCell,
  size,
}: ChartProps) {
  const freshCells = new Set(fresh?.shots.map((shot) => shot.cell) ?? []);
  return (
    <section className={`bs-chart bs-chart--${size}`} aria-label={label}>
      <header className="bs-chart__head">
        <Compass />
        <h3 className="bs-chart__title">{label}</h3>
        <Scale />
      </header>
      <div className="bs-chart__map">
        <span className="bs-chart__corner" aria-hidden="true" />
        <div className="bs-chart__cols" aria-hidden="true">
          {COLS.map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </div>
        <div className="bs-chart__rows" aria-hidden="true">
          {Array.from({ length: GRID }, (_, row) => (
            <span key={row}>{row + 1}</span>
          ))}
        </div>
        <div className="bs-chart__fit">
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
              const lag = flying
                ? Math.max(0, fresh?.shots.findIndex((shot) => shot.cell === cell) ?? 0)
                : 0;
              const name = cellName(cell);
              const described =
                mark === 'blank'
                  ? name
                  : mark === 'miss'
                    ? `${name}, miss`
                    : mark === 'sunk'
                      ? `${name}, sunk`
                      : `${name}, hit`;
              const peg =
                mark === 'blank' ? null : (
                  <span
                    className={`bs-peg bs-peg--${mark === 'miss' ? 'miss' : 'hit'}${flying ? ' is-fresh' : ''}`}
                    style={
                      {
                        '--col': String(cell % GRID),
                        '--row': String(Math.floor(cell / GRID)),
                        '--lag': `${lag * 70}ms`,
                      } as CSSProperties
                    }
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
                <HullGlyph dir={hull.dir} />
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
                <HullGlyph dir={ghost.dir} />
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HullGlyph({ dir }: { dir: Dir }) {
  const horizontal = dir === 'h';
  return (
    <svg
      className="bs-hull__shape"
      viewBox={horizontal ? '0 0 100 32' : '0 0 32 100'}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={horizontal ? HULL_H : HULL_V} />
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

function Scale() {
  return (
    <span className="bs-scale" aria-hidden="true">
      <span className="bs-scale__bar" />
      <span>10 cables</span>
    </span>
  );
}

export function hullsFromShips(ships: readonly OwnShip[]): HullDraw[] {
  return ships.map((ship) => ({ id: ship.id, dir: ship.dir, cells: ship.cells, sunk: ship.sunk }));
}

export function hullsFromWrecks(wrecks: readonly Wreck[]): HullDraw[] {
  return wrecks.map((wreck) => ({ id: wreck.id, dir: wreck.dir, cells: wreck.cells, sunk: true }));
}
