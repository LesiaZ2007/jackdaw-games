import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZES,
  checkBoard,
  deduce,
  faults,
  makePuzzle,
  MOON,
  neighbours,
  solve,
  SUN,
} from './puzzle';
import {
  answerOf,
  botMarks,
  botSolveMs,
  CLOSE_MS,
  ranking,
  fandango,
  type FandangoState,
} from './rules';
import { clock } from './time';

const answer = answerOf;

function start(
  players: string[],
  board = '6×6',
  puzzles = 3,
  seed = 7,
  hints = true,
): FandangoState {
  return fandango.setup({
    playerIds: players,
    options: { board, puzzles, hints },
    rng: createRng(seed),
    now: 1_000,
  });
}

function solveFor(s: FandangoState, id: string, now: number, seed = 1): FandangoState {
  const index = s.times[id]!.length;
  return fandango.applyAction(
    s,
    id,
    { type: 'solve', puzzle: index, cells: answer(s.puzzles[index]!) },
    createRng(seed),
    now,
  );
}

describe('puzzles', () => {
  it('have exactly one answer, found by reasoning alone', () => {
    for (const size of BOARD_SIZES) {
      const rng = createRng(size * 31);
      for (let i = 0; i < 6; i++) {
        const p = makePuzzle(size, rng);
        const answers = solve(p, 2);
        expect(answers).toHaveLength(1);
        expect(deduce(p)!.cells).toEqual(answers[0]);
        expect(checkBoard(p, answers[0]!)).toBeNull();
        for (const s of p.signs) expect(neighbours(size, s.a)).toContain(s.b);
        const clues = p.given.filter(Boolean).length + p.signs.length;
        expect(clues).toBeGreaterThanOrEqual(Math.round(size * size * 0.3));
      }
    }
  });

  it('come out the same from the same seed', () => {
    expect(makePuzzle(8, createRng(99))).toEqual(makePuzzle(8, createRng(99)));
  });

  it('say why a board is wrong', () => {
    const p = makePuzzle(6, createRng(3));
    const good = answer(p);
    expect(checkBoard(p, good)).toBeNull();
    expect(checkBoard(p, good.slice(1))).toMatch(/Fill every square/);
    const given = p.given.findIndex(Boolean);
    const flipped = good.map((v, i) => (i === given ? 3 - v : v));
    expect(checkBoard(p, flipped)).toMatch(/came filled in/);
    const bare = { ...p, given: p.given.map(() => 0), signs: [] };
    const row = [SUN, SUN, SUN, MOON, MOON, MOON];
    expect(checkBoard(bare, [...row, ...good.slice(6)])).toMatch(/next to each other/);
    const lopsided = [SUN, SUN, MOON, SUN, SUN, MOON];
    expect(checkBoard(bare, [...lopsided, ...good.slice(6)])).toMatch(/as many suns as moons/);
  });

  it('point out squares that break a rule', () => {
    const p = { size: 4, given: Array(16).fill(0), signs: [{ a: 4, b: 5, same: true }] };
    const cells = Array(16).fill(0);
    cells[0] = cells[1] = cells[2] = SUN;
    cells[4] = SUN;
    cells[5] = MOON;
    expect([...faults(p, cells)].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 5]);
  });
});

describe('Fandango', () => {
  it('refuses a wrong board, and one for a puzzle already counted', () => {
    const s = start(['wren', 'rook']);
    expect(() =>
      fandango.applyAction(
        s,
        'wren',
        { type: 'solve', puzzle: 0, cells: [0] },
        createRng(1),
        2_000,
      ),
    ).toThrow(GameError);
    const next = solveFor(s, 'wren', 2_000);
    expect(next.times.wren).toEqual([2_000]);
    expect(() =>
      fandango.applyAction(
        next,
        'wren',
        { type: 'solve', puzzle: 0, cells: answer(s.puzzles[0]!) },
        createRng(1),
        2_500,
      ),
    ).toThrow(/already counted/);
  });

  it('makes the next puzzle when the first player reaches it, the same one for everyone', () => {
    let s = start(['wren', 'rook'], '6×6', 3);
    expect(s.puzzles).toHaveLength(1);
    s = solveFor(s, 'wren', 5_000);
    expect(s.puzzles).toHaveLength(2);
    s = solveFor(s, 'rook', 6_000);
    expect(s.puzzles).toHaveLength(2);
    expect(fandango.getPlayerView(s, 'rook').puzzle).toEqual(
      fandango.getPlayerView(s, 'wren').puzzle,
    );
  });

  it('ends a game alone once every puzzle is solved', () => {
    let s = start(['wren'], '4×4', 2);
    s = solveFor(s, 'wren', 31_000);
    expect(fandango.getResult(s)).toBeNull();
    s = solveFor(s, 'wren', 61_000);
    const result = fandango.getResult(s)!;
    expect(result.winners).toEqual(['wren']);
    expect(result.summary).toBe('Solved 2 puzzles in 1:00');
    expect(result.standings).toEqual([{ playerId: 'wren', outcome: 'win' }]);
  });

  it('gives the rest two minutes once someone has solved them all', () => {
    let s = start(['wren', 'rook', 'finch'], '4×4', 2);
    s = solveFor(s, 'rook', 10_000);
    s = solveFor(s, 'wren', 11_000);
    s = solveFor(s, 'wren', 20_000);
    expect(s.closesAt).toBe(20_000 + CLOSE_MS);
    expect(fandango.nextTimer!(s)).toEqual({ id: 'close', at: 20_000 + CLOSE_MS });
    expect(fandango.announce!(null, s)).toHaveLength(1);
    s = solveFor(s, 'rook', 30_000);
    expect(fandango.getResult(s)).toBeNull();
    s = fandango.onTimer!(s, 'close', createRng(1), 20_000 + CLOSE_MS);
    const result = fandango.getResult(s)!;
    expect(result.winners).toEqual(['wren']);
    expect(ranking(s)).toEqual(['wren', 'rook', 'finch']);
    expect(result.standings!.map((x) => x.outcome)).toEqual(['win', 'loss', 'loss']);
    expect(result.highlights![0]!.award).toBe('Fastest puzzle');
  });

  it('ends at once when the last player finishes', () => {
    let s = start(['wren', 'rook'], '4×4', 1);
    s = solveFor(s, 'wren', 10_000);
    s = solveFor(s, 'rook', 12_000);
    expect(s.over).toBe(true);
    expect(s.closesAt).toBeNull();
    expect(fandango.getResult(s)!.winners).toEqual(['wren']);
  });

  it('never shows anyone another player’s finished board', () => {
    let s = start(['wren', 'rook']);
    s = solveFor(s, 'wren', 4_000);
    const table = JSON.stringify(fandango.getTableView(s));
    const rook = JSON.stringify(fandango.getPlayerView(s, 'rook'));
    expect(s.boards.wren).toHaveLength(1);
    for (const json of [table, rook]) {
      expect(json).not.toContain('boards');
      expect(json).not.toContain('answer');
    }
  });

  it('keeps live marks off the table in a race, and shows them to those who have finished', () => {
    let s = start(['wren', 'rook'], '4×4', 1);
    const p = s.puzzles[0]!;
    const open = p.given.flatMap((v, i) => (v ? [] : [i]));
    const given = p.given.findIndex(Boolean);
    const marks = Array(16).fill(0);
    marks[open[0]!] = SUN;
    marks[open[1]!] = MOON;
    marks[given] = 3 - p.given[given]!;
    s = fandango.applyAction(
      s,
      'rook',
      { type: 'progress', puzzle: 0, cells: marks },
      createRng(1),
      2_000,
    );
    const kept = marks.map((v, i) => (i === given ? 0 : v));
    expect(fandango.getTableView(s).drawn).toEqual({ wren: 0, rook: 2 });
    expect(fandango.getTableView(s).live).toBeUndefined();
    expect(fandango.getPlayerView(s, 'wren').watching).toBeUndefined();
    expect(fandango.getPlayerView(s, 'rook').mine).toEqual(kept);
    s = fandango.applyAction(
      s,
      'wren',
      { type: 'solve', puzzle: 0, cells: answer(p) },
      createRng(1),
      3_000,
    );
    expect(fandango.getPlayerView(s, 'wren').watching?.rook).toEqual(kept);
    expect(fandango.getTableView(s).drawn.wren).toBe(0);
  });

  it('shows the live board on the table when someone plays alone', () => {
    let s = start(['wren'], '4×4', 1);
    const open = s.puzzles[0]!.given.findIndex((v) => !v);
    const marks = Array(16).fill(0);
    marks[open] = MOON;
    s = fandango.applyAction(
      s,
      'wren',
      { type: 'progress', puzzle: 0, cells: marks },
      createRng(1),
      2_000,
    );
    expect(fandango.getTableView(s).live).toEqual({ wren: marks });
  });

  it('has bots fill the board in the order reasoning finds it', () => {
    const p = makePuzzle(6, createRng(12));
    const right = answer(p);
    const boards = [0, 0.3, 0.6, 0.9, 0.99].map((f) => botMarks(p, f * 1000, 1000, 'hard', 'k'));
    const counts = boards.map((b) => b.filter(Boolean).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[0]).toBe(0);
    expect(counts.at(-1)!).toBeLessThan(36 - p.given.filter(Boolean).length);
    const order = deduce(p)!.order;
    const late = boards[2]!;
    expect(order.slice(0, 5).every((c) => late[c] === right[c])).toBe(true);
    for (const b of boards) b.forEach((v, i) => v && expect(p.given[i]).toBe(0));
  });

  it('saves the race so far when ended early, and nothing before a puzzle is solved', () => {
    let s = start(['wren', 'rook'], '4×4', 4);
    expect(fandango.partialResult!(s)).toBeNull();
    s = solveFor(s, 'rook', 9_000);
    const r = fandango.partialResult!(s)!;
    expect(r.winners).toEqual(['rook']);
    expect(r.summary).toBe('1 of 4 solved in 0:08');
  });

  it('lets bots race each other to the end', () => {
    let s = start(['bot-a', 'bot-b', 'bot-c'], '6×6', 3, 21);
    let now = 1_000;
    for (let step = 0; step < 2_000 && !s.over; step++) {
      now += 1_000;
      for (const id of s.players) {
        const view = fandango.getPlayerView(s, id);
        const move = fandango.bot!({
          playerId: id,
          playerIds: s.players,
          view,
          tableView: fandango.getTableView(s),
          rng: createRng(step),
          now,
          level: (['easy', 'normal', 'hard'] as const)[s.players.indexOf(id)]!,
        });
        if (move)
          s = fandango.applyAction(s, id, fandango.actionSchema.parse(move), createRng(step), now);
      }
      const timer = fandango.nextTimer!(s);
      if (timer && timer.at <= now) s = fandango.onTimer!(s, timer.id, createRng(1), now);
    }
    expect(s.over).toBe(true);
    expect(s.times['bot-c']).toHaveLength(3);
  });

  it('paces bots by level and board', () => {
    expect(botSolveMs(6, 'hard', 'x')).toBeLessThan(botSolveMs(6, 'easy', 'x'));
    expect(botSolveMs(4, 'normal', 'x')).toBeLessThan(botSolveMs(8, 'normal', 'x'));
  });
});

describe('hints', () => {
  const hint = (s: FandangoState, id: string, kind: 'step' | 'mistake' = 'step') =>
    fandango.applyAction(
      s,
      id,
      { type: 'hint', puzzle: s.times[id]!.length, kind },
      createRng(1),
      2_000,
    );

  it('are offered alone, counted per puzzle, and named in the result', () => {
    let s = start(['wren'], '4×4', 2);
    expect(fandango.getPlayerView(s, 'wren').hints).toBe(true);
    s = hint(hint(s, 'wren'), 'wren', 'mistake');
    s = solveFor(s, 'wren', 10_000);
    s = hint(s, 'wren');
    expect(fandango.getTableView(s).helped).toEqual([2, 1]);
    s = solveFor(s, 'wren', 20_000);
    expect(fandango.getResult(s)!.summary).toBe('Solved 2 puzzles in 0:19, 3 hints');
    expect((fandango.getResult(s)!.reveal as { helped: number[] }).helped).toEqual([2, 1]);
  });

  it('leave the result alone when none were used', () => {
    let s = start(['wren'], '4×4', 1);
    s = solveFor(s, 'wren', 10_000);
    expect(fandango.getResult(s)!.summary).toBe('Solved 1 puzzle in 0:09');
  });

  it('are never offered in a race, or when the host turned them off', () => {
    const race = start(['wren', 'rook'], '4×4', 1);
    expect(fandango.getTableView(race).hints).toBe(false);
    expect(fandango.getPlayerView(race, 'wren').hints).toBe(false);
    expect(() => hint(race, 'wren')).toThrow(/only for playing alone/);
    const off = start(['wren'], '4×4', 1, 7, false);
    expect(fandango.getPlayerView(off, 'wren').hints).toBe(false);
    expect(() => hint(off, 'wren')).toThrow(GameError);
  });

  it('are on by default', () => {
    expect(fandango.defaultOptions(1).hints).toBe(true);
  });
});

describe('clock', () => {
  it('reads like a stopwatch', () => {
    expect(clock(41_200)).toBe('0:41');
    expect(clock(725_000)).toBe('12:05');
    expect(clock(3_729_000)).toBe('1:02:09');
  });
});

describe('the recap', () => {
  it('logs each solve with its place, the board as a secret, and nothing on the table', () => {
    let s = start(['wren', 'rook'], '4×4', 2);
    s = solveFor(s, 'rook', 5_000);
    s = solveFor(s, 'wren', 9_000);
    const [first, second] = s.recap;
    expect(first).toMatchObject({ round: 1, actor: 'rook', tag: '1st', tone: 'good' });
    expect(first!.text).toBe('{rook} solved puzzle 1 in 0:04');
    expect(first!.secret).toMatch(/^Board: /);
    expect(second).toMatchObject({ actor: 'wren', tag: '2nd' });
    const json = JSON.stringify([fandango.getTableView(s), fandango.getPlayerView(s, 'wren')]);
    expect(json).not.toContain('recap');
    expect(json).not.toContain('Board:');
  });

  it('notes a change of lead, the last call and the time running out, with stats at the end', () => {
    let s = start(['wren', 'rook', 'finch'], '4×4', 2);
    s = solveFor(s, 'rook', 10_000);
    s = solveFor(s, 'wren', 11_000);
    s = solveFor(s, 'wren', 20_000);
    expect(s.recap.some((e) => e.tag === 'Lead' && e.actor === 'wren' && e.key)).toBe(true);
    expect(s.recap.some((e) => e.tag === 'Last call')).toBe(true);
    s = fandango.onTimer!(s, 'close', createRng(1), 20_000 + CLOSE_MS);
    expect(s.recap.at(-1)!.secret).toContain('{finch} was on puzzle 1');
    const r = fandango.getResult(s)!;
    expect(r.roundName).toBe('Puzzle');
    expect(r.stats!.rows.map((x) => x.playerId)).toEqual(['wren', 'rook', 'finch']);
    expect(r.stats!.rows[0]!.values).toEqual(['2 of 2', '0:19', '0:09']);
    for (const e of r.recap) expect(e.text).not.toMatch(/(^|\s)(wren|rook|finch)(\s|$)/);
  });
});
