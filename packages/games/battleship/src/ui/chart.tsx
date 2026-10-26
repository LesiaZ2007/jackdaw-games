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

/**
 * Plan-view silhouettes in a 100×32 box, bow at the left. Each one is broad enough to cover
 * its squares. The vertical drawing is the same path with the axes swapped.
 *
 * Carrier: flight deck with the island on one side of the stern.
 * Battleship: a long hull, a stepped deck, and three gun houses.
 * Cruiser: a clipper bow, one turret, and a spoon stern.
 * Submarine: a round nose and a sail.
 * Destroyer: a sharp bow and a cut transom.
 * Ink lines sit inside each hull so the deck and the guns still read at chart size.
 */
const HULL_H: Record<ShipId, string> = {
  carrier:
    'M2 15 C12 8 20 4 32 4 H93 C97 4 99 8 99 12 V20 C99 24 97 26 93 26 H88 V32 H62 V26 H32 C20 26 12 22 2 15 Z',
  battleship:
    'M0 16 C3 11 8 7 14 6 H20 V1 H34 V6 H42 V1 H58 V6 H68 V1 H82 V7 H92 C97 8 100 12 100 16 C100 20 97 24 92 25 H82 V31 H68 V26 H58 V31 H42 V26 H34 V31 H20 V26 H14 C8 25 3 21 0 16 Z',
  cruiser:
    'M0 16 C16 7 28 3 40 3 C46 3 48 0 56 0 C64 0 66 3 74 4 H84 C92 6 99 11 99 16 C99 22 94 27 84 28 H74 C66 29 64 32 56 32 C48 32 46 29 40 29 C28 29 16 25 0 16 Z',
  submarine:
    'M8 16 C8 8 16 5 28 5 H36 V0 H58 V5 H78 C90 5 99 10 99 16 C99 22 90 27 78 27 H28 C16 27 8 24 8 16 Z',
  destroyer: 'M0 16 C3 11 8 5 18 3 H68 L76 8 H99 V24 H76 L68 29 H18 C8 27 3 21 0 16 Z',
};

/**
 * Ink inside the silhouette. The battleship carries three gun houses. The others stay
 * themselves: a flight deck and one island, one lighter gun, a conning tower, a short gun.
 */
const HULL_LINES: Partial<Record<ShipId, readonly string[]>> = {
  carrier: ['M22 9 H86', 'M22 15 H60', 'M66 18 H82 V31 H66 Z', 'M72 22 V28'],
  battleship: [
    'M22 4 H32 V28 H22 Z',
    'M44 4 H56 V28 H44 Z',
    'M70 4 H80 V28 H70 Z',
    'M14 16 H92',
    'M22 10 H12',
    'M22 22 H12',
    'M44 10 H36',
    'M44 22 H36',
    'M80 10 H88',
    'M80 22 H88',
  ],
  cruiser: ['M48 4 H60 V28 H48 Z', 'M16 16 H88', 'M48 13 H40', 'M48 19 H40'],
  submarine: ['M18 16 H90', 'M40 2 H54 V20 H40 Z', 'M43 8 H51'],
  destroyer: ['M22 16 H64', 'M28 8 H40 V24 H28 Z', 'M28 13 H20', 'M28 19 H20'],
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
  /**
   * `own`: a hit part of a drawn ship smokes. `sea`: smoke sits on the hit cell until that
   * ship sinks, and only then may the hull smoke. Never an unsunk enemy hull.
   */
  smoke?: 'own' | 'sea';
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

/** Swap the axes of a 100×32 path so the bow points up in a 32×100 box. */
function upright(d: string): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+/g);
  if (!tokens) return d;
  let i = 0;
  let out = '';
  const num = () => tokens[i++]!;
  while (i < tokens.length) {
    const cmd = tokens[i++]!;
    if (cmd === 'Z' || cmd === 'z') {
      out += 'Z';
      continue;
    }
    if (cmd === 'H') {
      out += `V${num()}`;
      continue;
    }
    if (cmd === 'V') {
      out += `H${num()}`;
      continue;
    }
    const pairs = cmd === 'C' ? 3 : 1;
    out += cmd;
    for (let p = 0; p < pairs; p++) {
      const x = num();
      const y = num();
      out += ` ${y} ${x}`;
    }
  }
  return out;
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
  smoke = 'sea',
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
                {hull.sunk && <HullSmoke />}
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
            {cells.map((mark, cell) => {
              const show =
                smoke === 'own'
                  ? covered.has(cell) && (mark === 'hit' || mark === 'sunk')
                  : mark === 'hit';
              if (!show) return null;
              return (
                <span key={`smoke-${cell}`} className="bs-smoke" style={atCell(cell, 0)}>
                  <Wisp />
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
  const horizontal = dir === 'h';
  const draw = (d: string) => (horizontal ? d : upright(d));
  return (
    <svg
      className="bs-hull__shape"
      viewBox={horizontal ? '0 0 100 32' : '0 0 32 100'}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={draw(HULL_H[id])} />
      {HULL_LINES[id]?.map((line) => (
        <path key={line} className="bs-hull__line" d={draw(line)} />
      ))}
    </svg>
  );
}

/**
 * A printed plan of a small aircraft. It flies across the chart and the peg drops after it.
 * Ink and the sea colour only. It is not a hull, so it never shows where a ship is hiding.
 */
function Plane() {
  return (
    <svg viewBox="0 0 80 36">
      <path d="M4 18 C8 14 14 12 22 12 H44 L56 5 H64 L52 12 H70 C75 12 78 15 78 18 C78 21 75 24 70 24 H52 L64 31 H56 L44 24 H22 C14 24 8 22 4 18 Z" />
      <path className="bs-plane__line" d="M30 13 V23 M46 9 V27 M58 18 H70" />
    </svg>
  );
}

/** Wisps along a sunk hull. The ship is already drawn, so the smoke may follow it. */
function HullSmoke() {
  return (
    <span className="bs-hull__smoke" aria-hidden="true">
      <Wisp />
      <Wisp />
      <Wisp />
    </span>
  );
}

/** A few ink wisps. Stroke only, no blur. */
function Wisp() {
  return (
    <svg viewBox="0 0 20 28" aria-hidden="true">
      <path d="M6 26C6 18 10 16 10 10C10 6 8 4 8 2" />
      <path d="M13 26C13 20 16 18 16 12C16 8 14 6 14 3" />
      <path d="M9 24C9 19 11 17 11 13" />
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
