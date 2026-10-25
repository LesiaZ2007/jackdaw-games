import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  battleship as game,
  unhitCells,
  type BattleshipOptions,
  type BattleshipState,
} from './rules';

const ask = (s: BattleshipState, id: string, seed: number, now: number) =>
  game.bot!({
    playerId: id,
    playerIds: s.players,
    view: game.getPlayerView(s, id),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now,
    level: 'normal',
  });

/** A whole game with a bot in each seat, timers fired the way the platform would. */
function playOut(options: Partial<BattleshipOptions>, seed: number) {
  let now = 1_000;
  let s = game.setup({
    playerIds: ['wren', 'rook'],
    options: { ...game.defaultOptions(2), ...options },
    rng: createRng(seed),
    now,
  });
  let moves = 0;
  while (s.phase !== 'over') {
    if (++moves > 400) throw new Error(`no finish after 400 moves (seed ${seed}, ${s.phase})`);
    now += 1_100;
    const waiting = game.waitingOn!(s);
    let acted = false;
    for (const id of waiting) {
      const action = ask(s, id, seed * 7919 + moves, now);
      if (!action) continue;
      const next = game.applyAction(s, id, action, createRng(moves), now);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (acted) {
      for (const id of s.players) {
        for (const cell of unhitCells(s, id)) {
          const foe = s.players.find((p) => p !== id)!;
          expect(game.getTableView(s).boards[id]!.cells[cell]).toBe('blank');
          expect(game.getPlayerView(s, foe).boards[id]!.cells[cell]).toBe('blank');
        }
      }
      continue;
    }
    const timer = game.nextTimer!(s);
    if (!timer) throw new Error(`bots stuck in ${s.phase} (seed ${seed})`);
    now = Math.max(now, timer.at);
    const next = game.onTimer!(s, timer.id, createRng(moves), now);
    if (next === s) throw new Error(`timer did nothing in ${s.phase}`);
    s = next;
  }
  return s;
}

describe('Battleship bots', () => {
  const tables: [Partial<BattleshipOptions>, string][] = [
    [{}, 'one shot'],
    [{ firing: 'Salvo' }, 'salvo'],
    [{ turnTimer: '30 seconds' }, 'one shot, timer'],
    [{ firing: 'Salvo', turnTimer: '60 seconds' }, 'salvo, timer'],
  ];

  for (const [options, label] of tables) {
    it(`an all-bot table finishes: ${label}`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const s = playOut(options, seed);
        const result = game.getResult(s);
        expect(result?.winners).toHaveLength(1);
        expect(result?.summary).toMatch(/sunk/);
      }
    });
  }

  it('aims from its own chart, never from the fleet it cannot see', () => {
    let s = game.setup({
      playerIds: ['wren', 'rook'],
      options: game.defaultOptions(2),
      rng: createRng(1),
      now: 0,
    });
    const place = ask(s, 'wren', 2, 0);
    expect(place?.type).toBe('place');
    if (place?.type !== 'place') return;
    s = game.applyAction(s, 'wren', place, createRng(3), 1_000);
    const rook = ask(s, 'rook', 4, 1_000);
    expect(rook?.type).toBe('place');
    if (rook?.type !== 'place') return;
    s = game.applyAction(s, 'rook', rook, createRng(5), 2_000);
    const view = game.getPlayerView(s, s.toAct!);
    const foe = s.players.find((id) => id !== s.toAct)!;
    // The view the bot is given has the foe's unsunk squares as blank water.
    for (const cell of unhitCells(s, foe)) expect(view.boards[foe]!.cells[cell]).toBe('blank');
    const shot = ask(s, s.toAct!, 6, 3_000);
    expect(shot?.type).toBe('fire');
    if (shot?.type !== 'fire') return;
    expect(shot.cells.length).toBe(view.salvo);
    const next = game.applyAction(s, s.toAct!, shot, createRng(7), 4_000);
    expect(next.volleys).toHaveLength(1);
  });
});
