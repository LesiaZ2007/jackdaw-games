import type { Rng } from '@jackdaw/engine';

/** The sea is 10 by 10. A cell is `row * 10 + column`, A1 at 0. */
export const GRID = 10;
export const CELLS = GRID * GRID;

export const SHIPS = [
  { id: 'carrier', name: 'Carrier', len: 5 },
  { id: 'battleship', name: 'Battleship', len: 4 },
  { id: 'cruiser', name: 'Cruiser', len: 3 },
  { id: 'submarine', name: 'Submarine', len: 3 },
  { id: 'destroyer', name: 'Destroyer', len: 2 },
] as const;

export type ShipId = (typeof SHIPS)[number]['id'];
export type Dir = 'h' | 'v';

/** A ship as a player lays it: the bow (top or left cell) and the way it points. */
export interface Placement {
  id: ShipId;
  dir: Dir;
  at: number;
}

export const SHIP_IDS = SHIPS.map((s) => s.id) as [ShipId, ...ShipId[]];

export function shipOf(id: ShipId) {
  const spec = SHIPS.find((s) => s.id === id);
  if (!spec) throw new Error(`unknown ship ${id}`);
  return spec;
}

/** "C4" for cell 23. Columns A–J, rows 1–10. */
export function cellName(cell: number): string {
  const col = cell % GRID;
  const row = Math.floor(cell / GRID);
  return `${'ABCDEFGHIJ'[col] ?? '?'}${row + 1}`;
}

/** The cells a ship covers, or null if it would leave the chart. */
export function span(at: number, dir: Dir, len: number): number[] | null {
  if (!Number.isInteger(at) || at < 0 || at >= CELLS) return null;
  const row = Math.floor(at / GRID);
  const col = at % GRID;
  const cells: number[] = [];
  for (let i = 0; i < len; i++) {
    const r = dir === 'v' ? row + i : row;
    const c = dir === 'h' ? col + i : col;
    if (r >= GRID || c >= GRID) return null;
    cells.push(r * GRID + c);
  }
  return cells;
}

/** Why this fleet can't be laid, or null when it is the classic five, on the chart, not overlapping. */
export function fleetError(ships: readonly Placement[]): string | null {
  if (ships.length !== SHIPS.length) return 'Place all five ships.';
  const seen = new Set<ShipId>();
  const taken = new Set<number>();
  for (const ship of ships) {
    if (seen.has(ship.id)) return 'Each ship is laid once.';
    seen.add(ship.id);
    const cells = span(ship.at, ship.dir, shipOf(ship.id).len);
    if (!cells) return `${shipOf(ship.id).name} hangs off the chart.`;
    if (cells.some((c) => taken.has(c))) return "Ships can't share a square.";
    for (const c of cells) taken.add(c);
  }
  if (seen.size !== SHIPS.length) return 'Place all five ships.';
  return null;
}

/** A legal fleet, ships in the printed order. Touching is allowed. */
export function dealFleet(rng: Rng): Placement[] {
  const taken = new Set<number>();
  const out: Placement[] = [];
  for (const spec of SHIPS) {
    const options: Placement[] = [];
    for (let at = 0; at < CELLS; at++) {
      for (const dir of ['h', 'v'] as const) {
        const cells = span(at, dir, spec.len);
        if (cells && cells.every((c) => !taken.has(c))) options.push({ id: spec.id, dir, at });
      }
    }
    if (options.length === 0) throw new Error('no room for the fleet');
    const pick = rng.pick(options);
    for (const c of span(pick.at, pick.dir, spec.len) ?? []) taken.add(c);
    out.push(pick);
  }
  return out;
}
