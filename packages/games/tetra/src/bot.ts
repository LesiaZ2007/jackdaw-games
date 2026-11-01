import { botChoose, type BotContext, type BotLevel } from '@jackdaw/engine';
import type { TetraAction, TetraPlayerView, TetraTableView } from './rules';
import {
  H,
  W,
  afterUse,
  cellsOf,
  dropped,
  draw,
  fits,
  holdSwap,
  lockPiece,
  spawn,
  type Incoming,
  type Kind,
  type Piece,
  type Stack,
  type Used,
} from './sim';

/**
 * A computer player that runs its own well like a phone would, a few stones at a time, and
 * reports it with a tick. Each stone goes where a classic stacking score likes best: low,
 * flat, no holes, lines cleared (fours when the stack is safe). Speed and care come from the
 * level; Hard can also hold a stone back.
 */

const PPS: Record<BotLevel, number> = { easy: 0.8, normal: 1.3, hard: 2.1 };
const MAX_PER_CALL = 6;
const SPRINT_LINES = 40;

interface Candidate {
  piece: Piece;
  stack: Stack;
  owed: Incoming[];
  used: Used;
  /** The stone that was current when this was chosen (for hold). */
  held: boolean;
  score: number;
}

function heights(well: string): number[] {
  const hs: number[] = [];
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H && well[y * W + x] === '.') y++;
    hs.push(H - y);
  }
  return hs;
}

function holesOf(well: string): number {
  let holes = 0;
  for (let x = 0; x < W; x++) {
    let seen = false;
    for (let y = 0; y < H; y++) {
      if (well[y * W + x] !== '.') seen = true;
      else if (seen) holes++;
    }
  }
  return holes;
}

function evaluate(before: Stack, after: Stack, lines: number, attack: number): number {
  if (after.topped) return -1e6;
  const hs = heights(after.well);
  const total = hs.reduce((a, h) => a + h, 0);
  const max = Math.max(...hs);
  let bump = 0;
  for (let i = 1; i < W; i++) bump += Math.abs(hs[i]! - hs[i - 1]!);
  const safe = max <= 10;
  let score = -0.51 * total - 0.36 * 3 * holesOf(after.well) - 0.18 * bump;
  if (max > 12) score -= (max - 12) * 4;
  if (max > 16) score -= (max - 16) * 12;
  if (lines > 0) {
    if (lines >= 4) score += safe ? 14 : 7;
    else score += safe ? lines * 0.6 : lines * 2.5;
    score += attack * (safe ? 0.4 : 0.8);
  }
  if (after.perfects > before.perfects) score += 30;
  return score;
}

function placements(
  stack: Stack,
  kind: Kind,
  owed: Incoming[],
  now: number,
  held: boolean,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (let rot = 0 as 0 | 1 | 2 | 3; rot < 4; rot++) {
    const base = spawn(kind);
    for (let x = -2; x < W; x++) {
      const start: Piece = { kind, rot, x, y: base.y };
      if (!fits(stack.well, start)) continue;
      const land = dropped(stack.well, start);
      const key = cellsOf(kind, rot)
        .map(([cx, cy]) => `${land.x + cx},${land.y + cy}`)
        .sort()
        .join(';');
      if (seen.has(key)) continue;
      seen.add(key);
      const cells = land.y - start.y;
      const res = lockPiece(stack, land, { spin: 'none', dropPoints: 2 * cells, owed, now });
      out.push({
        piece: land,
        stack: res.stack,
        owed: afterUse(owed, res.used),
        used: res.used,
        held,
        score: evaluate(stack, res.stack, res.clear.lines, res.clear.attack),
      });
    }
  }
  return out;
}

export function tetraBot(ctx: BotContext<TetraPlayerView, TetraTableView>): TetraAction | null {
  const { view, now, level, rng } = ctx;
  if (view.phase !== 'play' || view.seed === null || !view.stack || view.stack.topped) return null;
  const mine = view.boards.find((b) => b.id === ctx.playerId);
  if (!mine || mine.done) return null;
  if (now < view.startAt) return null;
  const seed = view.seed;

  const until = Math.min(now, view.endsAt ?? now);
  const due = Math.floor(((until - view.startAt) / 1000) * PPS[level]) - view.stack.pieces;
  if (due <= 0) return null;

  let stack = view.stack;
  let owed: Incoming[] = view.owed.map((g) => ({
    id: g.id,
    lines: g.lines,
    hole: g.hole,
    at: g.at,
  }));
  const usedNow = new Map<number, number>();
  let finishMs: number | undefined;
  let placed = 0;

  while (placed < Math.min(due, MAX_PER_CALL) && !stack.topped) {
    const drawn = draw(stack, seed);
    let cands = fits(drawn.stack.well, spawn(drawn.kind))
      ? placements(drawn.stack, drawn.kind, owed, now, false)
      : [];
    if (level === 'hard') {
      const swapped = holdSwap(drawn.stack, drawn.kind, seed);
      if (fits(swapped.stack.well, spawn(swapped.kind))) {
        cands = cands.concat(placements(swapped.stack, swapped.kind, owed, now, true));
      }
    }
    if (cands.length === 0) {
      stack = { ...drawn.stack, topped: true };
      break;
    }
    cands.sort((a, b) => b.score - a.score);
    // In trouble, every stone goes to the best spot; otherwise a lower level may settle.
    const careful = Math.max(...heights(stack.well)) > 9;
    const pick = careful ? cands[0]! : botChoose(cands.slice(0, 6), (c) => c.score, level, rng);
    stack = pick.stack;
    owed = pick.owed;
    for (const u of pick.used) usedNow.set(u.id, (usedNow.get(u.id) ?? 0) + u.n);
    placed++;
    if (view.mode === 'sprint' && stack.lines >= SPRINT_LINES) {
      finishMs = Math.round(((view.stack.pieces + placed) / PPS[level]) * 1000);
      break;
    }
  }
  if (placed === 0 && !stack.topped) return null;

  const used: [number, number][] = view.owed
    .filter((g) => usedNow.has(g.id))
    .map((g) => [g.id, g.used + usedNow.get(g.id)!]);
  return {
    type: 'tick',
    round: view.round,
    stack,
    used,
    ...(finishMs !== undefined ? { finishMs } : {}),
  };
}
