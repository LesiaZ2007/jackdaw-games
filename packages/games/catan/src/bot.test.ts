import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { legalMoves } from './bot';
import { catan, type CatanState } from './rules';
import { act, hand, main, playSetup, ready, seedFor, start, withDev } from './testkit';

const game = catan;
const MIN = 60_000;

/** Fires the turn timer once, at its deadline. */
function fire(s: CatanState, seed = 3): CatanState {
  const t = game.nextTimer!(s);
  expect(t).not.toBe(null);
  return game.onTimer!(s, t!.id, createRng(seed), t!.at);
}

const timed = (s: CatanState, now = 0): CatanState => {
  const t = { ...s, turnSecs: 60 };
  // Any move stamps a fresh deadline; a no-op stamp here starts the clock.
  return { ...t, actBy: now + MIN };
};

describe('the bots’ pace', () => {
  it('waits at least 3 s after a roll (the roll takes the screen), 2.1–4.7 s otherwise', () => {
    const r = ready();
    const pace = game.botDelayMs as (s: CatanState) => number;
    expect(pace(r)).toBe(2_600);
    const rolled = act(r, r.turn, { type: 'roll' }, seedFor(6));
    expect(rolled.justRolled).toBe(true);
    expect(pace(rolled) * 0.8).toBeGreaterThanOrEqual(3_000);
    const after = act(rolled, r.turn, { type: 'endTurn' });
    expect(after.justRolled).toBeUndefined();
    expect(pace(after)).toBe(2_600);
  });
});

describe('waitingOn', () => {
  it('names the placer, the player on their turn (or paired), or everyone still to discard', () => {
    const s = start(['a', 'b', 'c']);
    expect(game.waitingOn!(s)).toEqual([s.setup!.order[0]]);
    const r = ready();
    expect(game.waitingOn!(r)).toEqual([r.turn]);
    const big = { ...r, hands: { a: hand({ ore: 8 }), b: hand({ wool: 9 }), c: hand() } };
    const seven = act(big, r.turn, { type: 'roll' }, seedFor(7));
    expect(game.waitingOn!(seven).sort()).toEqual(['a', 'b']);
  });
});

describe('the turn timer', () => {
  it('is off by default and stamps a deadline per step when on', () => {
    expect(game.nextTimer!(ready())).toBe(null);
    const s = start(['a', 'b', 'c'], { turnTimer: '1 minute' });
    const s1 = act(
      s,
      s.setup!.order[0]!,
      {
        type: 'build',
        kind: 'settlement',
        at: legalMoves(s, s.setup!.order[0]!).map((m) => (m.type === 'build' ? m.at : ''))[0]!,
      },
      1,
      5000,
    );
    expect(game.nextTimer!(s1)).toEqual({ id: 'turn', at: 5000 + MIN });
  });

  it('finishes a setup placement', () => {
    const s = timed(start(['a', 'b', 'c']));
    const after = fire(s);
    expect(after.setup!.step).toBe(1);
    expect(Object.keys(after.buildings)).toHaveLength(1);
    expect(Object.keys(after.roads)).toHaveLength(1);
  });

  it('rolls for you', () => {
    const after = fire(timed(ready()));
    expect(after.dice).not.toBe(null);
  });

  it('discards for everyone still to discard', () => {
    const r = ready();
    const s = act(
      { ...r, turnSecs: 60, hands: { a: hand({ ore: 8 }), b: hand({ wool: 9 }), c: hand() } },
      r.turn,
      { type: 'roll' },
      seedFor(7),
      0,
    );
    const after = fire(s);
    expect(after.discards).toEqual({});
    expect(after.phase).toBe('robber');
    expect(after.hands.a!.ore).toBe(4);
    expect(after.hands.b!.wool).toBe(5);
  });

  it('moves the robber', () => {
    const r = ready();
    const s = act({ ...r, turnSecs: 60 }, r.turn, { type: 'roll' }, seedFor(7), 0);
    const after = fire(s);
    expect(after.robber).not.toBe(s.robber);
    expect(after.phase).toBe('main');
  });

  it('ends road building and the turn', () => {
    const s0 = main();
    const me = s0.turn;
    const s = act(
      withDev({ ...s0, turnSecs: 60 }, me, ['roadBuilding']),
      me,
      { type: 'play', card: 'roadBuilding' },
      1,
      0,
    );
    expect(s.phase).toBe('roadBuilding');
    const after = fire(s);
    expect(after.turn).not.toBe(me);
    expect(after.phase).toBe('roll');
  });

  it('ends the turn in the main phase and in a paired phase', () => {
    const s = timed(main());
    expect(fire(s).turn).not.toBe(s.turn);
    const five = playSetup(start(['a', 'b', 'c', 'd', 'e']));
    const rolled = act(five, five.turn, { type: 'roll' }, seedFor(6));
    const paired = act({ ...rolled, turnSecs: 60 }, rolled.turn, { type: 'endTurn' }, 1, 0);
    expect(paired.paired).not.toBe(null);
    const after = fire(paired);
    expect(after.paired).toBe(null);
    expect(after.phase).toBe('roll');
  });
});

describe('legal moves', () => {
  it('every listed move is accepted', () => {
    let s = start(['a', 'b', 'c', 'd'], {}, 9);
    const rng = createRng(9);
    for (let step = 0; step < 400 && s.phase !== 'over'; step++) {
      const pid = rng.pick(game.waitingOn!(s));
      const moves = legalMoves(s, pid);
      expect(moves.length, `${s.phase}`).toBeGreaterThan(0);
      for (const m of moves.slice(0, 6))
        expect(() => game.applyAction(s, pid, m, createRng(step), 0)).not.toThrow();
      s = game.applyAction(s, pid, rng.pick(moves), rng, 0);
    }
  });
});
