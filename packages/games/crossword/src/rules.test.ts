import { describe, it, expect } from 'vitest';
import { createRng } from '@jackdaw/engine';
import { crossword, actionSchema, type CrosswordState, type CrosswordAction } from './rules';
import { PUZZLES } from './puzzles';
import { gridClues } from './grid';
const rng = () => createRng(42);
const setup = (help = true) =>
  crossword.setup({
    playerIds: ['wren', 'rook'],
    options: { puzzle: 'ink', help, size: 'mini', mode: 'cooperative' },
    rng: rng(),
    now: 1000,
  });
const act = (s: CrosswordState, a: CrosswordAction, player = 'wren') =>
  crossword.applyAction(s, player, a, rng(), 5000);
const edit = (s: CrosswordState, cell: number, letter: string, player = 'wren') =>
  act(s, { type: 'edit', cell, letter, revision: s.revisions[cell]! }, player);
describe('original crossword constructions', () => {
  for (const p of PUZZLES)
    it(p.id + ' has a connected, fully crossed grid and a clue for every entry', () => {
      expect(p.rows).toHaveLength(5);
      expect(p.rows.every((r) => r.length === 5)).toBe(true);
      const clues = gridClues(p.rows, p.across, p.down);
      expect(clues).toHaveLength(10);
      const answers = clues.map((c) => c.cells.map((i) => p.rows.join('')[i]).join(''));
      expect(new Set(answers).size).toBe(answers.length);
      for (const c of clues) {
        expect(c.text.length).toBeGreaterThan(5);
        expect(c.cells.length).toBeGreaterThanOrEqual(3);
      }
      const white = [...p.rows.join('')].flatMap((c, i) => (c === '#' ? [] : [i]));
      for (const i of white) expect(clues.filter((c) => c.cells.includes(i))).toHaveLength(2);
      const seen = new Set([white[0]!]);
      let size = 0;
      while (size !== seen.size) {
        size = seen.size;
        for (const i of seen)
          for (const j of white)
            if (
              Math.abs(i - j) === 5 ||
              (Math.floor(i / 5) === Math.floor(j / 5) && Math.abs(i - j) === 1)
            )
              seen.add(j);
      }
      expect(seen.size).toBe(white.length);
    });
});
describe('cooperative crossword', () => {
  it('shares letters, preserves crossings and never mutates earlier state', () => {
    const s = setup();
    const a = edit(s, 0, 'P');
    const b = edit(a, 1, 'E', 'rook');
    expect(s.letters[0]).toBe('');
    expect(a.letters[1]).toBe('');
    expect(crossword.getPlayerView(b, 'rook').letters.slice(0, 2)).toEqual(['P', 'E']);
    expect(b.authors.slice(0, 2)).toEqual(['wren', 'rook']);
  });
  it('allows simultaneous edits on different cells but refuses a stale write to the same cell', () => {
    const s = setup();
    const a = edit(s, 0, 'P');
    const b = act(a, { type: 'edit', cell: 1, letter: 'E', revision: 0 }, 'rook');
    expect(b.letters[1]).toBe('E');
    expect(() => act(b, { type: 'edit', cell: 0, letter: 'X', revision: 0 }, 'rook')).toThrow(
      'teammate',
    );
    const c = edit(b, 0, '');
    expect(c.letters[0]).toBe('');
    expect(c.revisions[0]).toBe(2);
  });
  it('rejects spectators, blocks, out-of-range cells and malformed input', () => {
    const s = setup();
    expect(() => edit(s, 0, 'P', 'heron')).toThrow('Join');
    for (const cell of [3, 25, 224])
      expect(() => act(s, { type: 'edit', cell, letter: 'P', revision: 0 })).toThrow(
        'white square',
      );
    for (const letter of ['ab', '1', 'é', 'a'])
      expect(actionSchema.safeParse({ type: 'edit', cell: 0, letter, revision: 0 }).success).toBe(
        false,
      );
    expect(() => edit(s, -1, 'A')).toThrow('one letter');
  });
  it('keeps all answers out of both views and does not ship solutions in the browser module', () => {
    const s = setup();
    const changed = {
      ...s,
      puzzle: { ...s.puzzle, rows: s.puzzle.rows.map((row) => row.replace(/[A-Z]/g, 'Z')) },
    };
    expect(crossword.getTableView(s)).toEqual(crossword.getTableView(changed));
    expect(crossword.getPlayerView(s, 'wren')).toEqual(crossword.getPlayerView(changed, 'wren'));
    expect(crossword.getTableView(s)).not.toHaveProperty('puzzle');
    expect(JSON.stringify(crossword.getTableView(s))).not.toContain('PEN##');
  });
  it('checks filled squares, clears corrected marks and keeps reveals visibly locked', () => {
    let s = edit(setup(), 0, 'X');
    s = act(s, { type: 'check', cell: 0, direction: 'across', scope: 'word' });
    expect(s.errors).toEqual([0]);
    expect(s.checks).toBe(1);
    expect(s.letters[1]).toBe('');
    s = edit(s, 0, 'P');
    expect(s.errors).toEqual([]);
    s = act(s, { type: 'reveal', cell: 1, direction: 'across', scope: 'letter' });
    expect(s.letters[1]).toBe('E');
    expect(s.revealed).toEqual([1]);
    expect(() => edit(s, 1, 'X')).toThrow('revealed');
  });
  it('disables all assistance when the host turns help off', () => {
    for (const type of ['check', 'reveal'] as const)
      expect(() =>
        act(setup(false), { type, cell: 0, direction: 'across', scope: 'letter' }),
      ).toThrow('off');
  });
  it('shows a full wrong grid as unfinished and awards everyone a win only after a correct solve', () => {
    let s = setup();
    const answer = s.puzzle.rows.join('');
    for (let i = 0; i < answer.length; i++) if (answer[i] !== '#') s = edit(s, i, 'X');
    expect(crossword.getResult(s)).toBeNull();
    expect(s.notice).toContain('not quite right');
    for (let i = 0; i < answer.length; i++) if (answer[i] !== '#') s = edit(s, i, answer[i]!);
    expect(crossword.getResult(s)?.winners).toEqual(['wren', 'rook']);
    expect(crossword.getResult(s)?.standings?.every((s) => s.outcome === 'win')).toBe(true);
    expect(() => edit(s, 0, 'X')).toThrow('complete');
  });
  it('can finish with reveals while retaining the assistance count', () => {
    let s = setup();
    for (const clue of gridClues(s.puzzle.rows, s.puzzle.across, s.puzzle.down).filter(
      (c) => c.direction === 'across',
    ))
      s = act(s, { type: 'reveal', cell: clue.cells[0]!, direction: 'across', scope: 'word' });
    expect(crossword.getResult(s)?.summary).toContain('19 letters revealed');
  });
  it('stores public clue cursors and survives a JSON round trip', () => {
    let s = act(setup(), { type: 'focus', cell: 2, direction: 'down' }, 'rook');
    s = edit(s, 2, 'N', 'rook');
    const restored = JSON.parse(JSON.stringify(s)) as CrosswordState;
    expect(crossword.getTableView(restored).cursors.rook).toEqual({
      cell: 2,
      direction: 'down',
      at: 5000,
    });
    expect(crossword.getPlayerView(restored, 'rook')).toEqual(crossword.getPlayerView(s, 'rook'));
  });
});

describe('private crossword races', () => {
  const race = () =>
    crossword.setup({
      playerIds: ['wren', 'rook'],
      options: { puzzle: 'ink', size: 'mini', mode: 'race', help: true },
      rng: rng(),
      now: 1000,
    });
  it('gives everyone the same clues with independent saved grids and revisions', () => {
    const initial = race();
    const a = edit(initial, 0, 'P');
    expect(crossword.getPlayerView(a, 'wren').letters[0]).toBe('P');
    expect(crossword.getPlayerView(a, 'rook').letters[0]).toBe('');
    expect(crossword.getTableView(a).letters.every((l) => !l)).toBe(true);
    expect(crossword.getTableView(a).progress.wren).toBe(1);
    expect(crossword.getPlayerView(a, 'rook').revisions[0]).toBe(0);
    const b = act(a, { type: 'edit', cell: 0, letter: 'X', revision: 0 }, 'rook');
    expect(crossword.getPlayerView(b, 'wren').letters[0]).toBe('P');
    expect(crossword.getPlayerView(b, 'rook').letters[0]).toBe('X');
    expect(crossword.getPlayerView(a, 'wren').clues).toEqual(
      crossword.getPlayerView(a, 'rook').clues,
    );
  });
  it('never leaks an opponent’s letters or correctness before the finish', () => {
    const a = edit(race(), 0, 'P');
    const changed = JSON.parse(JSON.stringify(a)) as CrosswordState;
    changed.boards.wren!.letters[0] = 'X';
    expect(crossword.getPlayerView(a, 'rook')).toEqual(crossword.getPlayerView(changed, 'rook'));
    expect(crossword.getTableView(a)).toEqual(crossword.getTableView(changed));
  });
  it('turns off assistance for all racers', () => {
    const s = race();
    expect(crossword.getPlayerView(s, 'wren').help).toBe(false);
    for (const type of ['check', 'reveal'] as const)
      expect(() => act(s, { type, cell: 0, direction: 'across', scope: 'letter' })).toThrow('off');
  });
  it('awards only the first correct finisher and rejects later finishes', () => {
    let s = race();
    const solution = s.puzzle.rows.join('');
    for (let cell = 0; cell < solution.length; cell++)
      if (solution[cell] !== '#')
        s = act(s, { type: 'edit', cell, letter: solution[cell]!, revision: 0 }, 'rook');
    const result = crossword.getResult(s)!;
    expect(result.winners).toEqual(['rook']);
    expect(result.standings).toEqual([
      { playerId: 'wren', outcome: 'loss', team: undefined },
      { playerId: 'rook', outcome: 'win', team: undefined },
    ]);
    expect(crossword.getTableView(s).letters[0]).toBe('P');
    expect(() => edit(s, 0, 'P')).toThrow('complete');
  });
  it('requires two racers and restricts named puzzles to their original size', () => {
    expect(
      crossword.validateOptions?.(
        { puzzle: 'random', size: 'large', mode: 'race', help: false },
        1,
      ),
    ).toContain('two');
    expect(
      crossword.validateOptions?.(
        { puzzle: 'ink', size: 'large', mode: 'cooperative', help: true },
        2,
      ),
    ).toContain('5 × 5');
  });
});

describe('expanded puzzle options', () => {
  it('keeps old lobbies valid and accepts edits past the old grid limit', () => {
    expect(
      crossword.optionsSchema.parse({
        puzzle: 'random',
        size: 'giant',
        mode: 'cooperative',
        help: true,
      }).difficulty,
    ).toBe('normal');
    const s = crossword.setup({
      playerIds: ['wren'],
      options: {
        puzzle: 'random',
        size: 'giant',
        mode: 'cooperative',
        help: true,
        difficulty: 'hard',
      },
      rng: rng(),
      now: 1000,
    });
    expect(s.puzzle.rows).toHaveLength(31);
    const cell = [...s.puzzle.rows.join('')].findIndex((c, i) => i > 224 && c !== '#');
    const action = actionSchema.parse({ type: 'edit', cell, letter: 'A', revision: 0 });
    expect(act(s, action).letters[cell]).toBe('A');
  });
});

describe('batched typing and honest notices', () => {
  it('applies a fill in order as one write, including two edits to the same square', () => {
    const s = setup();
    const a = act(s, {
      type: 'fill',
      edits: [
        { cell: 0, letter: 'X', revision: 0 },
        { cell: 1, letter: 'E', revision: 0 },
        { cell: 0, letter: 'P', revision: 1 },
      ],
      direction: 'across',
    });
    expect(a.letters.slice(0, 3)).toEqual(['P', 'E', '']);
    expect(a.revisions.slice(0, 2)).toEqual([2, 1]);
    expect(a.cursors.wren).toMatchObject({ cell: 0, direction: 'across' });
    expect(s.letters[0]).toBe('');
  });
  it('refuses the whole fill when one square is stale, revealed or a block', () => {
    const s = edit(setup(), 1, 'E', 'rook');
    const fill = (edits: { cell: number; letter: string; revision: number }[]) =>
      act(s, { type: 'fill', edits });
    expect(() =>
      fill([
        { cell: 0, letter: 'P', revision: 0 },
        { cell: 1, letter: 'X', revision: 0 },
      ]),
    ).toThrow('teammate');
    expect(() => fill([{ cell: 3, letter: 'P', revision: 0 }])).toThrow('white square');
    const revealed = act(s, { type: 'reveal', cell: 2, direction: 'across', scope: 'letter' });
    expect(() =>
      act(revealed, { type: 'fill', edits: [{ cell: 2, letter: 'X', revision: 1 }] }),
    ).toThrow('revealed');
    expect(() => actionSchema.parse({ type: 'fill', edits: [] })).toThrow();
  });
  it('does not claim a reveal when the letter was already right', () => {
    const s = act(edit(setup(), 0, 'P'), {
      type: 'reveal',
      cell: 0,
      direction: 'across',
      scope: 'letter',
    });
    expect(s.revealed).toEqual([]);
    expect(s.notice).toBe('That letter is already correct.');
  });
  it('congratulates a race winner on winning, not on solving together', () => {
    let s = crossword.setup({
      playerIds: ['wren', 'rook'],
      options: { puzzle: 'ink', size: 'mini', mode: 'race', help: false },
      rng: rng(),
      now: 1000,
    });
    expect(() => act(edit(s, 0, 'P'), { type: 'edit', cell: 0, letter: 'X', revision: 0 })).toThrow(
      'That square changed',
    );
    const solution = s.puzzle.rows.join('');
    s = act(s, {
      type: 'fill',
      edits: [...solution].flatMap((letter, cell) =>
        letter === '#' ? [] : [{ cell, letter, revision: 0 }],
      ),
    });
    expect(crossword.getResult(s)?.winners).toEqual(['wren']);
    expect(crossword.getPlayerView(s, 'wren').notice).not.toContain('together');
  });
});
