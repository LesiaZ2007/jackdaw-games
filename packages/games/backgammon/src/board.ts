/**
 * The board and how a checker may move, shared by the rules, the bot and the screens.
 *
 * Points are numbered 1 to 24 the way Ivory (side 0) counts them: Ivory moves from 24 down to 1
 * and bears off past 1, with its home board on points 1 to 6. Ebony (side 1) moves the other way,
 * so its home board is points 19 to 24. `points[i]` holds point i + 1: positive for Ivory's
 * checkers, negative for Ebony's.
 *
 * Moves are written in the mover's own count, a "pip": pip 1 is the deepest point of their
 * home board, pip 24 their farthest point, pip 25 the bar, and pip 0 borne off.
 */

export type Side = 0 | 1;

export const CHECKERS = 15;
export const BAR = 25;

export interface Position {
  /** Point 1..24 at index 0..23. Positive: Ivory. Negative: Ebony. */
  points: number[];
  /** Checkers on the bar, by side. */
  bar: [number, number];
  /** Checkers borne off, by side. */
  off: [number, number];
}

/** One checker moved by one die. `from` is the mover's pip (25 for the bar). */
export interface Step {
  from: number;
  die: number;
}

/** A step as it happened, in the mover's pips (`to` 0 is borne off). */
export interface PlayedStep {
  from: number;
  to: number;
  die: number;
  hit: boolean;
}

export function other(side: Side): Side {
  return side === 0 ? 1 : 0;
}

/** The board point (1..24) for a side's pip (1..24). */
export function pointOf(side: Side, pip: number): number {
  return side === 0 ? pip : 25 - pip;
}

/** The side's pip for a board point (1..24). The same sum both ways. */
export const pipOf = pointOf;

/** Checkers of `side` on its pip: positive for its own, negative for the opponent's. */
export function at(pos: Position, side: Side, pip: number): number {
  const v = pos.points[pointOf(side, pip) - 1] ?? 0;
  return side === 0 ? v : -v;
}

export function startPosition(): Position {
  const points = Array.from({ length: 24 }, () => 0);
  const lay = (pip: number, n: number) => {
    points[pointOf(0, pip) - 1]! += n;
    points[pointOf(1, pip) - 1]! -= n;
  };
  lay(24, 2);
  lay(13, 5);
  lay(8, 3);
  lay(6, 5);
  return { points, bar: [0, 0], off: [0, 0] };
}

function clone(pos: Position): Position {
  return {
    points: pos.points.slice(),
    bar: [pos.bar[0], pos.bar[1]],
    off: [pos.off[0], pos.off[1]],
  };
}

/** Every checker of `side` is in its home board (none on the bar or outside). */
export function allHome(pos: Position, side: Side): boolean {
  if (pos.bar[side] > 0) return false;
  for (let pip = 7; pip <= 24; pip++) if (at(pos, side, pip) > 0) return false;
  return true;
}

/** How far `side` still has to travel: the classic pip count. */
export function pipCount(pos: Position, side: Side): number {
  let n = pos.bar[side] * BAR;
  for (let pip = 1; pip <= 24; pip++) {
    const c = at(pos, side, pip);
    if (c > 0) n += c * pip;
  }
  return n;
}

/** Whether one checker of `side` may move from `from` by `die`. */
export function canStep(pos: Position, side: Side, from: number, die: number): boolean {
  if (!Number.isInteger(die) || die < 1 || die > 6) return false;
  if (pos.bar[side] > 0) {
    if (from !== BAR) return false;
    return at(pos, side, BAR - die) >= -1;
  }
  if (!Number.isInteger(from) || from < 1 || from > 24) return false;
  if (at(pos, side, from) <= 0) return false;
  const to = from - die;
  if (to >= 1) return at(pos, side, to) >= -1;
  if (!allHome(pos, side)) return false;
  if (to === 0) return true;
  // Bearing off with a die larger than needed: only from the highest occupied point.
  for (let pip = from + 1; pip <= 6; pip++) if (at(pos, side, pip) > 0) return false;
  return true;
}

/** Plays one step that `canStep` allowed. Does not mutate `pos`. */
export function playStep(
  pos: Position,
  side: Side,
  step: Step,
): { pos: Position; played: PlayedStep } {
  const next = clone(pos);
  const sign = side === 0 ? 1 : -1;
  if (step.from === BAR) next.bar[side] -= 1;
  else next.points[pointOf(side, step.from) - 1]! -= sign;
  const to = Math.max(0, step.from - step.die);
  let hit = false;
  if (to === 0) next.off[side] += 1;
  else {
    const idx = pointOf(side, to) - 1;
    if (at(next, side, to) === -1) {
      next.points[idx] = 0;
      next.bar[other(side)] += 1;
      hit = true;
    }
    next.points[idx]! += sign;
  }
  return { pos: next, played: { from: step.from, to, die: step.die, hit } };
}

/** The dice to play: four of a doublet, otherwise the two. */
export function pool(dice: readonly [number, number]): number[] {
  return dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
}

/** Pips `side` could move from: the bar while it has checkers there, else every own point. */
function sources(pos: Position, side: Side): number[] {
  if (pos.bar[side] > 0) return [BAR];
  const out: number[] = [];
  for (let pip = 24; pip >= 1; pip--) if (at(pos, side, pip) > 0) out.push(pip);
  return out;
}

function without(dice: readonly number[], die: number): number[] {
  const i = dice.indexOf(die);
  return i < 0 ? dice.slice() : [...dice.slice(0, i), ...dice.slice(i + 1)];
}

/**
 * Every complete legal turn for these dice: as many dice as can be played, and when only one of
 * two different dice can be played, the larger one if it can. Doublets are listed with their
 * steps from the farthest checker first, so each turn appears once. An empty list means the
 * side cannot move.
 */
export function legalTurns(pos: Position, side: Side, dice: readonly [number, number]): Step[][] {
  const double = dice[0] === dice[1];
  const found: Step[][] = [];
  const walk = (p: Position, left: number[], path: Step[], ceiling: number) => {
    let moved = false;
    for (const die of [...new Set(left)]) {
      for (const from of sources(p, side)) {
        if (double && from > ceiling) continue;
        if (!canStep(p, side, from, die)) continue;
        moved = true;
        const step = { from, die };
        walk(playStep(p, side, step).pos, without(left, die), [...path, step], from);
      }
    }
    if (!moved && path.length > 0) found.push(path);
  };
  walk(pos, pool(dice), [], BAR);
  if (found.length === 0) return [];
  const most = Math.max(...found.map((t) => t.length));
  let turns = found.filter((t) => t.length === most);
  if (most === 1 && !double) {
    const high = Math.max(dice[0], dice[1]);
    if (turns.some((t) => t[0]!.die === high)) turns = turns.filter((t) => t[0]!.die === high);
  }
  // Two orders of the same two dice can land the same; keep each distinct sequence once.
  const seen = new Set<string>();
  return turns.filter((t) => {
    const key = t.map((s) => `${s.from}/${s.die}`).join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The most dice `side` can play with these dice (0 when it is shut out). */
export function mostDice(pos: Position, side: Side, dice: readonly [number, number]): number {
  return mostFromPool(pos, side, pool(dice));
}

/** The most of these dice `side` can still play, in any order. */
export function mostFromPool(pos: Position, side: Side, dice: readonly number[]): number {
  const target = dice.length;
  const double = dice.every((d) => d === dice[0]);
  let best = 0;
  const walk = (p: Position, left: number[], depth: number, ceiling: number): boolean => {
    if (depth > best) best = depth;
    if (best === target) return true;
    for (const die of [...new Set(left)]) {
      for (const from of sources(p, side)) {
        if (double && from > ceiling) continue;
        if (!canStep(p, side, from, die)) continue;
        const next = playStep(p, side, { from, die }).pos;
        if (walk(next, without(left, die), depth + 1, from)) return true;
      }
    }
    return false;
  };
  walk(pos, dice.slice(), 0, BAR);
  return best;
}

/**
 * For a turn being played one checker at a time (the phone's draft): the single steps that can
 * come next and still finish a legal turn, in any order. `played` are the steps already made
 * from `start`. Empty once the turn is complete.
 */
export function nextSteps(
  start: Position,
  side: Side,
  dice: readonly [number, number],
  played: readonly Step[],
): Step[] {
  let pos = start;
  let left = pool(dice);
  for (const step of played) {
    pos = playStep(pos, side, step).pos;
    left = without(left, step.die);
  }
  const most = mostDice(start, side, dice);
  const need = most - played.length;
  if (need <= 0) return [];
  const out: Step[] = [];
  for (const die of [...new Set(left)]) {
    for (const from of sources(pos, side)) {
      if (!canStep(pos, side, from, die)) continue;
      if (
        mostFromPool(playStep(pos, side, { from, die }).pos, side, without(left, die)) !==
        need - 1
      ) {
        continue;
      }
      out.push({ from, die });
    }
  }
  if (most === 1 && dice[0] !== dice[1]) {
    const high = Math.max(dice[0], dice[1]);
    if (out.some((s) => s.die === high)) return out.filter((s) => s.die === high);
  }
  return out;
}

/** The dice still to play after these steps. */
export function diceLeft(dice: readonly [number, number], played: readonly Step[]): number[] {
  let left = pool(dice);
  for (const step of played) left = without(left, step.die);
  return left;
}

/**
 * Checks a whole turn and plays it. Returns why it is not legal as a string, or the new position
 * and what happened. A turn must play as many dice as possible, and the larger die when only one
 * of two can be played.
 */
export function playTurn(
  pos: Position,
  side: Side,
  dice: readonly [number, number],
  steps: readonly Step[],
): { pos: Position; played: PlayedStep[] } | string {
  let left = pool(dice);
  let p = pos;
  const played: PlayedStep[] = [];
  for (const step of steps) {
    if (!left.includes(step.die)) return `There is no ${step.die} left to play.`;
    if (!canStep(p, side, step.from, step.die)) {
      if (p.bar[side] > 0 && step.from !== BAR) return 'Enter from the bar first.';
      return 'That checker cannot move there.';
    }
    const r = playStep(p, side, step);
    p = r.pos;
    played.push(r.played);
    left = without(left, step.die);
  }
  const most = mostDice(pos, side, dice);
  if (steps.length < most) {
    return most - steps.length === 1
      ? 'Play one more die.'
      : `Play ${most - steps.length} more dice.`;
  }
  if (most === 1 && dice[0] !== dice[1]) {
    const high = Math.max(dice[0], dice[1]);
    if (steps[0]!.die !== high && legalTurns(pos, side, dice).every((t) => t[0]!.die === high)) {
      return `Only one die can be played, so it must be the ${high}.`;
    }
  }
  return { pos: p, played };
}

/** How a finished game counts: 1 single, 2 gammon, 3 backgammon. */
export function winKind(pos: Position, winner: Side): 1 | 2 | 3 {
  const loser = other(winner);
  if (pos.off[loser] > 0) return 1;
  if (pos.bar[loser] > 0) return 3;
  // The loser still has a checker in the winner's home board (the loser's pips 19..24).
  for (let pip = 19; pip <= 24; pip++) if (at(pos, loser, pip) > 0) return 3;
  return 2;
}
