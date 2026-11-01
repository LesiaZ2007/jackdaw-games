import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  BETWEEN_MS,
  BLITZ_MS,
  COUNTDOWN_MS,
  SHOW_MS,
  tetra as game,
  type TetraAction,
  type TetraOptions,
  type TetraState,
} from './rules';
import { freshStack, type Stack } from './sim';

const A = 'wren';
const B = 'rook';
const C = 'lark';
const T0 = 1_000;
const GO = T0 + COUNTDOWN_MS + 2_000;

function setup(ids: string[] = [A, B], options: Partial<TetraOptions> = {}, seed = 1) {
  return game.setup({
    playerIds: ids,
    options: { ...game.defaultOptions(ids.length), ...options },
    rng: createRng(seed),
    now: T0,
  });
}

function stackWith(patch: Partial<Stack>): Stack {
  return { ...freshStack(), ...patch };
}

function tickOf(
  s: TetraState,
  stack: Stack,
  used: [number, number][] = [],
  finishMs?: number,
): TetraAction {
  return {
    type: 'tick',
    round: s.round,
    stack,
    used,
    ...(finishMs !== undefined ? { finishMs } : {}),
  };
}

function act(s: TetraState, id: string, a: TetraAction, now = GO, seed = 7) {
  return game.applyAction(s, id, a, createRng(seed), now);
}

describe('options', () => {
  it('defaults by player count', () => {
    expect(game.defaultOptions(1).mode).toBe('Sprint');
    expect(game.defaultOptions(2).mode).toBe('Versus');
  });

  it('needs two for Versus', () => {
    const o = game.defaultOptions(2);
    expect(game.validateOptions!(o, 1)).toEqual(expect.any(String));
    expect(game.validateOptions!(o, 2)).toBeNull();
    expect(game.validateOptions!({ ...o, mode: 'Sprint' }, 1)).toBeNull();
  });
});

describe('setup', () => {
  it('starts round one with a countdown and fresh boards', () => {
    const s = setup();
    expect(s.phase).toBe('play');
    expect(s.round).toBe(1);
    expect(s.startAt).toBe(T0 + COUNTDOWN_MS);
    expect(Object.keys(s.boards)).toEqual([A, B]);
    expect(s.boards[A]!.stack).toEqual(freshStack());
    expect(s.firstTo).toBe(2);
  });

  it('rings the bell for Blitz', () => {
    const s = setup([A], { mode: 'Blitz' });
    expect(s.endsAt).toBe(s.startAt + BLITZ_MS);
  });
});

describe('ticks', () => {
  it('ignores a tick for another round', () => {
    const s = setup();
    const out = act(s, A, { ...tickOf(s, stackWith({ pieces: 3 })), round: 5 });
    expect(out).toBe(s);
  });

  it('ignores one older than what is in', () => {
    const s = setup();
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 5, lines: 2 })));
    const s2 = act(s1, A, tickOf(s1, stackWith({ pieces: 3, lines: 9 })));
    expect(s2.boards[A]!.stack.lines).toBe(2);
  });

  it('is idempotent', () => {
    const s = setup();
    const a = tickOf(s, stackWith({ pieces: 4, sent: 2, quads: 1 }));
    const once = act(s, A, a);
    const twice = act(once, A, a);
    expect(twice).toEqual(once);
  });
});

describe('rubble', () => {
  it('lands on the other player in Versus', () => {
    const s = setup();
    const out = act(s, A, tickOf(s, stackWith({ pieces: 2, sent: 4 })));
    expect(out.boards[B]!.owed).toMatchObject([{ total: 4, used: 0, from: A }]);
    expect(out.boards[B]!.received).toBe(4);
    expect(out.boards[A]!.owed).toEqual([]);
  });

  it('goes to whoever has received least with Even', () => {
    const s = setup([A, B, C], { targeting: 'Even' });
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 2, sent: 2 })));
    const hit = s1.boards[B]!.received > 0 ? B : C;
    const other = hit === B ? C : B;
    const s2 = act(s1, other, tickOf(s1, stackWith({ pieces: 2, sent: 3 })));
    expect(s2.boards[A]!.received).toBe(3);
    expect(s2.boards[hit]!.received).toBe(2);
  });

  it('is used up by cumulative reports', () => {
    const s = setup();
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 2, sent: 4 })));
    const id = s1.boards[B]!.owed[0]!.id;
    const s2 = act(s1, B, tickOf(s1, stackWith({ pieces: 1 }), [[id, 3]]));
    expect(game.getPlayerView(s2, B).owed).toMatchObject([{ id, lines: 1, used: 3, total: 4 }]);
    const s3 = act(s2, B, tickOf(s2, stackWith({ pieces: 2 }), [[id, 4]]));
    expect(s3.boards[B]!.owed).toEqual([]);
    // Going back down changes nothing.
    const s4 = act(s2, B, tickOf(s2, stackWith({ pieces: 2 }), [[id, 1]]));
    expect(s4.boards[B]!.owed[0]!.used).toBe(3);
  });
});

describe('rounds and matches', () => {
  it('gives the knockout to whoever threw last and ends a two-player round', () => {
    const s = setup([A, B], { firstTo: '2 wins' });
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 2, sent: 3 })));
    const s2 = act(s1, B, tickOf(s1, stackWith({ pieces: 4, topped: true })));
    expect(s2.boards[B]!.done).toBe(true);
    expect(s2.boards[B]!.koBy).toBe(A);
    expect(s2.boards[A]!.kos).toBe(1);
    expect(s2.wins[A]).toBe(1);
    expect(s2.phase).toBe('between');
    expect(s2.rounds[0]!.order).toEqual([A, B]);
  });

  it('starts the next round fresh', () => {
    const s = setup([A, B], { firstTo: '2 wins' });
    const s1 = act(s, B, tickOf(s, stackWith({ pieces: 4, topped: true })));
    expect(s1.phase).toBe('between');
    const nextAt = s1.showBy!;
    expect(game.nextTimer!(s1)).toEqual({ id: 'between', at: nextAt });
    const s2 = game.onTimer!(s1, 'between', createRng(3), nextAt);
    expect(s2.phase).toBe('play');
    expect(s2.round).toBe(2);
    expect(s2.startAt).toBe(nextAt + COUNTDOWN_MS);
    expect(s2.boards[A]!.stack).toEqual(freshStack());
    expect(s2.boards[B]!.done).toBe(false);
    expect(s2.wins[A]).toBe(1);
    expect(nextAt).toBe(GO + BETWEEN_MS);
  });

  it('ends the match after the set number of wins', () => {
    const s = setup([A, B], { firstTo: '1 win' });
    const s1 = act(s, B, tickOf(s, stackWith({ pieces: 4, topped: true })));
    expect(s1.phase).toBe('show');
    expect(game.getResult(s1)).toBeNull();
    const s2 = game.onTimer!(s1, 'show', createRng(3), GO + SHOW_MS);
    expect(s2.phase).toBe('over');
    const r = game.getResult(s2)!;
    expect(r.winners).toEqual([A]);
    expect(r.standings).toEqual([
      { playerId: A, outcome: 'win' },
      { playerId: B, outcome: 'loss' },
    ]);
    expect(r.stats!.rows).toHaveLength(2);
    expect(r.summary).toContain(A);
  });

  it('finishes a Sprint at forty lines', () => {
    const s = setup([A], { mode: 'Sprint' });
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 90, lines: 39 })));
    expect(s1.boards[A]!.done).toBe(false);
    const s2 = act(s1, A, tickOf(s1, stackWith({ pieces: 92, lines: 40 }), [], 61_234));
    expect(s2.boards[A]!.finishMs).toBe(61_234);
    expect(s2.phase).toBe('show');
    expect(game.onTimer!(s2, 'show', createRng(1), GO + SHOW_MS).phase).toBe('over');
  });

  it('ends a Blitz at the bell, best score first', () => {
    const s = setup([A, B], { mode: 'Blitz' });
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 30, score: 1_500 })));
    const s2 = act(s1, B, tickOf(s1, stackWith({ pieces: 30, score: 2_500 })));
    expect(s2.phase).toBe('play');
    const bell = game.nextTimer!(s2)!;
    expect(bell.id).toBe('bell');
    const s3 = game.onTimer!(s2, 'bell', createRng(1), bell.at);
    expect(s3.rounds[0]!.order).toEqual([B, A]);
    expect(s3.rounds[0]!.winner).toBe(B);
    expect(s3.phase).toBe('show');
  });
});

describe('what people can see', () => {
  it('keeps the seed out of the table view', () => {
    const s = setup([A, B], {}, 4242);
    const json = JSON.stringify(game.getTableView(s));
    expect(json).not.toContain('seed');
    expect(json).not.toContain(String(s.seed));
    expect(game.getPlayerView(s, A).seed).toBe(s.seed);
    expect(game.getPlayerView(s, 'watcher').seed).toBeNull();
  });

  it("keeps one player's owed holes from another", () => {
    const s = setup();
    const s1 = act(s, A, tickOf(s, stackWith({ pieces: 2, sent: 4 })));
    expect(s1.boards[B]!.owed).toHaveLength(1);
    expect(JSON.stringify(game.getPlayerView(s1, A))).not.toContain('"hole"');
    expect(JSON.stringify(game.getTableView(s1))).not.toContain('"hole"');
    const mine = game.getPlayerView(s1, B).owed;
    expect(mine).toHaveLength(1);
    expect(mine[0]!.hole).toBe(s1.boards[B]!.owed[0]!.hole);
    expect(game.getTableView(s1).boards.find((b) => b.id === B)!.owing).toBe(4);
  });
});
