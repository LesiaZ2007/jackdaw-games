import { describe, it, expect } from 'vitest';
import { createRng, type BotLevel } from '@jackdaw/engine';
import { crossword, type CrosswordOptions, type CrosswordState } from './rules';
import { crosswordBot } from './bot';
const seats = ['wren', 'rook', 'finch'];
function ask(s: CrosswordState, id: string, level: BotLevel, seed: number, now: number) {
  return crosswordBot({
    playerId: id,
    playerIds: s.players,
    view: crossword.getPlayerView(s, id),
    tableView: crossword.getTableView(s),
    level,
    rng: createRng(seed),
    now,
  });
}
function play(options: CrosswordOptions, level: BotLevel, seed: number) {
  let state = crossword.setup({ playerIds: seats, options, rng: createRng(seed), now: 0 });
  let moves = 0;
  for (let tick = 1; tick <= state.letters.length * 5 + 100; tick++) {
    const now = tick * 2500;
    for (const id of seats) {
      const action = ask(state, id, level, seed * 10000 + tick + seats.indexOf(id), now);
      if (!action) continue;
      expect(action.type).toBe('edit');
      state = crossword.applyAction(state, id, action, createRng(tick), now);
      moves++;
      if (crossword.getResult(state)) return { state, moves };
    }
  }
  throw Error('Bots did not finish ' + JSON.stringify(options) + ' at ' + level);
}
describe('crossword computer players', () => {
  for (const mode of ['cooperative', 'race'] as const)
    for (const level of ['easy', 'normal', 'hard'] as const)
      for (const puzzle of ['ink', 'camp', 'post', 'random'] as const)
        it(
          mode + ' ' + level + ' finishes ' + puzzle,
          () => {
            const { state, moves } = play(
              {
                puzzle,
                size: puzzle === 'random' ? 'large' : 'mini',
                mode,
                help: false,
                difficulty: 'normal',
              },
              level,
              31,
            );
            expect(moves).toBeGreaterThan(0);
            const result = crossword.getResult(state)!;
            expect(result.winners).toHaveLength(mode === 'race' ? 1 : 3);
            expect(state.revealed).toEqual([]);
            expect(state.checks).toBe(0);
          },
          20000,
        );
  for (const mode of ['cooperative', 'race'] as const)
    it(
      'finishes a giant hard ' + mode + ' puzzle',
      () => {
        const { state } = play(
          { puzzle: 'random', size: 'giant', difficulty: 'hard', mode, help: false },
          'normal',
          42,
        );
        expect(state.puzzle.rows).toHaveLength(31);
        expect(crossword.getResult(state)).not.toBeNull();
      },
      30000,
    );
  it('waits to think, including at the start', () => {
    const s = crossword.setup({
      playerIds: seats,
      options: { puzzle: 'ink', size: 'mini', mode: 'race', help: false },
      rng: createRng(1),
      now: 1000,
    });
    expect(ask(s, 'wren', 'normal', 1, 1000)).toBeNull();
    expect(ask(s, 'wren', 'normal', 1, 20000)).not.toBeNull();
  });
  it('does not use hidden solution rows or opponents’ private letters', () => {
    const s = crossword.setup({
      playerIds: seats,
      options: { puzzle: 'ink', size: 'mini', mode: 'race', help: false },
      rng: createRng(1),
      now: 0,
    });
    const changed = structuredClone(s);
    changed.puzzle.rows = changed.puzzle.rows.map((r) => r.replace(/[A-Z]/g, 'Z'));
    changed.boards.rook!.letters[0] = 'X';
    const changedAgain = structuredClone(changed);
    changedAgain.boards.rook!.letters[0] = 'Y';
    expect(ask(s, 'wren', 'hard', 11, 20000)).toEqual(ask(changed, 'wren', 'hard', 11, 20000));
    expect(ask(changed, 'wren', 'hard', 11, 20000)).toEqual(
      ask(changedAgain, 'wren', 'hard', 11, 20000),
    );
  });
  it('makes more typing mistakes on Easy than Hard', () => {
    const s = crossword.setup({
      playerIds: seats,
      options: { puzzle: 'ink', size: 'mini', mode: 'race', help: false },
      rng: createRng(1),
      now: 0,
    });
    const solution = s.puzzle.rows.join('');
    const errors = (level: BotLevel) =>
      Array.from({ length: 200 }, (_, seed) => ask(s, 'wren', level, seed, 20000)).filter(
        (a) => a?.type === 'edit' && a.letter !== solution[a.cell],
      ).length;
    expect(errors('easy')).toBeGreaterThan(errors('hard') + 20);
  });
  it('uses independent bot clocks so human typing cannot starve bots', () => {
    expect(crossword.realTime).toBe(true);
    expect(crossword.botDelayMs).toBeGreaterThanOrEqual(1000);
  });
});
