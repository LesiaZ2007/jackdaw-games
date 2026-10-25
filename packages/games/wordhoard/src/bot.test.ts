import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { checkPlay, emptyBoard, type Board } from './board';
import { findPlays } from './bot';
import { wordhoard as game, type WordhoardOptions, type WordhoardState } from './rules';
import { isWord } from './words';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** Plays an all-bot table to the end, asking each seat the game waits on, as the platform does. */
function playOut(n: number, seed: number, options: WordhoardOptions, times: number[]) {
  const playerIds = ids(n);
  const rng = createRng(seed);
  let now = 0;
  let s: WordhoardState = game.setup({ playerIds, options, rng, now });
  let moves = 0;
  while (!s.over) {
    let moved = false;
    for (const id of game.waitingOn!(s)) {
      const t0 = performance.now();
      const action = game.bot!({
        playerId: id,
        playerIds,
        view: game.getPlayerView(s, id),
        tableView: game.getTableView(s),
        rng,
        now,
        level: 'hard' as const,
      });
      times.push(performance.now() - t0);
      if (!action) continue;
      now += 1000;
      const next = game.applyAction(s, id, action, rng, now);
      expect(next).not.toBe(s);
      s = next;
      moves++;
      moved = true;
      break;
    }
    if (!moved) {
      // Nobody moved: only a turn timer could move the game on.
      const timer = game.nextTimer!(s);
      expect(timer).not.toBe(null);
      s = game.onTimer!(s, timer!.id, rng, timer!.at);
    }
    if (moves > 400) throw new Error('No end in sight');
  }
  return { s, moves };
}

describe('the bot', () => {
  it('plays all-bot tables to the end, quickly', () => {
    // Build the letter tree once, outside the timings (a server does this on its first bot turn).
    findPlays(emptyBoard(), ['A', 'B']);
    const times: number[] = [];
    const tables: [number, WordhoardOptions][] = [
      [2, { pairs: 'Past four players', turnTimer: 'Off' }],
      [3, { pairs: 'Always', turnTimer: '1 minute' }],
      [4, { pairs: 'Past four players', turnTimer: 'Off' }],
      [8, { pairs: 'Past four players', turnTimer: '2 minutes' }],
    ];
    let total = 0;
    let games = 0;
    for (const [n, options] of tables)
      for (let seed = 1; seed <= 3; seed++) {
        const { s, moves } = playOut(n, seed * 31 + n, options, times);
        const result = game.getResult(s)!;
        expect(result).not.toBe(null);
        expect(moves).toBeLessThan(200);
        total += Math.max(...Object.values(s.scores));
        games++;
      }
    // It plays real words, not just passes: a winning score well past a hundred on average.
    expect(total / games).toBeGreaterThan(150);
    expect(median(times)).toBeLessThan(50);
  }, 60_000);

  it('finds the best opening and only legal words', () => {
    const plays = findPlays(emptyBoard(), [...'QUIZEST']);
    expect(plays.length).toBeGreaterThan(0);
    for (const p of plays) {
      const check = checkPlay(emptyBoard(), p.tiles);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.score).toBe(p.score);
        for (const w of check.words) expect(isWord(w.word)).toBe(true);
      }
    }
    // The best opening uses the Q or the Z on the double word.
    expect(plays[0]!.score).toBeGreaterThanOrEqual(44);
    expect(plays[0]!.tiles.some((t) => t.letter === 'Q' || t.letter === 'Z')).toBe(true);
  });

  it('scores cross words and hooks like the rules do', () => {
    const board: Board = emptyBoard();
    for (const [i, l] of [...'HOARD'].entries()) board[7]![5 + i] = { letter: l };
    const plays = findPlays(board, [...'SEATING'.replace('G', '?')]);
    expect(plays.length).toBeGreaterThan(0);
    for (const p of plays) {
      const check = checkPlay(board, p.tiles);
      expect(check.ok).toBe(true);
      if (check.ok) {
        expect(check.score).toBe(p.score);
        for (const w of check.words) expect(isWord(w.word)).toBe(true);
      }
    }
  });

  it('waits when it is not its turn, and swaps when it has nothing', () => {
    const playerIds = ids(2);
    const rng = createRng(5);
    const s = game.setup({
      playerIds,
      options: { pairs: 'Past four players', turnTimer: 'Off' },
      rng,
      now: 0,
    });
    const other = playerIds.find((id) => id !== s.turn)!;
    const ctx = (st: WordhoardState, id: string) => ({
      playerId: id,
      playerIds,
      view: game.getPlayerView(st, id),
      tableView: game.getTableView(st),
      rng,
      now: 0,
      level: 'hard' as const,
    });
    expect(game.bot!(ctx(s, other))).toBe(null);
    const stuck = { ...s, racks: { ...s.racks, [s.turn]: [...'QQXZJVV'] } };
    expect(game.bot!(ctx(stuck, s.turn))?.type).toBe('swap');
    const late = { ...stuck, bag: stuck.bag.slice(0, 3) };
    expect(game.bot!(ctx(late, s.turn))).toEqual({ type: 'pass' });
  });
});

describe('partialResult', () => {
  const start = () =>
    game.setup({
      playerIds: ids(3),
      options: { pairs: 'Past four players', turnTimer: 'Off' },
      rng: createRng(1),
      now: 0,
    });

  it('is null before anyone scores', () => {
    expect(game.partialResult!(start())).toBe(null);
  });

  it('gives the win to the highest score so far, and shares a tie', () => {
    const s = start();
    const lead = game.partialResult!({ ...s, scores: { p0: 10, p1: 24, p2: 3 } })!;
    expect(lead.winners).toEqual(['p1']);
    expect(lead.standings!.map((x) => x.outcome)).toEqual(['loss', 'win', 'loss']);
    expect(lead.summary).toMatch(/^24 points/);
    const tie = game.partialResult!({ ...s, scores: { p0: 24, p1: 24, p2: 3 } })!;
    expect(tie.winners).toEqual(['p0', 'p1']);
    expect(tie.standings!.map((x) => x.outcome)).toEqual(['draw', 'draw', 'loss']);
  });
});
