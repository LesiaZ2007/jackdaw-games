import { botChoose, type BotContext, type BotLevel } from '@jackdaw/engine';
import {
  BAR,
  at,
  legalTurns,
  other,
  pipCount,
  playStep,
  type Position,
  type Side,
  type Step,
} from './board';
import type { BackgammonAction, BackgammonPlayerView, BackgammonTableView } from './rules';

/**
 * A computer opponent that plays from the board in front of it (everything in backgammon is
 * public). It lists every distinct position its roll can reach and scores each with a cheap
 * count over the 24 points: the race, blots weighted by the shots the opponent would have at
 * them, made points (home board, the 5, 4 and bar points, anchors) and primes, hits and checkers
 * on the bar, and checkers borne off. Once the armies have passed each other it only races.
 * It offers the cube when well ahead and takes unless clearly behind. Easy never doubles.
 */

/** Whether any of `side`'s checkers still has an opposing checker to get past. */
function inContact(pos: Position, side: Side): boolean {
  const foe = other(side);
  // Highest of mine in my own pips; the foe's lowest in my pips (the bar counts as 0).
  let mine = pos.bar[side] > 0 ? BAR : 0;
  for (let pip = 24; pip >= 1 && mine === 0; pip--) if (at(pos, side, pip) > 0) mine = pip;
  if (mine === 0) return false;
  if (pos.bar[foe] > 0) return true;
  for (let j = 24; j >= 1; j--) if (at(pos, foe, j) > 0) return 25 - j < mine;
  return false;
}

/** How good the arrangement of `side`'s checkers is, in rough pips. Foe shots count against blots. */
function structure(pos: Position, side: Side, contact: boolean): number {
  const foe = other(side);
  const mine: number[] = [0];
  const theirs: number[] = [pos.bar[foe]]; // the foe's checkers by my pip; the bar sits at 0
  for (let pip = 1; pip <= 24; pip++) {
    mine.push(Math.max(0, at(pos, side, pip)));
    theirs.push(Math.max(0, at(pos, foe, 25 - pip)));
  }
  let score = pos.off[side] * 3 - pos.bar[side] * 8;
  if (!contact) return score;

  let run = 0;
  let best = 0;
  for (let pip = 1; pip <= 24; pip++) {
    const n = mine[pip]!;
    if (n >= 2) {
      score += 2;
      if (pip <= 6) score += 3;
      if (pip === 4 || pip === 5 || pip === 7) score += 2;
      if (pip >= 20 && pip <= 21) score += 3; // a good anchor
      if (n > 3) score -= 1.5 * (n - 3);
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
      if (n === 1) {
        let risk = 0;
        for (let b = Math.max(0, pip - 12); b < pip; b++) {
          const shooters = theirs[b]!;
          if (shooters > 0) risk += (pip - b <= 6 ? 0.3 : 0.1) * Math.min(shooters, 2);
        }
        score -= Math.min(risk, 0.9) * (33 - pip);
      }
    }
  }
  if (best >= 3) score += best * best * 1.5;

  // The foe on the bar is worth more the more of my home board is closed against it.
  let closed = 0;
  for (let pip = 1; pip <= 6; pip++) if (mine[pip]! >= 2) closed++;
  score += pos.bar[foe] * (12 + closed * 2);
  let foeClosed = 0;
  for (let pip = 19; pip <= 24; pip++) if (theirs[25 - pip]! >= 2) foeClosed++;
  score -= pos.bar[side] * foeClosed * 2;
  return score;
}

/** `side`'s edge over the other in the position, in rough pips. */
function edge(pos: Position, side: Side): number {
  const foe = other(side);
  const race = pipCount(pos, foe) - pipCount(pos, side);
  const contact = inContact(pos, side);
  if (!contact) return race + (pos.off[side] - pos.off[foe]) * 3;
  return race + structure(pos, side, true) - structure(pos, foe, true);
}

function key(pos: Position): string {
  return `${pos.points.join(',')}|${pos.bar.join(',')}|${pos.off.join(',')}`;
}

function bestTurn(
  view: BackgammonPlayerView,
  side: Side,
  dice: readonly [number, number],
  ctx: { rng: BotContext<unknown, unknown>['rng']; level: BotLevel },
): Step[] | null {
  const turns = legalTurns(view.pos, side, dice);
  if (turns.length === 0) return null;
  const seen = new Map<string, { turn: Step[]; pos: Position }>();
  for (const turn of turns) {
    let pos = view.pos;
    for (const step of turn) pos = playStep(pos, side, step).pos;
    const k = key(pos);
    if (!seen.has(k)) seen.set(k, { turn, pos });
  }
  const options = [...seen.values()];
  return botChoose(options, (o) => edge(o.pos, side), ctx.level, ctx.rng).turn;
}

/** The side's lead in the race as a fraction of its own count (negative when behind). */
function raceLead(pos: Position, side: Side): number {
  const mine = pipCount(pos, side);
  return mine === 0 ? 1 : (pipCount(pos, other(side)) - mine) / mine;
}

export function backgammonBot(
  ctx: BotContext<BackgammonPlayerView, BackgammonTableView>,
): BackgammonAction | null {
  const { view, playerId, level } = ctx;
  if (view.side === null || view.toAct !== playerId) return null;
  const side = view.side;

  if (view.phase === 'move' && view.dice) {
    const steps = bestTurn(view, side, view.dice, ctx);
    return steps ? { type: 'move', steps } : null;
  }

  if (view.phase === 'roll') {
    if (view.canDouble && level !== 'easy') {
      const race = !inContact(view.pos, side);
      const lead = raceLead(view.pos, side);
      const good = race
        ? lead >= 0.1 && pipCount(view.pos, other(side)) - pipCount(view.pos, side) >= 8
        : edge(view.pos, side) >= 50;
      if (good) return { type: 'double' };
    }
    return { type: 'roll' };
  }

  if (view.phase === 'double') {
    // The cube is offered to me: judge the position from my side.
    const race = !inContact(view.pos, side);
    const bad = race ? raceLead(view.pos, side) < -0.12 : edge(view.pos, side) < -70;
    return { type: bad ? 'drop' : 'take' };
  }

  return null;
}
