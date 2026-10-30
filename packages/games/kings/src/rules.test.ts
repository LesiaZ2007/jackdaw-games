import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { checkKings, makePuzzle, MAX_SIZE, MIN_SIZE, solve, type Puzzle } from './puzzle';
import { botKings, botSolveMs, CLOSE_MS, kings, ranking, type KingsState } from './rules';
import { clock } from './time';

const answer = (p: Puzzle) => solve(p, 1)[0]!.map((c, r) => r * p.size + c);

function start(players: string[], board = '6×6', puzzles = 3, seed = 7, hints = true): KingsState {
  return kings.setup({
    playerIds: players,
    options: { board, puzzles, hints },
    rng: createRng(seed),
    now: 1_000,
  });
}

function solveFor(s: KingsState, id: string, now: number, seed = 1): KingsState {
  const index = s.times[id]!.length;
  return kings.applyAction(
    s,
    id,
    { type: 'solve', puzzle: index, kings: answer(s.puzzles[index]!) },
    createRng(seed),
    now,
  );
}

describe('puzzles', () => {
  it('have exactly one answer, and the regions cover the board', () => {
    for (let size = MIN_SIZE; size <= MAX_SIZE; size++) {
      const rng = createRng(size * 31);
      for (let i = 0; i < 6; i++) {
        const p = makePuzzle(size, rng);
        expect(p.regions).toHaveLength(size * size);
        expect(new Set(p.regions).size).toBe(size);
        expect(solve(p)).toHaveLength(1);
        expect(checkKings(p, answer(p))).toBeNull();
      }
    }
  });

  it('keep every region in one piece', () => {
    const p = makePuzzle(9, createRng(4));
    for (let g = 0; g < 9; g++) {
      const cells = p.regions.flatMap((x, i) => (x === g ? [i] : []));
      const seen = new Set([cells[0]!]);
      const stack = [cells[0]!];
      while (stack.length) {
        const at = stack.pop()!;
        const r = Math.floor(at / 9);
        const c = at % 9;
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const rr = r + dr;
          const cc = c + dc;
          const n = rr * 9 + cc;
          if (rr < 0 || rr > 8 || cc < 0 || cc > 8 || seen.has(n) || p.regions[n] !== g) continue;
          seen.add(n);
          stack.push(n);
        }
      }
      expect(seen.size).toBe(cells.length);
    }
  });

  it('come out the same from the same seed', () => {
    expect(makePuzzle(8, createRng(99))).toEqual(makePuzzle(8, createRng(99)));
  });

  it('say why a board is wrong', () => {
    const p = makePuzzle(6, createRng(3));
    const good = answer(p);
    expect(checkKings(p, good.slice(1))).toMatch(/Place 6/);
    const sameRow = [...good];
    sameRow[1] = sameRow[0]! + (sameRow[0]! % 6 < 5 ? 1 : -1);
    expect(checkKings(p, sameRow)).not.toBeNull();
    expect(checkKings(p, [0, 7, 14, 21, 28, 35])).not.toBeNull();
  });
});

describe('Kings', () => {
  it('refuses a wrong board, and one for a puzzle already counted', () => {
    const s = start(['wren', 'rook']);
    expect(() =>
      kings.applyAction(s, 'wren', { type: 'solve', puzzle: 0, kings: [0] }, createRng(1), 2_000),
    ).toThrow(GameError);
    const next = solveFor(s, 'wren', 2_000);
    expect(next.times.wren).toEqual([2_000]);
    expect(() =>
      kings.applyAction(
        next,
        'wren',
        { type: 'solve', puzzle: 0, kings: answer(s.puzzles[0]!) },
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
    expect(kings.getPlayerView(s, 'rook').puzzle).toEqual(kings.getPlayerView(s, 'wren').puzzle);
  });

  it('ends a game alone once every puzzle is solved', () => {
    let s = start(['wren'], '5×5', 2);
    s = solveFor(s, 'wren', 31_000);
    expect(kings.getResult(s)).toBeNull();
    s = solveFor(s, 'wren', 61_000);
    const result = kings.getResult(s)!;
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
    expect(kings.nextTimer!(s)).toEqual({ id: 'close', at: 20_000 + CLOSE_MS });
    expect(kings.announce!(null, s)).toHaveLength(1);
    s = solveFor(s, 'rook', 30_000);
    expect(kings.getResult(s)).toBeNull();
    s = kings.onTimer!(s, 'close', createRng(1), 20_000 + CLOSE_MS);
    const result = kings.getResult(s)!;
    expect(result.winners).toEqual(['wren']);
    expect(ranking(s)).toEqual(['wren', 'rook', 'finch']);
    expect(result.standings!.map((x) => x.outcome)).toEqual(['win', 'loss', 'loss']);
    expect(result.highlights![0]!.award).toBe('Fastest puzzle');
  });

  it('ends at once when the last player finishes', () => {
    let s = start(['wren', 'rook'], '5×5', 1);
    s = solveFor(s, 'wren', 10_000);
    s = solveFor(s, 'rook', 12_000);
    expect(s.over).toBe(true);
    expect(s.closesAt).toBeNull();
    expect(kings.getResult(s)!.winners).toEqual(['wren']);
  });

  it('never shows anyone where another player put their kings', () => {
    let s = start(['wren', 'rook']);
    s = solveFor(s, 'wren', 4_000);
    const table = JSON.stringify(kings.getTableView(s));
    const rook = JSON.stringify(kings.getPlayerView(s, 'rook'));
    expect(s.boards.wren).toHaveLength(1);
    for (const json of [table, rook]) {
      expect(json).not.toContain('boards');
      expect(json).not.toContain('answer');
    }
  });

  it('keeps live kings off the table in a race, and shows them to those who have finished', () => {
    let s = start(['wren', 'rook'], '5×5', 1);
    const p = s.puzzles[0]!;
    s = kings.applyAction(
      s,
      'rook',
      { type: 'progress', puzzle: 0, kings: [3, 11] },
      createRng(1),
      2_000,
    );
    expect(kings.getTableView(s).placed).toEqual({ wren: 0, rook: 2 });
    expect(kings.getTableView(s).live).toBeUndefined();
    expect(kings.getPlayerView(s, 'wren').watching).toBeUndefined();
    expect(kings.getPlayerView(s, 'rook').mine).toEqual([3, 11]);
    expect(JSON.stringify(kings.getPlayerView(s, 'wren'))).not.toContain('[3,11]');
    s = kings.applyAction(
      s,
      'wren',
      { type: 'solve', puzzle: 0, kings: answer(p) },
      createRng(1),
      3_000,
    );
    expect(kings.getPlayerView(s, 'wren').watching?.rook).toEqual([3, 11]);
    expect(kings.getTableView(s).placed.wren).toBe(0);
  });

  it('shows the live board on the table when someone plays alone', () => {
    let s = start(['wren'], '5×5', 1);
    s = kings.applyAction(
      s,
      'wren',
      { type: 'progress', puzzle: 0, kings: [7] },
      createRng(1),
      2_000,
    );
    expect(kings.getTableView(s).live).toEqual({ wren: [7] });
  });

  it('has bots fill the board a king at a time, smallest colours first', () => {
    const p = makePuzzle(8, createRng(12));
    const right = new Set(answer(p));
    const counts = [0, 0.3, 0.6, 0.9, 0.99].map((f) => botKings(p, f * 1000, 1000, 'hard', 'k'));
    expect(counts.map((k) => k.length)).toEqual(
      [...counts.map((k) => k.length)].sort((a, b) => a - b),
    );
    expect(counts[0]).toEqual([]);
    expect(counts.at(-1)!.length).toBe(7);
    for (const k of counts) for (const cell of k.slice(0, -1)) expect(right.has(cell)).toBe(true);
  });

  it('saves the race so far when ended early, and nothing before a puzzle is solved', () => {
    let s = start(['wren', 'rook'], '5×5', 4);
    expect(kings.partialResult!(s)).toBeNull();
    s = solveFor(s, 'rook', 9_000);
    const r = kings.partialResult!(s)!;
    expect(r.winners).toEqual(['rook']);
    expect(r.summary).toBe('1 of 4 solved in 0:08');
  });

  it('lets bots race each other to the end', () => {
    let s = start(['bot-a', 'bot-b', 'bot-c'], '7×7', 3, 21);
    let now = 1_000;
    for (let step = 0; step < 2_000 && !s.over; step++) {
      now += 1_000;
      for (const id of s.players) {
        const view = kings.getPlayerView(s, id);
        const move = kings.bot!({
          playerId: id,
          playerIds: s.players,
          view,
          tableView: kings.getTableView(s),
          rng: createRng(step),
          now,
          level: (['easy', 'normal', 'hard'] as const)[s.players.indexOf(id)]!,
        });
        if (move)
          s = kings.applyAction(s, id, kings.actionSchema.parse(move), createRng(step), now);
      }
      const timer = kings.nextTimer!(s);
      if (timer && timer.at <= now) s = kings.onTimer!(s, timer.id, createRng(1), now);
    }
    expect(s.over).toBe(true);
    expect(s.times['bot-c']).toHaveLength(3);
  });

  it('paces bots by level and board', () => {
    expect(botSolveMs(8, 'hard', 'x')).toBeLessThan(botSolveMs(8, 'easy', 'x'));
    expect(botSolveMs(5, 'normal', 'x')).toBeLessThan(botSolveMs(9, 'normal', 'x'));
  });
});

describe('hints', () => {
  const hint = (s: KingsState, id: string, kind: 'step' | 'mistake' = 'step') =>
    kings.applyAction(
      s,
      id,
      { type: 'hint', puzzle: s.times[id]!.length, kind },
      createRng(1),
      2_000,
    );

  it('are offered alone, counted per puzzle, and named in the result', () => {
    let s = start(['wren'], '5×5', 2);
    expect(kings.getPlayerView(s, 'wren').hints).toBe(true);
    s = hint(hint(s, 'wren'), 'wren', 'mistake');
    s = solveFor(s, 'wren', 10_000);
    s = hint(s, 'wren');
    expect(kings.getTableView(s).helped).toEqual([2, 1]);
    s = solveFor(s, 'wren', 20_000);
    expect(kings.getResult(s)!.summary).toBe('Solved 2 puzzles in 0:19, 3 hints');
    expect((kings.getResult(s)!.reveal as { helped: number[] }).helped).toEqual([2, 1]);
  });

  it('leave the result alone when none were used', () => {
    let s = start(['wren'], '5×5', 1);
    s = solveFor(s, 'wren', 10_000);
    expect(kings.getResult(s)!.summary).toBe('Solved 1 puzzle in 0:09');
  });

  it('are never offered in a race, or when the host turned them off', () => {
    const race = start(['wren', 'rook'], '5×5', 1);
    expect(kings.getTableView(race).hints).toBe(false);
    expect(kings.getPlayerView(race, 'wren').hints).toBe(false);
    expect(() => hint(race, 'wren')).toThrow(/only for playing alone/);
    const off = start(['wren'], '5×5', 1, 7, false);
    expect(kings.getPlayerView(off, 'wren').hints).toBe(false);
    expect(() => hint(off, 'wren')).toThrow(GameError);
  });

  it('are on by default', () => {
    expect(kings.defaultOptions(1).hints).toBe(true);
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
  it('logs each solve with its place, the kings as a secret, and nothing on the table', () => {
    let s = start(['wren', 'rook'], '5×5', 2);
    s = solveFor(s, 'rook', 5_000);
    s = solveFor(s, 'wren', 9_000);
    const [first, second] = s.recap;
    expect(first).toMatchObject({ round: 1, actor: 'rook', tag: '1st', tone: 'good' });
    expect(first!.text).toBe('{rook} solved puzzle 1 in 0:04');
    expect(first!.secret).toMatch(/^Kings at [A-E][1-5]/);
    expect(second).toMatchObject({ actor: 'wren', tag: '2nd' });
    const json = JSON.stringify([kings.getTableView(s), kings.getPlayerView(s, 'wren')]);
    expect(json).not.toContain('recap');
    expect(json).not.toContain('Kings at');
  });

  it('notes a change of lead, the last call and the time running out, with stats at the end', () => {
    let s = start(['wren', 'rook', 'finch'], '5×5', 2);
    s = solveFor(s, 'rook', 10_000);
    s = solveFor(s, 'wren', 11_000);
    s = solveFor(s, 'wren', 20_000);
    expect(s.recap.some((e) => e.tag === 'Lead' && e.actor === 'wren' && e.key)).toBe(true);
    expect(s.recap.some((e) => e.tag === 'Last call')).toBe(true);
    s = kings.onTimer!(s, 'close', createRng(1), 20_000 + CLOSE_MS);
    expect(s.recap.at(-1)!.secret).toContain('{finch} was on puzzle 1');
    const r = kings.getResult(s)!;
    expect(r.roundName).toBe('Puzzle');
    expect(r.stats!.rows.map((x) => x.playerId)).toEqual(['wren', 'rook', 'finch']);
    expect(r.stats!.rows[0]!.values).toEqual(['2 of 2', '0:19', '0:09']);
    for (const e of r.recap) expect(e.text).not.toMatch(/(^|\s)(wren|rook|finch)(\s|$)/);
  });
});
