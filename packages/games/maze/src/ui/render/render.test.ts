import { createRng } from '@jackdaw/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultOptions } from '../../options';
import type { MazeOptions } from '../../options';
import { maze as game } from '../../rules';
import type { MazeState } from '../../rules';
import type { FrameEffect, FrameModel } from '../frame';
import { Runner } from '../runner';
import { draw, drawMini, effectsOf, wallCache, type Layer } from './core';
import { makeConfetti, stepConfetti } from './effects';
import { createSound, soundFor } from './sound';

const WREN = 'wren';
const ROOK = 'rook';
const T0 = 10_000;
const LOOKS: MazeOptions['look'][] = ['Printed', 'Neon', 'Classic', 'Cabinet'];
const SIZES = ['Small', 'Medium', 'Large'] as const;

/** A fake 2D context that records every call and accepts every property. */
function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const props: Record<string, unknown> = {};
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(props, {
    get(_t, name: string) {
      if (name in props) return props[name];
      if (name === 'measureText') return () => ({ width: 10 });
      if (name === 'createRadialGradient' || name === 'createLinearGradient')
        return (...a: unknown[]) => {
          calls.push(name + a.length);
          return gradient;
        };
      return (...a: unknown[]) => {
        calls.push(name + a.length);
      };
    },
    set(_t, name: string, v) {
      props[name] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const layerMaker = () => {
  const made: Layer[] = [];
  const make = (): Layer => {
    const l = { image: {} as CanvasImageSource, ctx: fakeCtx().ctx };
    made.push(l);
    return l;
  };
  return { make, made };
};

function frames(o: Partial<MazeOptions>, ids: string[], me: string | null) {
  let clock = T0;
  const options = { ...defaultOptions(ids.length), ...o };
  const s: MazeState = game.setup({
    playerIds: ids,
    options,
    rng: createRng(3),
    now: T0,
  });
  const runner = new Runner({
    me,
    table: game.getTableView(s),
    view: me ? game.getPlayerView(s, me) : null,
    names: { wren: 'Wren', rook: 'Rook' },
    now: () => clock,
    send: async () => true,
  });
  const out: FrameModel[] = [];
  return {
    step(ms: number) {
      for (let i = 0; i < ms / 50; i++) {
        clock += 50;
        out.push(runner.frame(50));
      }
      return out[out.length - 1]!;
    },
    runner,
    out,
    startAt: s.startAt,
  };
}

afterEach(() => wallCache.clear());

describe('draw', () => {
  for (const look of LOOKS)
    for (const size of SIZES) {
      it(`${look} ${size}: every phase draws without throwing`, () => {
        const f = frames({ mode: 'Shared', size, look }, [WREN, ROOK], WREN);
        const { ctx, calls } = fakeCtx();
        const { make } = layerMaker();
        let t = 0;
        const go = (m: FrameModel) =>
          draw(ctx, m, { look, tile: 16, dpr: 2, t: (t += 16), makeLayer: make });
        const cd = f.step(500);
        expect(cd.phase).toBe('countdown');
        go(cd);
        const play = f.step(6000);
        expect(play.phase).toBe('play');
        go(play);
        const b = play.board!;
        expect(b.layout.w).toBeGreaterThan(0);
        const me = b.chompers.find((c) => c.isYou)!;
        const busy: FrameModel = {
          ...play,
          banner: { text: 'FOGGED BY ROOK', tone: 'attack', power: 'fog', ageMs: 300, key: 1 },
          go: true,
          board: {
            ...b,
            fog: { x: me.x, y: me.y, msLeft: 2000 },
            frozenMs: 900,
            fruit: { x: 3, y: 3, fruit: 0, kind: 'cherry', msLeft: 1200 },
            chompers: b.chompers.map((c) => ({
              ...c,
              power: { kind: 'magnet', msLeft: 900, totalMs: 6000 },
              trail: [[c.x - 1, c.y]],
            })),
            ghosts: b.ghosts.map((g, i) => ({
              ...g,
              mode: i % 3 === 0 ? 'fright' : i % 3 === 1 ? 'eyes' : g.mode,
              ending: true,
              colorIndex: i === 0 ? -1 : g.colorIndex,
            })),
          },
          effects: [
            { key: 1, kind: 'power', x: 2, y: 2, power: 'dash', by: WREN, mine: true },
            { key: 2, kind: 'magnet', x: 4, y: 4, by: WREN },
            { key: 3, kind: 'ghostEaten', x: 5, y: 5, ghost: 0, points: 200, by: WREN },
            { key: 4, kind: 'caught', x: 6, y: 6, by: WREN, mine: true },
            { key: 5, kind: 'mazeCleared', maze: 0 },
          ],
        };
        go(busy);
        for (const power of ['hunt', 'dash', 'phase'] as const)
          go({
            ...busy,
            effects: [],
            board: {
              ...busy.board!,
              chompers: busy.board!.chompers.map((c) => ({
                ...c,
                power: { kind: power, msLeft: 3000, totalMs: 5000 },
              })),
            },
          });
        go({
          ...play,
          phase: 'play',
          board: {
            ...b,
            chompers: b.chompers.map((c) => ({ ...c, dying: 0.5 })),
          },
        });
        for (const phase of ['cleared', 'finished', 'over'] as const) go({ ...play, phase });
        expect(calls.length).toBeGreaterThan(100);
      });
    }

  it('draws Solo and the TV views, and the minis of a Race', () => {
    const solo = frames({ mode: 'Solo', mazes: 2 }, [WREN], WREN);
    const { ctx } = fakeCtx();
    const m = solo.step(6000);
    for (const look of LOOKS) draw(ctx, m, { look, tile: 14, dpr: 1, t: 100 });
    const tv = frames({ mode: 'Shared' }, [WREN, ROOK], null);
    draw(ctx, tv.step(6000), { look: 'Neon', tile: 14, dpr: 1, t: 200 });
    const race = frames({ mode: 'Race', mazes: 1 }, [WREN, ROOK], null);
    const rf = race.step(6000);
    expect(rf.minis).toHaveLength(2);
    draw(ctx, rf, { look: 'Printed', tile: 14, dpr: 1, t: 300 });
    for (const look of LOOKS) {
      const { make } = layerMaker();
      for (const mini of rf.minis) drawMini(ctx, mini, { look, tile: 6, dpr: 2, makeLayer: make });
      drawMini(ctx, { ...rf.minis[0]!, done: true }, { look, tile: 6, dpr: 2, t: 50 });
    }
  });

  it('draws walls directly when no layer can be made', () => {
    const f = frames({ mode: 'Solo' }, [WREN], WREN);
    const { ctx, calls } = fakeCtx();
    draw(ctx, f.step(1000), { look: 'Printed', tile: 12, dpr: 1, t: 0, makeLayer: () => null });
    expect(wallCache.builds).toBe(0);
    expect(calls.filter((c) => c.startsWith('fillRect')).length).toBeGreaterThan(20);
  });

  it('builds the wall layer once per board and look across frames', () => {
    const f = frames({ mode: 'Shared' }, [WREN, ROOK], WREN);
    const { ctx } = fakeCtx();
    const { make, made } = layerMaker();
    let t = 0;
    for (let i = 0; i < 20; i++)
      draw(ctx, f.step(100), { look: 'Printed', tile: 16, dpr: 1, t: (t += 100), makeLayer: make });
    expect(made).toHaveLength(1);
    expect(wallCache.builds).toBe(1);
    draw(ctx, f.step(100), { look: 'Neon', tile: 16, dpr: 1, t: (t += 100), makeLayer: make });
    expect(wallCache.builds).toBe(2);
    draw(ctx, f.step(100), { look: 'Neon', tile: 18, dpr: 1, t: (t += 100), makeLayer: make });
    expect(wallCache.builds).toBe(3);
    draw(ctx, f.step(100), { look: 'Neon', tile: 18, dpr: 1, t: t + 100, makeLayer: make });
    expect(wallCache.builds).toBe(3);
  });
});

describe('effects', () => {
  it('persist across frames and expire after their life', () => {
    const f = frames({ mode: 'Shared' }, [WREN, ROOK], WREN);
    const { ctx } = fakeCtx();
    const base = f.step(6000);
    const events: FrameEffect[] = [
      { key: 1, kind: 'power', x: 2, y: 2, power: 'hunt', by: WREN, mine: true },
      { key: 2, kind: 'ghostEaten', x: 3, y: 3, ghost: 1, points: 400, by: WREN },
      { key: 3, kind: 'caught', x: 4, y: 4, by: ROOK, mine: false },
    ];
    let t = 1000;
    const opts = (tt: number) => ({ look: 'Printed' as const, tile: 12, dpr: 1, t: tt });
    draw(ctx, { ...base, effects: [] }, opts(t));
    draw(ctx, { ...base, effects: events }, opts((t += 16)));
    const fx = effectsOf(ctx);
    expect(fx.sparks.length).toBeGreaterThan(30);
    expect(fx.rings.length).toBe(3);
    expect(fx.floats).toHaveLength(1);
    draw(ctx, { ...base, effects: [] }, opts((t += 300)));
    expect(fx.active).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) draw(ctx, { ...base, effects: [] }, opts((t += 100)));
    expect(fx.active).toBe(0);
    expect(fx.shakeT).toBe(0);
  });

  it('confetti pieces fall off and are dropped', () => {
    let bits = makeConfetti(300, 600, 40, ['#fff']);
    expect(bits).toHaveLength(40);
    for (let i = 0; i < 400; i++) bits = stepConfetti(bits, 1 / 30, 600);
    expect(bits).toHaveLength(0);
  });
});

describe('sound', () => {
  it('does nothing without an AudioContext', () => {
    const s = createSound();
    expect(() => {
      s.resume();
      for (const k of [
        'blip',
        'eat',
        'die',
        'bonk',
        'power',
        'pick',
        'start',
        'clear',
        'win',
        'over',
      ] as const)
        s.play(k);
    }).not.toThrow();
    s.muted = true;
    s.play('eat');
    expect(s.muted).toBe(true);
  });

  it('maps events to sounds from your point of view', () => {
    expect(soundFor({ key: 1, kind: 'count', n: 0 }, WREN)).toBe('start');
    expect(soundFor({ key: 1, kind: 'caught', x: 0, y: 0, by: WREN, mine: true }, WREN)).toBe(
      'die',
    );
    expect(
      soundFor({ key: 1, kind: 'caught', x: 0, y: 0, by: ROOK, mine: false }, WREN),
    ).toBeNull();
  });
});
