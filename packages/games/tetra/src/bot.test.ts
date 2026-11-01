import { BOT_LEVELS, createRng, type BotLevel } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  actionSchema,
  tetra as game,
  type TetraAction,
  type TetraOptions,
  type TetraState,
} from './rules';

const IDS = ['wren', 'rook', 'lark', 'finch'];

function start(n: number, options: Partial<TetraOptions> = {}, seed = 1) {
  const ids = IDS.slice(0, n);
  return game.setup({
    playerIds: ids,
    options: { ...game.defaultOptions(n), ...options },
    rng: createRng(seed),
    now: 1_000,
  });
}

function ask(s: TetraState, id: string, now: number, level: BotLevel = 'normal', seed = 5) {
  return game.bot!({
    playerId: id,
    playerIds: s.players,
    view: game.getPlayerView(s, id),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now,
    level,
  });
}

describe('tetra bot', () => {
  it('waits for the countdown', () => {
    const s = start(2);
    expect(ask(s, 'wren', s.startAt - 1)).toBeNull();
    expect(ask(s, 'wren', s.startAt + 100)).toBeNull();
  });

  it('plays nothing once out', () => {
    let s = start(2);
    const a: TetraAction = {
      type: 'tick',
      round: 1,
      stack: { ...s.boards.wren!.stack, topped: true, pieces: 3 },
      used: [],
    };
    s = game.applyAction(s, 'wren', a, createRng(1), s.startAt + 1_000);
    expect(ask(s, 'wren', s.startAt + 9_000)).toBeNull();
  });

  it('keeps to its pace', () => {
    for (const level of BOT_LEVELS) {
      let s = start(2, { mode: 'Blitz' });
      const now = s.startAt + 10_000;
      const pps = { easy: 0.8, normal: 1.3, hard: 2.1 }[level];
      for (let i = 0; i < 5; i++) {
        const a = ask(s, 'wren', now, level, i);
        if (!a) break;
        expect(a.stack.pieces).toBeLessThanOrEqual(s.boards.wren!.stack.pieces + 6);
        s = game.applyAction(s, 'wren', a, createRng(i), now);
      }
      expect(s.boards.wren!.stack.pieces).toBe(Math.floor(10 * pps));
    }
  });

  it('makes actions the schema accepts', () => {
    const s = start(2);
    const a = ask(s, 'wren', s.startAt + 12_000, 'hard')!;
    expect(a).not.toBeNull();
    expect(() => actionSchema.parse(a)).not.toThrow();
    expect(a.stack.pieces).toBe(6);
  });

  it('does not play past the bell', () => {
    const s = start(1, { mode: 'Blitz' });
    const a = ask(s, 'wren', s.endsAt! + 60_000, 'normal')!;
    expect(a.stack.pieces).toBe(6);
    expect(a.stack.pieces).toBeLessThanOrEqual(Math.floor(120 * 1.3));
  });
});

/** Runs bots alone through a game on a fake clock. */
function playOut(s0: TetraState, level: BotLevel, maxSteps: number) {
  let s = s0;
  let now = s.startAt;
  for (let step = 0; step < maxSteps && s.phase !== 'over'; step++) {
    now += 400;
    for (const id of s.players) {
      const a = ask(s, id, now, level, step * 7 + id.length);
      if (a) {
        actionSchema.parse(a);
        s = game.applyAction(s, id, a, createRng(step), now);
      }
    }
    const t = game.nextTimer!(s);
    if (t && now >= t.at) s = game.onTimer!(s, t.id, createRng(step + 1), now);
  }
  return s;
}

describe('bots playing alone', () => {
  for (const n of [2, 3, 4]) {
    it(`finish a Versus game of ${n}`, () => {
      const s = playOut(start(n, { firstTo: '1 win' }, n), 'normal', 12_000);
      expect(s.phase).toBe('over');
      expect(game.getResult(s)!.winners).toHaveLength(1);
    });
  }

  it('finish a two-round Versus match', () => {
    const s = playOut(start(2, { firstTo: '2 wins' }, 9), 'normal', 12_000);
    expect(s.phase).toBe('over');
  }, 30_000);

  for (const level of ['normal', 'hard'] as const) {
    it(`clear forty lines of Sprint (${level})`, () => {
      const s = playOut(start(1, { mode: 'Sprint' }, 3), level, 2_000);
      expect(s.phase).toBe('over');
      expect(s.boards.wren!.stack.lines).toBeGreaterThanOrEqual(40);
      expect(s.boards.wren!.finishMs).not.toBeNull();
    });
  }

  it('score in Blitz', () => {
    const s = playOut(start(1, { mode: 'Blitz' }, 3), 'normal', 2_000);
    expect(s.phase).toBe('over');
    expect(s.boards.wren!.stack.score).toBeGreaterThan(0);
  });
});
