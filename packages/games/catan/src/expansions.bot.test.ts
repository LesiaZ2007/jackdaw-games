import { createRng, type BotLevel, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { legalMoves, timeUp } from './bot';
import { EXPANSIONS, catan, type CatanOptions, type CatanState } from './rules';
import { start } from './testkit';

const game = catan;
const NAMES = ['wren', 'rook', 'magpie', 'robin', 'finch'];

/** Plays as the platform does: the first bot with a move makes it; timers fire when none has. */
function playOut(
  players: string[],
  options: Partial<CatanOptions>,
  seed: number,
  level: BotLevel,
  cap: number,
) {
  let s = start(players, options, seed);
  const rng: Rng = createRng(seed * 31 + 7);
  let moves = 0;
  let now = 0;
  while (s.phase !== 'over' && moves < cap) {
    now += 1100;
    let moved = false;
    for (const pid of s.seats) {
      const a = game.bot!({
        playerId: pid,
        playerIds: s.seats,
        view: game.getPlayerView(s, pid),
        tableView: game.getTableView(s),
        rng,
        now,
        level,
      });
      if (!a) continue;
      s = game.applyAction(s, pid, game.actionSchema.parse(a), rng, now);
      moved = true;
      break;
    }
    if (!moved) {
      const t = game.nextTimer?.(s);
      if (!t) throw new Error(`stalled in ${s.phase}, round ${s.round}`);
      now = Math.max(now, t.at);
      s = game.onTimer!(s, t.id, rng, now);
    }
    moves++;
  }
  return { s, moves };
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

describe('bots with the expansions', () => {
  for (const expansion of EXPANSIONS)
    for (const n of [3, 4, 5])
      for (const level of LEVELS)
        it(`${n} ${level} bots finish ${expansion}`, () => {
          const { s, moves } = playOut(NAMES.slice(0, n), { expansion }, n * 7 + 1, level, 9000);
          expect(s.phase, `after ${moves} moves, round ${s.round}`).toBe('over');
          expect(game.getResult(s)).not.toBe(null);
        }, 60_000);

  it('uses the expansion pieces over a game', () => {
    const seen = new Set<string>();
    for (const expansion of EXPANSIONS)
      for (const seed of [2, 5, 7, 11]) {
        let s = start(NAMES.slice(0, 4), { expansion }, seed);
        const rng = createRng(seed);
        for (let i = 0; i < 6000 && s.phase !== 'over'; i++) {
          for (const pid of s.seats) {
            const a = game.bot!({
              playerId: pid,
              playerIds: s.seats,
              view: game.getPlayerView(s, pid),
              tableView: game.getTableView(s),
              rng,
              now: i * 1100,
              level: 'hard',
            });
            if (!a) continue;
            seen.add(a.type === 'build' ? `build:${a.kind}` : a.type);
            s = game.applyAction(s, pid, a, rng, i * 1100);
            break;
          }
        }
      }
    for (const k of ['build:ship', 'build:knight', 'improve', 'activate', 'progress', 'pirate'])
      expect(seen.has(k), `never played ${k}; saw ${[...seen].join(', ')}`).toBe(true);
  }, 120_000);
});

describe('legal moves with the expansions', () => {
  for (const expansion of EXPANSIONS)
    it(`every listed move is accepted (${expansion})`, () => {
      for (const seed of [3, 11]) {
        let s = start(NAMES.slice(0, 4), { expansion }, seed);
        const rng = createRng(seed);
        for (let step = 0; step < 900 && s.phase !== 'over'; step++) {
          const pid = rng.pick(game.waitingOn!(s));
          const moves = legalMoves(s, pid);
          expect(moves.length, `${s.phase}`).toBeGreaterThan(0);
          for (const m of moves)
            expect(
              () => game.applyAction(s, pid, game.actionSchema.parse(m), createRng(step), 0),
              `${s.phase}: ${JSON.stringify(m)}`,
            ).not.toThrow();
          // Mostly play on from the bots' view of the game, so the sample reaches late positions.
          const bot =
            step % 3 === 0
              ? rng.pick(moves)
              : (game.bot!({
                  playerId: pid,
                  playerIds: s.seats,
                  view: game.getPlayerView(s, pid),
                  tableView: game.getTableView(s),
                  rng,
                  now: step * 1100,
                  level: 'hard',
                }) ?? rng.pick(moves));
          s = game.applyAction(s, pid, bot, rng, step * 1100);
        }
      }
    }, 120_000);

  for (const expansion of EXPANSIONS)
    it(`the turn timer finishes every step (${expansion})`, () => {
      let s: CatanState = start(NAMES.slice(0, 3), { expansion }, 4);
      const rng = createRng(4);
      for (let i = 0; i < 1200 && s.phase !== 'over'; i++) s = timeUp(s, rng);
      expect(s.phase === 'over' || s.round > 5).toBe(true);
    }, 60_000);
});
