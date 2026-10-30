import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { checkPath, makePuzzle, MAX_SIZE, MIN_SIZE, neighbours, solve } from './puzzle';
import { answerOf, botPath, botSolveMs, CLOSE_MS, ranking, zap, type ZapState } from './rules';
import { clock } from './time';

const answer = answerOf;

function start(players: string[], board = '6×6', puzzles = 3, seed = 7, hints = true): ZapState {
  return zap.setup({
    playerIds: players,
    options: { board, puzzles, hints },
    rng: createRng(seed),
    now: 1_000,
  });
}

function solveFor(s: ZapState, id: string, now: number, seed = 1): ZapState {
  const index = s.times[id]!.length;
  return zap.applyAction(
    s,
    id,
    { type: 'solve', puzzle: index, path: answer(s.puzzles[index]!) },
    createRng(seed),
    now,
  );
}

describe('puzzles', () => {
  it('have exactly one answer, from 1 through every square to the last number', () => {
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      const rng = createRng(size * 31);
      for (let i = 0; i < 6; i++) {
        const p = makePuzzle(size, rng);
        const answers = solve(p, 2, Infinity)!;
        expect(answers).toHaveLength(1);
        const [line] = answers;
        expect(new Set(line).size).toBe(size * size);
        expect(line![0]).toBe(p.dots[0]);
        expect(line!.at(-1)).toBe(p.dots.at(-1));
        expect(checkPath(p, line!)).toBeNull();
        for (const [a, b] of p.walls) expect(neighbours(size, a)).toContain(b);
      }
    }
  });

  it('come out the same from the same seed', () => {
    expect(makePuzzle(7, createRng(99))).toEqual(makePuzzle(7, createRng(99)));
  });

  it('say why a line is wrong', () => {
    const p = makePuzzle(6, createRng(3));
    const good = answer(p);
    expect(checkPath(p, good)).toBeNull();
    expect(checkPath(p, good.slice(1))).toMatch(/Start on 1/);
    expect(checkPath(p, good.slice(0, -1))).toMatch(/every square/);
    expect(checkPath(p, [...good.slice(0, 3), good[1]!])).toMatch(/crosses/);
    expect(checkPath(p, [good[0]!, good[2]!])).not.toBeNull();
  });
});

describe('Zap', () => {
  it('refuses a wrong board, and one for a puzzle already counted', () => {
    const s = start(['wren', 'rook']);
    expect(() =>
      zap.applyAction(s, 'wren', { type: 'solve', puzzle: 0, path: [0] }, createRng(1), 2_000),
    ).toThrow(GameError);
    const next = solveFor(s, 'wren', 2_000);
    expect(next.times.wren).toEqual([2_000]);
    expect(() =>
      zap.applyAction(
        next,
        'wren',
        { type: 'solve', puzzle: 0, path: answer(s.puzzles[0]!) },
        createRng(1),
        2_500,
      ),
    ).toThrow(/already counted/);
  });

  it('makes the next puzzle when the first player reaches it, the same one for everyone', () => {
    let s = start(['wren', 'rook'], '7×7', 3);
    expect(s.puzzles).toHaveLength(1);
    s = solveFor(s, 'wren', 5_000);
    expect(s.puzzles).toHaveLength(2);
    s = solveFor(s, 'rook', 6_000);
    expect(s.puzzles).toHaveLength(2);
    expect(zap.getPlayerView(s, 'rook').puzzle).toEqual(zap.getPlayerView(s, 'wren').puzzle);
  });

  it('ends a game alone once every puzzle is solved', () => {
    let s = start(['wren'], '5×5', 2);
    s = solveFor(s, 'wren', 31_000);
    expect(zap.getResult(s)).toBeNull();
    s = solveFor(s, 'wren', 61_000);
    const result = zap.getResult(s)!;
    expect(result.winners).toEqual(['wren']);
    expect(result.summary).toBe('Solved 2 puzzles in 1:00');
    expect(result.standings).toEqual([{ playerId: 'wren', outcome: 'win' }]);
  });

  it('gives the rest two minutes once someone has solved them all', () => {
    let s = start(['wren', 'rook', 'finch'], '5×5', 2);
    s = solveFor(s, 'rook', 10_000);
    s = solveFor(s, 'wren', 11_000);
    s = solveFor(s, 'wren', 20_000);
    expect(s.closesAt).toBe(20_000 + CLOSE_MS);
    expect(zap.nextTimer!(s)).toEqual({ id: 'close', at: 20_000 + CLOSE_MS });
    expect(zap.announce!(null, s)).toHaveLength(1);
    s = solveFor(s, 'rook', 30_000);
    expect(zap.getResult(s)).toBeNull();
    s = zap.onTimer!(s, 'close', createRng(1), 20_000 + CLOSE_MS);
    const result = zap.getResult(s)!;
    expect(result.winners).toEqual(['wren']);
    expect(ranking(s)).toEqual(['wren', 'rook', 'finch']);
    expect(result.standings!.map((x) => x.outcome)).toEqual(['win', 'loss', 'loss']);
    expect(result.highlights![0]!.award).toBe('Fastest puzzle');
    // The recap tells the race: who was first, the last call, and who ran out of time.
    expect(result.roundName).toBe('Puzzle');
    expect(result.recap[0]).toMatchObject({ tag: 'First', tone: 'good' });
    expect(result.recap.find((e) => e.tag === 'Last call')).toMatchObject({ key: true });
    expect(result.recap.at(-1)).toMatchObject({ tag: "Time's up", tone: 'bad', key: true });
    expect(result.recap.at(-1)!.text).toContain('{finch}');
    expect(result.recap.every((e) => !/wren|rook|finch/.test(e.text.replace(/\{\w+\}/g, '')))).toBe(
      true,
    );
    expect(result.stats!.columns).toEqual(['Solved', 'Time', 'Quickest']);
    expect(result.stats!.rows.map((r) => r.playerId)).toEqual(['wren', 'rook', 'finch']);
    expect(result.stats!.rows[0]!.values[0]).toBe('2/2');
  });

  it('keeps the recap out of the views mid-race', () => {
    let s = start(['wren', 'rook'], '5×5', 2);
    s = solveFor(s, 'wren', 10_000);
    expect(s.recap[0]).toMatchObject({ tag: 'First', tone: 'good' });
    expect(JSON.stringify(zap.getTableView(s))).not.toContain('recap');
    expect(JSON.stringify(zap.getPlayerView(s, 'rook'))).not.toContain('recap');
  });

  it('ends at once when the last player finishes', () => {
    let s = start(['wren', 'rook'], '5×5', 1);
    s = solveFor(s, 'wren', 10_000);
    s = solveFor(s, 'rook', 12_000);
    expect(s.over).toBe(true);
    expect(s.closesAt).toBeNull();
    expect(zap.getResult(s)!.winners).toEqual(['wren']);
  });

  it('never shows anyone another player’s finished line', () => {
    let s = start(['wren', 'rook']);
    s = solveFor(s, 'wren', 4_000);
    const table = JSON.stringify(zap.getTableView(s));
    const rook = JSON.stringify(zap.getPlayerView(s, 'rook'));
    expect(s.boards.wren).toHaveLength(1);
    for (const json of [table, rook]) {
      expect(json).not.toContain('boards');
      expect(json).not.toContain('answer');
    }
  });

  it('keeps live lines off the table in a race, and shows them to those who have finished', () => {
    let s = start(['wren', 'rook'], '5×5', 1);
    const p = s.puzzles[0]!;
    s = zap.applyAction(
      s,
      'rook',
      { type: 'progress', puzzle: 0, path: [p.dots[0]!, 3] },
      createRng(1),
      2_000,
    );
    expect(zap.getTableView(s).drawn).toEqual({ wren: 0, rook: 2 });
    expect(zap.getTableView(s).live).toBeUndefined();
    expect(zap.getPlayerView(s, 'wren').watching).toBeUndefined();
    expect(zap.getPlayerView(s, 'rook').mine).toEqual([p.dots[0]!, 3]);
    expect(JSON.stringify(zap.getPlayerView(s, 'wren'))).not.toContain(`[${p.dots[0]},3]`);
    s = zap.applyAction(
      s,
      'wren',
      { type: 'solve', puzzle: 0, path: answer(p) },
      createRng(1),
      3_000,
    );
    expect(zap.getPlayerView(s, 'wren').watching?.rook).toEqual([p.dots[0]!, 3]);
    expect(zap.getTableView(s).drawn.wren).toBe(0);
  });

  it('shows the live board on the table when someone plays alone', () => {
    let s = start(['wren'], '5×5', 1);
    s = zap.applyAction(s, 'wren', { type: 'progress', puzzle: 0, path: [7] }, createRng(1), 2_000);
    expect(zap.getTableView(s).live).toEqual({ wren: [7] });
  });

  it('has bots draw the answer from 1, a stretch at a time', () => {
    const p = makePuzzle(7, createRng(12));
    const right = answer(p);
    const lines = [0, 0.3, 0.6, 0.9, 0.99].map((f) => botPath(p, f * 1000, 1000, 'hard', 'k'));
    const lengths = lines.map((l) => l.length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(lines[0]).toEqual([p.dots[0]]);
    expect(lines.at(-1)!.length).toBeLessThan(49);
    for (const l of lines) expect(l[0]).toBe(right[0]);
  });

  it('saves the race so far when ended early, and nothing before a puzzle is solved', () => {
    let s = start(['wren', 'rook'], '5×5', 4);
    expect(zap.partialResult!(s)).toBeNull();
    s = solveFor(s, 'rook', 9_000);
    const r = zap.partialResult!(s)!;
    expect(r.winners).toEqual(['rook']);
    expect(r.summary).toBe('1 of 4 solved in 0:08');
  });

  it('lets bots race each other to the end', () => {
    let s = start(['bot-a', 'bot-b', 'bot-c'], '7×7', 3, 21);
    let now = 1_000;
    for (let step = 0; step < 2_000 && !s.over; step++) {
      now += 1_000;
      for (const id of s.players) {
        const view = zap.getPlayerView(s, id);
        const move = zap.bot!({
          playerId: id,
          playerIds: s.players,
          view,
          tableView: zap.getTableView(s),
          rng: createRng(step),
          now,
          level: (['easy', 'normal', 'hard'] as const)[s.players.indexOf(id)]!,
        });
        if (move) s = zap.applyAction(s, id, zap.actionSchema.parse(move), createRng(step), now);
      }
      const timer = zap.nextTimer!(s);
      if (timer && timer.at <= now) s = zap.onTimer!(s, timer.id, createRng(1), now);
    }
    expect(s.over).toBe(true);
    expect(s.times['bot-c']).toHaveLength(3);
  });

  it('paces bots by level and board', () => {
    expect(botSolveMs(7, 'hard', 'x')).toBeLessThan(botSolveMs(7, 'easy', 'x'));
    expect(botSolveMs(5, 'normal', 'x')).toBeLessThan(botSolveMs(8, 'normal', 'x'));
  });
});

describe('hints', () => {
  const hint = (s: ZapState, id: string, kind: 'step' | 'mistake' = 'step') =>
    zap.applyAction(
      s,
      id,
      { type: 'hint', puzzle: s.times[id]!.length, kind },
      createRng(1),
      2_000,
    );

  it('are offered alone, counted per puzzle, and named in the result', () => {
    let s = start(['wren'], '5×5', 2);
    expect(zap.getPlayerView(s, 'wren').hints).toBe(true);
    s = hint(hint(s, 'wren'), 'wren', 'mistake');
    s = solveFor(s, 'wren', 10_000);
    s = hint(s, 'wren');
    expect(zap.getTableView(s).helped).toEqual([2, 1]);
    s = solveFor(s, 'wren', 20_000);
    expect(zap.getResult(s)!.summary).toBe('Solved 2 puzzles in 0:19, 3 hints');
    expect((zap.getResult(s)!.reveal as { helped: number[] }).helped).toEqual([2, 1]);
  });

  it('leave the result alone when none were used', () => {
    let s = start(['wren'], '5×5', 1);
    s = solveFor(s, 'wren', 10_000);
    expect(zap.getResult(s)!.summary).toBe('Solved 1 puzzle in 0:09');
  });

  it('are never offered in a race, or when the host turned them off', () => {
    const race = start(['wren', 'rook'], '5×5', 1);
    expect(zap.getTableView(race).hints).toBe(false);
    expect(zap.getPlayerView(race, 'wren').hints).toBe(false);
    expect(() => hint(race, 'wren')).toThrow(/only for playing alone/);
    const off = start(['wren'], '5×5', 1, 7, false);
    expect(zap.getPlayerView(off, 'wren').hints).toBe(false);
    expect(() => hint(off, 'wren')).toThrow(GameError);
  });

  it('are on by default', () => {
    expect(zap.defaultOptions(1).hints).toBe(true);
  });
});

describe('clock', () => {
  it('reads like a stopwatch', () => {
    expect(clock(41_200)).toBe('0:41');
    expect(clock(725_000)).toBe('12:05');
    expect(clock(3_729_000)).toBe('1:02:09');
  });
});
