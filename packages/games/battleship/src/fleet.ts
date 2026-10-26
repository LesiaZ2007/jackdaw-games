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

/**
 * True when `cell` is one of `taken`, or shares a side or a corner with one.
 * The water square around a ship is part of what the next ship may not enter.
 */
export function touchesFleet(cell: number, taken: ReadonlySet<number>): boolean {
  const row = Math.floor(cell / GRID);
  const col = cell % GRID;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || c < 0 || r >= GRID || c >= GRID) continue;
      if (taken.has(r * GRID + c)) return true;
    }
  }
  return false;
}

/**
 * Squares a hover would cover, bow at `at`. A ship that hangs off keeps the squares that
 * still lie on the chart, and `illegal` is set. Overlap is illegal, and so is sitting
 * against another ship, even at a corner. This is a placement preview only. It is not a
 * fleet and it is not sent anywhere.
 */
export function aimSquares(
  at: number,
  dir: Dir,
  len: number,
  taken: ReadonlySet<number>,
): { cells: number[]; illegal: boolean } | null {
  if (!Number.isInteger(at) || at < 0 || at >= CELLS) return null;
  const row = Math.floor(at / GRID);
  const col = at % GRID;
  const cells: number[] = [];
  let hung = false;
  for (let i = 0; i < len; i++) {
    const r = dir === 'v' ? row + i : row;
    const c = dir === 'h' ? col + i : col;
    if (r >= GRID || c >= GRID) {
      hung = true;
      break;
    }
    cells.push(r * GRID + c);
  }
  if (cells.length === 0) return null;
  return { cells, illegal: hung || cells.some((cell) => touchesFleet(cell, taken)) };
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

/** Why this fleet can't be laid, or null when it is the classic five, with water between ships. */
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
    if (cells.some((c) => touchesFleet(c, taken))) return 'Leave a water square between ships.';
    for (const c of cells) taken.add(c);
  }
  if (seen.size !== SHIPS.length) return 'Place all five ships.';
  return null;
}

/** Every square a ship of this length could occupy without touching `taken`. */
function openings(id: ShipId, len: number, taken: ReadonlySet<number>): Placement[] {
  const options: Placement[] = [];
  for (let at = 0; at < CELLS; at++) {
    for (const dir of ['h', 'v'] as const) {
      const cells = span(at, dir, len);
      if (cells && cells.every((c) => !touchesFleet(c, taken))) options.push({ id, dir, at });
    }
  }
  return options;
}

/**
 * A legal fleet, ships in the printed order. Each ship keeps a water square around it,
 * including the corners. A dead-end layout is unwound and another bow is tried.
 */
export function dealFleet(rng: Rng): Placement[] {
  const taken = new Set<number>();
  const out: Placement[] = [];
  const lay = (index: number): boolean => {
    if (index === SHIPS.length) return true;
    const spec = SHIPS[index]!;
    for (const pick of rng.shuffle(openings(spec.id, spec.len, taken))) {
      const cells = span(pick.at, pick.dir, spec.len);
      if (!cells) continue;
      for (const c of cells) taken.add(c);
      out.push(pick);
      if (lay(index + 1)) return true;
      out.pop();
      for (const c of cells) taken.delete(c);
    }
    return false;
  };
  if (!lay(0)) throw new Error('no room for the fleet');
  return out;
}
