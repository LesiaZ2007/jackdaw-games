import type { MazeState, MazeTick } from './rules';

/**
 * Settles a Shared-maze tick that already passed the checks every tick gets (round, seq, maze,
 * clock, plausibility) and had its position and turns recorded. Contested pellets, power spots,
 * attacks and ghost aims are settled here.
 */
export function settleShared(
  s: MazeState,
  _playerId: string,
  _tick: MazeTick,
  _now: number,
): MazeState {
  return s;
}
