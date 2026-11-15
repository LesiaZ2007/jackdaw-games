import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions, enabledPowers } from './options';
import type { MazeOptions } from './options';
import { BELL_GRACE_MS, COUNTDOWN_MS, layoutOf, maze as game } from './rules';
import type { MazeState, MazeTick } from './rules';
import {
  BASES_KEPT,
  eventsFrom,
  SPOT_BACK_MS,
  decodeOwners,
  encodeOwners,
  ghostCheckpoints,
  ownerOf,
  spotPellets,
  syncGhosts,
  syncSharedGhosts,
  FRUIT_SLACK_MS,
} from './shared';
import { FRUIT_EVERY } from './sim/chomper';
import { GhostSim, ghostSeed } from './sim/ghosts';
import type { Aim, GhostEvent, GhostInput } from './sim/ghosts';
import { MAZE_LAYOUTS, layoutsOf } from './sim/layouts';
import { decodeBits, encodeBits, pelletIndex } from './sim/pellets';
import { POINTS } from './sim/powers';
import type { PowerKind } from './sim/powers';

const WREN = 'wren';
const ROOK = 'rook';
const FINCH = 'finch';
const T0 = 10_000;
const at = (s: MazeState, t: number) => s.startAt + t;

function setup(ids: string[], options: Partial<MazeOptions> = {}, seed = 1): MazeState {
  const s = game.setup({
    playerIds: ids,
    options: { ...defaultOptions(ids.length), mode: 'Shared', mazes: 1, ...options },
    rng: createRng(seed),
    now: T0,
  });
  return game.onTimer!(s, 'countdown', createRng(2), s.startAt);
}

const size = (s: MazeState) => pelletIndex(layoutOf(s, 0)).size;
const spotSet = (s: MazeState) => new Set(spotPellets(layoutOf(s, 0)));

/** Plain pellets (not power spots), in index order. */
function plain(s: MazeState): number[] {
  const spots = spotSet(s);
  return Array.from({ length: size(s) }, (_, i) => i).filter((i) => !spots.has(i));
}

function bitsOf(s: MazeState, idx: number[]): string {
  const b = new Uint8Array(size(s));
  for (const i of idx) b[i] = 1;
  return encodeBits(b);
}

function tick(s: MazeState, id: string, patch: Partial<MazeTick> = {}): MazeTick {
  const p = s.players[id]!;
  return {
    type: 'tick',
    round: s.round,
    seq: p.seq + 1,
    t: p.lastT + 1000,
    maze: 0,
    pos: [1, 1, 'right'],
    turns: [],
    eaten: p.eaten,
    ghosts: p.facts.ghosts,
    caught: p.caught,
    fruit: p.facts.fruit,
    powers: p.facts.powers,
    lives: p.lives,
    ...patch,
  };
}

function act(s: MazeState, id: string, a: MazeTick, now = at(s, a.t)): MazeState {
  return game.applyAction(s, id, a, createRng(9), now);
}

const totalPellets = (s: MazeState) => s.ids.reduce((a, id) => a + s.players[id]!.pellets, 0);
const ownedCount = (s: MazeState) => {
  const spots = spotSet(s);
  return [...decodeOwners(s.shared!.owner, size(s))].filter((k, i) => k && !spots.has(i)).length;
};

describe('a Large Shared maze', () => {
  const EIGHT = ['wren', 'rook', 'finch', 'lark', 'robin', 'jay', 'heron', 'swift'];

  it('round-trips pellet bitsets and owners at 33×30', () => {
    const rng = createRng(5);
    for (const m of layoutsOf('Large')) {
      expect([m.w, m.h]).toEqual([33, 30]);
      const n = pelletIndex(m).size;
      for (let k = 0; k < 10; k++) {
        const owners = new Uint8Array(n).map(() => (rng.next() < 0.5 ? 0 : 1 + rng.int(8)));
        expect(decodeOwners(encodeOwners(owners), n)).toEqual(owners);
        const bits = owners.map((o) => (o ? 1 : 0));
        expect(decodeBits(encodeBits(bits), n)).toEqual(bits);
      }
    }
  });

  it('settles claims from eight players by seat', () => {
    let s = setup(EIGHT);
    expect(layoutOf(s, 0).size).toBe('Large');
    const free = plain(s);
    EIGHT.forEach((id, k) => {
      s = act(
        s,
        id,
        tick(s, id, { eaten: bitsOf(s, [free[k * 40]!, free[free.length - 1 - k]!]) }),
      );
    });
    EIGHT.forEach((id, k) => {
      expect(ownerOf(s.shared!, s.ids, free[k * 40]!)).toBe(id);
      expect(ownerOf(s.shared!, s.ids, free[free.length - 1 - k]!)).toBe(id);
    });
    expect(ownedCount(s)).toBe(16);
  });
});

describe('Shared pellets (review focus 2)', () => {
  it('the first claim to arrive owns a contested pellet; nothing double counts', () => {
    let s = setup([WREN, ROOK]);
    const p = 37;
    const [a, b] = plain(s).filter((i) => i > p);
    expect(spotSet(s).has(p)).toBe(false);
    // Wren's tick arrives first; Rook ate it earlier on its own clock but reports a second later.
    s = act(s, WREN, tick(s, WREN, { t: 5000, eaten: bitsOf(s, [p, a!]) }), at(s, 5000));
    s = act(s, ROOK, tick(s, ROOK, { t: 4000, eaten: bitsOf(s, [p, b!]) }), at(s, 6000));
    expect(ownerOf(s.shared!, s.ids, p)).toBe(WREN);
    expect(ownerOf(s.shared!, s.ids, b!)).toBe(ROOK);
    expect(s.players[WREN]!.score).toBe(2 * POINTS.pellet);
    expect(s.players[ROOK]!.score).toBe(POINTS.pellet);
    // Rook repeating the claim changes nothing.
    s = act(s, ROOK, tick(s, ROOK, { t: 6000, eaten: bitsOf(s, [p, b!]) }), at(s, 7000));
    expect(s.players[ROOK]!.score).toBe(POINTS.pellet);
    expect(totalPellets(s) * POINTS.pellet).toBe(ownedCount(s) * POINTS.pellet);
    expect(ownedCount(s)).toBe(3);
  });

  it('pellet points always equal 10 × owned pellets over many overlapping claims', () => {
    let s = setup([WREN, ROOK, FINCH]);
    const all = plain(s);
    const rng = createRng(5);
    const claims: Record<string, number[]> = { [WREN]: [], [ROOK]: [], [FINCH]: [] };
    for (let k = 0; k < 60; k++) {
      const id = s.ids[rng.int(3)]!;
      claims[id]!.push(...Array.from({ length: 4 }, () => all[rng.int(all.length)]!));
      const t = s.players[id]!.lastT + 500 + rng.int(500);
      s = act(s, id, tick(s, id, { t, eaten: bitsOf(s, claims[id]!) }), at(s, t));
    }
    const pelletScore = s.ids.reduce((a, id) => a + s.players[id]!.score, 0);
    expect(pelletScore).toBe(ownedCount(s) * POINTS.pellet);
  });

  it('the round ends when every pellet is owned', () => {
    let s = setup([WREN, ROOK]);
    const all = plain(s);
    const half = Math.floor(all.length / 2);
    s = act(s, WREN, tick(s, WREN, { t: 20_000, eaten: bitsOf(s, all.slice(0, half)) }));
    expect(s.phase).toBe('play');
    s = act(s, ROOK, tick(s, ROOK, { t: 40_000, eaten: bitsOf(s, all.slice(half)) }));
    expect(s.phase).toBe('between');
  });
});

describe('several Shared mazes', () => {
  it('everyone moves on together once a maze is all owned; scores carry; the bell ends it', () => {
    let s = setup([WREN, ROOK], { mazes: 3 });
    expect(s.layouts).toHaveLength(3);
    const all = plain(s);
    const half = Math.floor(all.length / 2);
    s = act(s, WREN, tick(s, WREN, { t: 20_000, eaten: bitsOf(s, all.slice(0, half)) }));
    const early = tick(s, WREN, { t: 21_000 });
    s = act(s, ROOK, tick(s, ROOK, { t: 40_000, eaten: bitsOf(s, all.slice(half)) }));
    expect(s.phase).toBe('play');
    expect(s.shared).toMatchObject({ maze: 1, mazeAt: 40_000 + COUNTDOWN_MS, events: [] });
    for (const id of [WREN, ROOK]) expect(s.players[id]).toMatchObject({ maze: 1, cleared: 1 });
    expect(s.players[WREN]!.score).toBe(half * POINTS.pellet);
    expect(s.players[ROOK]!.score).toBe((all.length - half) * POINTS.pellet);
    // A maze-1 tick that arrives late changes nothing.
    expect(act(s, WREN, early, at(s, 41_000))).toBe(s);

    // On maze 2 the pellets are counted on top.
    const m1 = layoutOf(s, 1);
    const spots1 = new Set(spotPellets(m1));
    const n1 = pelletIndex(m1).size;
    const plain1 = Array.from({ length: n1 }, (_, i) => i).filter((i) => !spots1.has(i));
    const bits = new Uint8Array(n1);
    for (const i of plain1.slice(0, 5)) bits[i] = 1;
    s = act(s, WREN, tick(s, WREN, { t: 50_000, maze: 1, eaten: encodeBits(bits) }));
    expect(s.players[WREN]!.score).toBe((half + 5) * POINTS.pellet);
    expect(s.players[WREN]!.pellets).toBe(half + 5);
    expect(decodeOwners(s.shared!.owner, n1).filter((k) => k === 1)).toHaveLength(5);

    s = game.onTimer!(s, 'bell', createRng(3), s.endAt! + BELL_GRACE_MS);
    expect(s.phase).toBe('between');
    const winner = half + 5 > all.length - half ? WREN : ROOK;
    expect(s.log[s.log.length - 1]!.actor).toBe(winner);
  });
});

describe('a silent player (review focus 3)', () => {
  it('Finch stops sending: the bell still ends it, Finch keeps score and tile', () => {
    let s = setup([WREN, ROOK, FINCH]);
    const all = plain(s);
    s = act(
      s,
      FINCH,
      tick(s, FINCH, { t: 1000, pos: [5, 7, 'up'], eaten: bitsOf(s, all.slice(0, 3)) }),
    );
    const finch = s.players[FINCH]!.score;
    expect(finch).toBe(3 * POINTS.pellet);
    for (let t = 2000; t <= 31_000; t += 900) {
      for (const id of [WREN, ROOK]) {
        const k = id === WREN ? 10 : 20;
        s = act(s, id, tick(s, id, { t, eaten: bitsOf(s, all.slice(k, k + 3)) }), at(s, t));
      }
      expect(game.waitingOn!(s)).toEqual([]);
    }
    expect(s.players[FINCH]!.score).toBe(finch);
    expect(s.shared!.bases).toHaveLength(BASES_KEPT);
    expect(s.shared!.aims.length).toBeLessThanOrEqual(BASES_KEPT + 2);
    for (const a of s.shared!.aims) expect(a.tiles[FINCH]).toEqual([5, 7]);
    // The aims keep beating every 2 s.
    const times = s.shared!.aims.map((a) => a.atMs);
    for (let i = 1; i < times.length; i++)
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(2000);
    const timer = game.nextTimer!(s)!;
    expect(timer).toEqual({ id: 'bell', at: s.endAt! + BELL_GRACE_MS });
    s = game.onTimer!(s, 'bell', createRng(3), timer.at);
    expect(s.phase).toBe('between');
    expect(s.players[FINCH]!.score).toBe(finch);
  });
});

/** Gives a player `k` plain pellets starting at `from`. */
function pellets(s: MazeState, id: string, from: number, k: number, t: number): MazeState {
  const all = plain(s);
  return act(s, id, tick(s, id, { t, eaten: bitsOf(s, all.slice(from, from + k)) }));
}

/** Only `kind` switched on (plus nothing else) so every spot holds it. */
function only(kind: PowerKind): Partial<MazeOptions> {
  return {
    powerUps: 'Mixed',
    hunt: kind === 'hunt',
    dash: kind === 'dash',
    phase: kind === 'phase',
    magnet: kind === 'magnet',
    jinx: kind === 'jinx',
    freeze: kind === 'freeze',
    steal: kind === 'steal',
    fog: kind === 'fog',
  };
}

describe('power spots and attacks', () => {
  it('a spot is claimed once, then comes back after 12 s as an enabled kind', () => {
    let s = setup([WREN, ROOK], { ...only('dash'), magnet: true, phase: false });
    const enabled = enabledPowers(s.options);
    s = act(s, WREN, tick(s, WREN, { t: 2000, powers: [[2000, 0, 'dash']] }));
    s = act(s, ROOK, tick(s, ROOK, { t: 2500, powers: [[1900, 0, 'dash']] }));
    expect(s.players[WREN]!.facts.powers).toHaveLength(1);
    expect(s.players[ROOK]!.facts.powers).toHaveLength(0);
    expect(s.players[WREN]!.score).toBe(POINTS.power);
    expect(s.players[ROOK]!.score).toBe(0);
    const spot = s.shared!.spots[0]!;
    expect(spot.backAt).toBe(2000 + SPOT_BACK_MS);
    expect(enabled).toContain(spot.kind);
    // Too early: ignored. Back: Rook gets it.
    s = act(s, ROOK, tick(s, ROOK, { t: 8000, powers: [[8000, 0, 'dash']] }));
    expect(s.players[ROOK]!.facts.powers).toHaveLength(0);
    const kind = s.shared!.spots[0]!.kind!;
    s = act(s, ROOK, tick(s, ROOK, { t: 14_200, powers: [[14_100, 0, 'hunt']] }));
    expect(s.players[ROOK]!.facts.powers).toEqual([[14_100, 0, kind]]);
  });

  it('every returning kind is an enabled one', () => {
    let s = setup([WREN, ROOK], { ...only('hunt'), fog: true });
    const seen = new Set<string>();
    let t = 1000;
    for (let k = 0; k < 20; k++) {
      t += SPOT_BACK_MS + 100;
      const powers = [
        ...s.players[WREN]!.facts.powers,
        [t, 1, 'hunt'] as [number, number, PowerKind],
      ];
      s = act(s, WREN, tick(s, WREN, { t, powers }));
      seen.add(s.shared!.spots[1]!.kind!);
    }
    expect([...seen].sort()).toEqual(['fog', 'hunt']);
  });

  it('in Classic a spot never comes back', () => {
    let s = setup([WREN, ROOK], { powerUps: 'Classic' });
    s = act(s, WREN, tick(s, WREN, { t: 2000, powers: [[2000, 2, 'hunt']] }));
    expect(s.shared!.spots[2]!.kind).toBeNull();
    s = act(
      s,
      WREN,
      tick(s, WREN, {
        t: 30_000,
        powers: [
          [2000, 2, 'hunt'],
          [29_000, 2, 'hunt'],
        ],
      }),
    );
    expect(s.players[WREN]!.facts.powers).toHaveLength(1);
  });

  it('steal takes from the leader-other, never from yourself, never below 0', () => {
    let s = setup([WREN, ROOK, FINCH], only('steal'));
    s = pellets(s, ROOK, 0, 30, 10_000); // 300
    s = pellets(s, FINCH, 40, 5, 10_000); // 50
    s = act(s, WREN, tick(s, WREN, { t: 11_000, powers: [[11_000, 0, 'steal']] }));
    // 15% of 300 = 45 → 50 (rounded to 10).
    expect(s.players[ROOK]!.score).toBe(250);
    expect(s.players[WREN]!.score).toBe(POINTS.power + 50);
    expect(s.players[ROOK]!.inbox.map((a) => [a.kind, a.amount])).toEqual([['steal', 50]]);
    // Rook leads and steals: from second place (Wren at 100), not from itself.
    s = act(s, ROOK, tick(s, ROOK, { t: 12_000, powers: [[12_000, 1, 'steal']] }));
    expect(s.players[ROOK]!.score).toBe(250 + POINTS.power + 20);
    expect(s.players[WREN]!.score).toBe(80);
    // A victim on 0 loses nothing.
    let z = setup([WREN, ROOK], only('steal'));
    z = act(z, WREN, tick(z, WREN, { t: 2000, powers: [[2000, 0, 'steal']] }));
    expect(z.players[ROOK]!.score).toBe(0);
    expect(z.players[WREN]!.score).toBe(POINTS.power);
  });

  it('jinx sends a ghost after the leader, or second place when the thief leads', () => {
    let s = setup([WREN, ROOK, FINCH], only('jinx'));
    s = pellets(s, WREN, 0, 30, 10_000);
    s = pellets(s, ROOK, 40, 10, 10_000);
    s = act(s, WREN, tick(s, WREN, { t: 11_000, powers: [[10_900, 0, 'jinx']] }));
    const jinx = s.shared!.events.filter((e) => e.kind === 'jinx');
    expect(jinx).toEqual([{ atMs: 10_900, kind: 'jinx', target: ROOK, untilMs: 18_900 }]);
    expect(s.players[ROOK]!.inbox.map((a) => a.kind)).toEqual(['jinx']);
    s = act(s, FINCH, tick(s, FINCH, { t: 11_500, powers: [[11_400, 1, 'jinx']] }));
    expect(
      s.shared!.events.filter((e) => e.kind === 'jinx').map((e) => e.kind === 'jinx' && e.target),
    ).toEqual([ROOK, WREN]);
  });

  it('freeze and fog reach everyone else', () => {
    for (const kind of ['freeze', 'fog'] as const) {
      let s = setup([WREN, ROOK, FINCH], only(kind));
      s = act(s, WREN, tick(s, WREN, { t: 2000, powers: [[2000, 0, kind]] }));
      expect(s.players[WREN]!.inbox).toEqual([]);
      expect(s.players[ROOK]!.inbox.map((a) => a.kind)).toEqual([kind]);
      expect(s.players[FINCH]!.inbox.map((a) => a.kind)).toEqual([kind]);
    }
  });
});

describe('ghosts, aims and fruit', () => {
  it('a ghost eaten by a Hunt chomper becomes an event; a double claim counts once', () => {
    let s = setup([WREN, ROOK], only('hunt'));
    s = act(s, WREN, tick(s, WREN, { t: 3000, powers: [[2000, 0, 'hunt']], ghosts: [[2600, 1]] }));
    expect(s.shared!.events).toContainEqual({ atMs: 2600, kind: 'eaten', ghost: 1 });
    expect(s.players[WREN]!.score).toBe(POINTS.power + POINTS.ghost[0]);
    s = act(s, ROOK, tick(s, ROOK, { t: 3200, powers: [[2100, 1, 'hunt']], ghosts: [[2700, 1]] }));
    expect(s.players[ROOK]!.facts.ghosts).toEqual([]);
    expect(s.shared!.events.filter((e) => e.kind === 'eaten')).toHaveLength(1);
  });

  it('aims beat every 2 s, each with a ghost base; old aims and events go', () => {
    let s = setup([WREN, ROOK], only('hunt'));
    s = act(s, WREN, tick(s, WREN, { t: 1000, powers: [[900, 0, 'hunt']], ghosts: [[1000, 0]] }));
    for (let t = 1500; t <= 12_000; t += 500)
      s = act(s, ROOK, tick(s, ROOK, { t, pos: [t / 1000, 1, 'right'] }));
    const aims = s.shared!.aims;
    expect(s.shared!.bases.map((b) => b.atMs)).toEqual([8000, 10_000, 12_000]);
    // A sim restored from the 8 s base steers by the 6 s aim and reads its heading from 4 s.
    expect(aims.map((a) => a.atMs)).toEqual([4000, 6000, 8000, 10_000, 12_000]);
    expect(aims[4]!.tiles[ROOK]).toEqual([12, 1]);
    expect(s.shared!.events).toEqual([]);
  });

  it('fruit shows up after every 60 owned pellets; the first claim wins', () => {
    let s = setup([WREN, ROOK]);
    s = pellets(s, WREN, 0, FRUIT_EVERY - 1, 10_000);
    expect(s.shared!.fruit).toBeNull();
    s = pellets(s, ROOK, FRUIT_EVERY - 1, 1, 10_500);
    expect(s.shared!.fruit).toEqual({ fruit: 0, atMs: 10_500, untilMs: 20_500 });
    s = act(s, ROOK, tick(s, ROOK, { t: 12_000, fruit: [0] }));
    s = act(s, WREN, tick(s, WREN, { t: 12_100, fruit: [0] }));
    expect(s.players[ROOK]!.fruit).toBe(1);
    expect(s.players[WREN]!.fruit).toBe(0);
    expect(s.players[ROOK]!.score).toBe(POINTS.pellet + 100);
    expect(s.shared!.fruit).toBeNull();
    // Repeating the same list is not a new claim.
    s = act(s, WREN, tick(s, WREN, { t: 13_000, fruit: [0] }));
    expect(s.players[WREN]!.fruit).toBe(0);
  });

  it('a fruit claim reported a moment after the fruit went still counts', () => {
    let s = setup([WREN, ROOK]);
    s = pellets(s, WREN, 0, FRUIT_EVERY, 10_000);
    expect(s.shared!.fruit!.untilMs).toBe(20_000);
    const late = act(s, ROOK, tick(s, ROOK, { t: 20_000 + FRUIT_SLACK_MS - 100, fruit: [0] }));
    expect(late.players[ROOK]!.fruit).toBe(1);
    const tooLate = act(s, ROOK, tick(s, ROOK, { t: 20_000 + FRUIT_SLACK_MS, fruit: [0] }));
    expect(tooLate.players[ROOK]!.fruit).toBe(0);
  });

  it('the table view carries the Shared record', () => {
    const s = setup([WREN, ROOK]);
    const t = game.getTableView(s);
    expect(t.shared!.spots).toHaveLength(layoutOf(s, 0).powers.length);
    expect(t.shared!.aims[0]!.atMs).toBe(0);
    expect(decodeOwners(t.shared!.owner, size(s)).every((k) => k === 0)).toBe(true);
  });
});

/** Every aim and event the server held during a run, oldest first. */
class Gathered {
  private aims = new Map<string, Aim>();
  private events = new Map<string, GhostEvent>();
  add(s: MazeState): MazeState {
    for (const a of s.shared!.aims) this.aims.set(JSON.stringify(a), a);
    for (const e of s.shared!.events) this.events.set(JSON.stringify(e), e);
    return s;
  }
  input(): GhostInput {
    const by = <T extends { atMs: number }>(xs: Iterable<T>) =>
      [...xs].sort((a, b) => a.atMs - b.atMs);
    return { aims: by(this.aims.values()), events: by(this.events.values()) };
  }
}

/** A sim fed everything from the round start, as a phone that saw it all would run it. */
function reference(s: MazeState, input: GhostInput, tMs: number): GhostSim {
  const sim = new GhostSim(layoutOf(s, 0), ghostSeed(s.seed, 0), 1);
  sim.stepTo(tMs, input);
  return sim;
}

describe('ghost bases the server keeps', () => {
  /** Ticks for Wren every 900 ms up to `until`. */
  function run(s0: MazeState, until: number, seen?: Gathered): MazeState {
    let s = s0;
    for (let t = 900; t <= until; t += 900) {
      s = act(s, WREN, tick(s, WREN, { t, pos: [1, 1, 'right'] }));
      seen?.add(s);
    }
    return s;
  }

  it('a jinx ghost lives on in the bases after its event drops away', () => {
    let s = setup([WREN, ROOK]);
    s = {
      ...s,
      shared: {
        ...s.shared!,
        events: [
          { atMs: 500, kind: 'jinx', target: ROOK, untilMs: 12_000 },
          { atMs: 600, kind: 'eaten', ghost: 1 },
        ],
      },
    };
    s = run(s, 11_000);
    const sh = s.shared!;
    expect(sh.bases).toHaveLength(BASES_KEPT);
    expect(sh.bases[0]!.atMs).toBeGreaterThan(1500);
    expect(sh.events).toEqual([]);
    expect(sh.bases[BASES_KEPT - 1]!.c.ghosts.some((g) => g.jinx?.target === ROOK)).toBe(true);
  });

  it('a ghost eaten before the oldest base does not score', () => {
    let s = setup([WREN, ROOK]);
    s = run(s, 12_000);
    const from = eventsFrom(s.shared!);
    expect(from).toBeGreaterThan(0);
    s = act(s, WREN, tick(s, WREN, { t: 12_900, ghosts: [[from - 100, 2]] }));
    expect(s.players[WREN]!.ghostsEaten).toBe(0);
    expect(s.shared!.events.some((e) => e.kind === 'eaten')).toBe(false);
    s = act(s, WREN, tick(s, WREN, { t: 13_800, ghosts: [[13_000, 2]] }));
    expect(s.players[WREN]!.ghostsEaten).toBe(1);
  });

  it('ghosts restored from the newest base equal a sim fed everything from the start', () => {
    const seen = new Gathered();
    let s = seen.add(setup([WREN, ROOK], only('hunt')));
    let rookX = 1;
    for (let t = 900; t <= 40_000; t += 900) {
      const eats: [number, number][] = t === 9900 ? [[9500, 0]] : t === 24_300 ? [[24_000, 1]] : [];
      s = seen.add(
        act(
          s,
          WREN,
          tick(s, WREN, {
            t,
            pos: [1, 1, 'right'],
            ghosts: [...s.players[WREN]!.facts.ghosts, ...eats],
          }),
        ),
      );
      rookX = rookX >= 10 ? 1 : rookX + 1;
      s = seen.add(act(s, ROOK, tick(s, ROOK, { t: t + 300, pos: [rookX, 1, 'right'] })));
    }
    expect(s.players[WREN]!.ghostsEaten).toBe(2);
    const input = seen.input();
    // Every kept base is the reference at its time.
    for (const b of s.shared!.bases) expect(b.c).toEqual(reference(s, input, b.atMs).checkpoint());
    // A phone that has only the table view now, stepped to a moment after the last report.
    const tv = game.getTableView(s);
    const sim = new GhostSim(layoutOf(s, 0), ghostSeed(s.seed, 0), 1);
    const cps = ghostCheckpoints(sim);
    syncSharedGhosts(sim, cps, tv.shared!, 40_500);
    expect(sim.ghosts()).toEqual(reference(s, input, 40_500).ghosts());
  });

  it('a late ghost eat dated before the newest base steps it again from an older one', () => {
    const seen = new Gathered();
    let s = run(seen.add(setup([WREN, ROOK])), 9000, seen);
    const before = s.shared!.bases;
    expect(before.map((b) => b.atMs)).toEqual([2700, 5400, 8100]);
    // Rook reports a ghost it ate at 6 s (between the two older bases) only now.
    s = seen.add(act(s, ROOK, tick(s, ROOK, { t: 9300, ghosts: [[6000, 0]] })));
    expect(s.players[ROOK]!.ghostsEaten).toBe(1);
    const after = s.shared!.bases;
    expect(after.map((b) => b.atMs)).toEqual([2700, 5400, 8100]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]!.rev).toBeGreaterThan(before[2]!.rev);
    expect(after[2]!.c).not.toEqual(before[2]!.c);
    expect(after[2]!.c).toEqual(reference(s, seen.input(), 8100).checkpoint());
  });

  it('an 8-player table view at three minutes stays small', () => {
    const ids = ['wren', 'rook', 'finch', 'lark', 'robin', 'jay', 'kite', 'swift'];
    let s = setup(ids, { minutes: 4 });
    const m = layoutOf(s, 0);
    expect(m.size).toBe('Large');
    const n = size(s);
    const open: [number, number][] = [...pelletIndex(m).keys()].map(
      (k) => k.split(',').map(Number) as [number, number],
    );
    const turns: Record<string, [number, number, number, 'up' | 'down' | 'left' | 'right'][]> = {};
    const dirs = ['up', 'down', 'left', 'right'] as const;
    for (let t = 900, k = 0; t <= 180_000; t += 900, k++) {
      ids.forEach((id, seat) => {
        const p = s.players[id]!;
        const at1 = open[(k * 7 + seat * 31) % open.length]!;
        const at2 = open[(k * 7 + seat * 31 + 3) % open.length]!;
        turns[id] = [
          ...(turns[id] ?? []),
          [t - 600, at1[0], at1[1], dirs[(k + seat) % 4]!] as const,
          [t - 300, at2[0], at2[1], dirs[(k + seat + 1) % 4]!] as const,
        ].slice(-40) as (typeof turns)[string];
        // Claims creep up to about half the maze over the three minutes.
        const claim = new Uint8Array(n);
        for (let i = seat; i < Math.floor((n * t) / 360_000); i += ids.length) claim[i] = 1;
        const ghosts: [number, number][] =
          k % 25 === seat ? [...p.facts.ghosts, [t - 200, seat % 4]] : p.facts.ghosts;
        s = act(
          s,
          id,
          tick(s, id, {
            t,
            pos: [at2[0], at2[1], dirs[(k + seat + 1) % 4]!],
            turns: turns[id]!,
            eaten: encodeBits(claim),
            ghosts,
          }),
          at(s, t),
        );
      });
    }
    expect(s.phase).toBe('play');
    const table = JSON.stringify(game.getTableView(s)).length;
    const view = JSON.stringify(game.getPlayerView(s, 'rook')).length;
    console.log(`8-player Shared at 3 min: table view ${table} bytes, player view ${view} bytes`);
    expect(table).toBeLessThan(8 * 1024);
    expect(view).toBeLessThan(2 * 1024);
  });
});

describe('syncGhosts', () => {
  const m = MAZE_LAYOUTS[0]!;
  const aims: Aim[] = [
    { atMs: 0, tiles: { wren: [13, 18], rook: [1, 1] } },
    { atMs: 2000, tiles: { wren: [10, 18], rook: [4, 1] } },
    { atMs: 4000, tiles: { wren: [8, 16], rook: [6, 3] } },
    { atMs: 6000, tiles: { wren: [4, 16], rook: [6, 7] } },
    { atMs: 8000, tiles: { wren: [1, 19], rook: [5, 10] } },
  ];
  const late: GhostEvent[] = [
    { atMs: 3100, kind: 'jinx', target: 'rook', untilMs: 11_100 },
    { atMs: 4200, kind: 'eaten', ghost: 0 },
  ];
  const aimsBy = (t: number) => aims.filter((a) => a.atMs <= t);

  it('a late event or aim gives the same ghosts as having it from the start', () => {
    const full: GhostInput = { aims, events: late };
    const ref = new GhostSim(m, 7, 1);
    ref.stepTo(10_000, full);

    const sim = new GhostSim(m, 7, 1);
    const cps = ghostCheckpoints(sim);
    // Aims arrive about 700 ms late; the events only at 6.5 s.
    for (let t = 100; t <= 10_000; t += 100) {
      const input: GhostInput = { aims: aimsBy(t - 700), events: t >= 6500 ? late : [] };
      syncGhosts(sim, cps, input, t);
    }
    expect(sim.ghosts()).toEqual(ref.ghosts());
    expect(sim.ghosts().some((g) => g.id === 4)).toBe(true);
  });

  it('without the late event the ghosts differ (the test can tell)', () => {
    const ref = new GhostSim(m, 7, 1);
    ref.stepTo(10_000, { aims, events: late });
    const sim = new GhostSim(m, 7, 1);
    sim.stepTo(6500, { aims, events: [] });
    sim.stepTo(10_000, { aims, events: late });
    expect(sim.ghosts()).not.toEqual(ref.ghosts());
  });
});
