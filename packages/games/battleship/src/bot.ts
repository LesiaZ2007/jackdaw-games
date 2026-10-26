import { botChoose, botSlips, type BotContext, type BotLevel, type Rng } from '@jackdaw/engine';
import { CELLS, dealFleet, GRID } from './fleet';
import type { BattleshipAction, BattleshipPlayerView, BattleshipTableView, Mark } from './rules';

/**
 * A computer opponent that only sees its own chart (2026-10-24: a bot plays from that seat's
 * view). It lays a random legal fleet, with water between the ships, then hunts: squares
 * next to a hit that has not sunk a ship come first, especially the ends of a line of hits,
 * and otherwise it searches a checkerboard, since every ship is at least two squares.
 * Below Hard it sometimes just guesses.
 */

export function battleshipBot(
  ctx: BotContext<BattleshipPlayerView, BattleshipTableView>,
): BattleshipAction | null {
  const { view, playerId, rng, level } = ctx;
  if (!view.players.includes(playerId)) return null;
  if (view.phase === 'place') {
    if (view.ready) return null;
    return { type: 'place', ships: dealFleet(rng) };
  }
  if (view.phase !== 'fire' || view.toAct !== playerId) return null;
  const foe = view.players.find((id) => id !== playerId);
  if (!foe) return null;
  const sea = view.boards[foe]?.cells;
  if (!sea) return null;
  return { type: 'fire', cells: aim(sea, view.salvo, rng, level) };
}

function unknowns(sea: readonly Mark[]): number[] {
  const open: number[] = [];
  for (let cell = 0; cell < CELLS; cell++) if (sea[cell] === 'blank') open.push(cell);
  return open;
}

function wounded(sea: readonly Mark[]): Set<number> {
  const hits = new Set<number>();
  for (let cell = 0; cell < CELLS; cell++) if (sea[cell] === 'hit') hits.add(cell);
  return hits;
}

function sameLine(a: number, b: number, step: number): boolean {
  if (step === GRID) return Math.abs(a - b) % GRID === 0;
  return Math.floor(a / GRID) === Math.floor(b / GRID);
}

/** How promising a blank square is, from this chart alone. */
function score(cell: number, hits: Set<number>): number {
  let n = (Math.floor(cell / GRID) + (cell % GRID)) % 2 === 0 ? 4 : 1;
  for (const step of [1, GRID]) {
    for (const dir of [-1, 1] as const) {
      const next = cell + dir * step;
      if (next < 0 || next >= CELLS || !sameLine(cell, next, step) || !hits.has(next)) continue;
      n += 36;
      const beyond = next + dir * step;
      if (beyond >= 0 && beyond < CELLS && sameLine(next, beyond, step) && hits.has(beyond))
        n += 24;
    }
  }
  return n;
}

function aim(sea: readonly Mark[], need: number, rng: Rng, level: BotLevel): number[] {
  const open = unknowns(sea);
  const count = Math.min(need, open.length);
  if (count === 0) return [];
  if (botSlips(level, rng)) return rng.shuffle(open).slice(0, count);
  const hits = wounded(sea);
  const picked: number[] = [];
  let left = open;
  for (let i = 0; i < count && left.length > 0; i++) {
    const choice = botChoose(left, (cell) => score(cell, hits), level, rng);
    picked.push(choice);
    left = left.filter((cell) => cell !== choice);
  }
  return picked;
}
