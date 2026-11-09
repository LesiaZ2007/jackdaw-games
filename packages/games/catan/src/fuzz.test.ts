import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { RESOURCE_COUNT, type BoardStyle } from './board';
import { legalMoves } from './bot';
import { piecesLeft } from './build';
import { COMMODITY_COUNT, knightMoves, type Progress, type Track } from './ck';
import { catan, type CatanAction, type CatanReveal, type CatanState } from './rules';
import { sailMoves } from './sea';
import {
  citySpotsOf,
  knightSpotsOf,
  layoutOf,
  roadSpotsOf,
  settleSpotsOf,
  shipSpotsOf,
} from './spots';
import { act, hand, main, start } from './testkit';
import { COMMODITIES, RESOURCES, countCards, type Cards, type DevCard } from './types';
import { GameError } from '@jackdaw/engine';

const game = catan;

/** Everyone's secrets but `keep`'s swapped for others of the same size. */
function scrambled(s: CatanState, keep?: string): CatanState {
  const fake = (c: Cards): Cards => ({ ...hand(), ore: countCards(c) });
  const r = s.robbery;
  const knows = r && keep && (r.thief === keep || r.victim === keep);
  return {
    ...s,
    hands: Object.fromEntries(
      s.seats.map((p) => [p, p === keep ? s.hands[p]! : fake(s.hands[p]!)]),
    ),
    dev: Object.fromEntries(
      s.seats.map((p) => [
        p,
        p === keep ? s.dev[p]! : s.dev[p]!.map((d) => ({ ...d, card: 'monopoly' as DevCard })),
      ]),
    ),
    deck: s.deck.map(() => 'yearOfPlenty' as DevCard),
    ...(s.ck
      ? {
          ck: {
            ...s.ck,
            // Others' progress cards and every deck are secret; only their sizes show.
            hands: Object.fromEntries(
              s.seats.map((p) => [
                p,
                p === keep ? s.ck!.hands[p]! : s.ck!.hands[p]!.map(() => 'crane' as Progress),
              ]),
            ),
            decks: {
              science: s.ck.decks.science.map(() => 'crane' as Progress),
              trade: s.ck.decks.trade.map(() => 'crane' as Progress),
              politics: s.ck.decks.politics.map(() => 'crane' as Progress),
            },
          },
        }
      : {}),
    robbery:
      r && !knows && r.resource ? { ...r, resource: r.resource === 'ore' ? 'wool' : 'ore' } : r,
  };
}

const configs: [string[], BoardStyle][] = [];
for (const n of [3, 4, 5, 6])
  for (const board of ['Balanced', 'Random', 'Beginner'] as const)
    configs.push([['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n), board]);

describe('random whole games', () => {
  let finished = 0;
  it.each(configs.map((c, i) => [i, ...c] as const))(
    'game %i (%j, %s) stays sound and never leaks',
    (i, players, board) => {
      const rng = createRng(500 + i);
      let s = start([...players], { board }, 500 + i);
      const total = RESOURCE_COUNT[s.size];
      for (let step = 0; step < 6000 && s.phase !== 'over'; step++) {
        let pid = rng.pick(game.waitingOn!(s));
        // Now and then someone else answers or proposes a trade.
        if (s.phase === 'main' && !s.paired && rng.next() < 0.2) pid = rng.pick(s.seats);
        const moves = legalMoves(s, pid);
        if (!moves.length) {
          expect(game.waitingOn!(s)).not.toContain(pid);
          continue;
        }
        const pick = rng.next() < 0.6 ? moves[0]! : rng.pick(moves);
        s = game.applyAction(s, pid, pick as CatanAction, rng, step * 1000);
        // Every card is accounted for, and no supply goes negative.
        for (const r of RESOURCES) {
          expect(s.bank[r]).toBeGreaterThanOrEqual(0);
          expect(s.bank[r] + s.seats.reduce((n, p) => n + s.hands[p]![r], 0)).toBe(total);
          for (const p of s.seats) expect(s.hands[p]![r]).toBeGreaterThanOrEqual(0);
        }
        for (const p of s.seats)
          for (const left of Object.values(piecesLeft(s.buildings, s.roads, p)))
            expect(left).toBeGreaterThanOrEqual(0);
        if (s.phase !== 'over') {
          expect(game.getTableView(scrambled(s))).toEqual(game.getTableView(s));
          for (const p of s.seats)
            expect(game.getPlayerView(scrambled(s, p), p)).toEqual(game.getPlayerView(s, p));
        }
      }
      if (s.phase === 'over') {
        finished++;
        const result = game.getResult(s)!;
        const reveal = result.reveal as CatanReveal;
        expect(result.winners).toEqual([s.winner]);
        expect(reveal.points[s.winner!]!.total).toBeGreaterThanOrEqual(s.target);
        expect(result.standings!.filter((x) => x.outcome === 'win')).toHaveLength(1);
      }
    },
    60_000,
  );

  it('most games finish', () => {
    expect(finished).toBeGreaterThan(configs.length * 0.75);
  });
});

const EXPANSIONS = [
  'Base game',
  'Seafarers',
  'Cities & Knights',
  'Seafarers + Cities & Knights',
] as const;

describe('random whole games with every expansion', () => {
  const runs: [string, (typeof EXPANSIONS)[number], number][] = [];
  for (const expansion of EXPANSIONS)
    for (const n of [3, 5])
      for (const seed of [1, 2]) runs.push([`${n} players`, expansion, n * 10 + seed]);

  it.each(runs.map((r, i) => [i, ...r] as const))(
    'game %i (%s, %s) keeps moving, stays sound and never leaks',
    (i, _label, expansion, code) => {
      const n = Math.floor(code / 10);
      const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
      const rng = createRng(900 + i);
      let s = start(players, { expansion }, 900 + i);
      const total = RESOURCE_COUNT[s.size];
      const goods = s.ck ? COMMODITY_COUNT[s.size] : 0;
      let moves = 0;
      for (let step = 0; step < 4000 && s.phase !== 'over'; step++) {
        let pid = rng.pick(game.waitingOn!(s));
        if (s.phase === 'main' && !s.paired && rng.next() < 0.2) pid = rng.pick(s.seats);
        const legal = legalMoves(s, pid);
        if (!legal.length) {
          expect(game.waitingOn!(s)).not.toContain(pid);
          continue;
        }
        const pick = rng.next() < 0.6 ? legal[0]! : rng.pick(legal);
        try {
          s = game.applyAction(s, pid, pick as CatanAction, rng, step * 1000);
        } catch (e) {
          // A move the bot offers must be legal.
          throw e instanceof GameError
            ? new Error(`${e.message} for ${JSON.stringify(pick)} in ${s.phase}`)
            : e;
        }
        moves++;
        for (const r of RESOURCES) {
          expect(s.bank[r]).toBeGreaterThanOrEqual(0);
          expect(s.bank[r] + s.seats.reduce((x, p) => x + s.hands[p]![r], 0)).toBe(total);
          for (const p of s.seats) expect(s.hands[p]![r]).toBeGreaterThanOrEqual(0);
        }
        for (const g of COMMODITIES) {
          expect(s.bank[g] + s.seats.reduce((x, p) => x + s.hands[p]![g], 0)).toBe(goods);
          for (const p of s.seats) expect(s.hands[p]![g]).toBeGreaterThanOrEqual(0);
        }
        for (const p of s.seats)
          for (const left of Object.values(piecesLeft(s.buildings, s.roads, p)))
            expect(left).toBeGreaterThanOrEqual(0);
        if (s.phase !== 'over') {
          expect(game.getTableView(scrambled(s))).toEqual(game.getTableView(s));
          for (const p of s.seats)
            expect(game.getPlayerView(scrambled(s, p), p)).toEqual(game.getPlayerView(s, p));
        }
      }
      // The game keeps moving: it ends, or it gets well into its turns.
      expect(moves).toBeGreaterThan(100);
      expect(s.phase === 'over' || s.turnSeq > 20).toBe(true);
      if (s.phase === 'over') {
        const result = game.getResult(s)!;
        expect(result.winners).toEqual([s.winner]);
        expect((result.reveal as CatanReveal).points[s.winner!]!.total).toBeGreaterThanOrEqual(
          s.target,
        );
      }
    },
    120_000,
  );
});

/**
 * Every kind of move an expansion adds, with parameters drawn at random (most are refused): the
 * rules must refuse cleanly with a GameError, never throw anything else, and never break the
 * card counts or the hidden information.
 */
function wildMoves(s: CatanState, pid: string, rng: ReturnType<typeof createRng>): CatanAction[] {
  const L = layoutOf(s);
  const out: CatanAction[] = [];
  const own = Object.keys(s.buildings).filter((c) => s.buildings[c]!.owner === pid);
  const tracks: Track[] = ['science', 'trade', 'politics'];
  for (const c of own) out.push({ type: 'build', kind: 'wall', at: c });
  for (const c of knightSpotsOf(s, pid).slice(0, 3))
    out.push({ type: 'build', kind: 'knight', at: c });
  for (const e of shipSpotsOf(s, pid).slice(0, 4)) out.push({ type: 'build', kind: 'ship', at: e });
  for (const c of settleSpotsOf(s, pid, false).slice(0, 2))
    out.push({ type: 'build', kind: 'settlement', at: c });
  for (const c of citySpotsOf(s, pid).slice(0, 2)) out.push({ type: 'build', kind: 'city', at: c });
  for (const e of roadSpotsOf(s, pid).slice(0, 2)) out.push({ type: 'build', kind: 'road', at: e });
  for (const track of tracks) out.push({ type: 'improve', track });
  for (const [c, k] of Object.entries(s.ck?.knights ?? {})) {
    if (k.owner !== pid) continue;
    out.push({ type: 'activate', at: c }, { type: 'promote', at: c }, { type: 'chase', from: c });
    for (const to of knightMoves(L, s, c).slice(0, 3)) out.push({ type: 'knight', from: c, to });
  }
  for (const [from, tos] of Object.entries(sailMoves(L, s, pid)))
    for (const to of tos.slice(0, 2)) out.push({ type: 'sail', from, to });
  const cards = ['lumber', 'brick', 'wool', 'grain', 'ore', 'paper', 'cloth', 'coin'] as const;
  const rivals = s.seats.filter((p) => p !== pid);
  for (const card of s.ck?.hands[pid] ?? []) {
    const t1 = rng.int(s.board.tiles.length);
    out.push({
      type: 'progress',
      card,
      resource: rng.pick([...cards]),
      dice: [rng.int(6) + 1, rng.int(6) + 1],
      tiles: [t1, rng.int(s.board.tiles.length)],
      tile: t1,
      at: rng.pick([...own, ...L.edgeIds.slice(0, 5), ...Object.keys(s.ck!.knights)]),
      victim: rng.pick(rivals),
    });
  }
  for (const give of cards)
    out.push({ type: 'bank', give, get: rng.pick(cards.filter((c) => c !== give)), n: 1 });
  return out;
}

describe('wild moves in every expansion', () => {
  const everSeen = new Set<string>();
  const runs: [(typeof EXPANSIONS)[number], number][] = [];
  for (const expansion of EXPANSIONS.slice(1))
    for (const n of [3, 5]) for (const k of [0, 1, 2]) runs.push([expansion, n + k * 10]);

  it.each(runs.map((r, i) => [i, ...r] as const))(
    'game %i (%s, code %i) refuses cleanly and stays sound',
    (i, expansion, code) => {
      const n = code % 10;
      const players = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
      const rng = createRng(1300 + i);
      let s = start(players, { expansion }, 1300 + i);
      const total = RESOURCE_COUNT[s.size];
      const goods = s.ck ? COMMODITY_COUNT[s.size] : 0;
      let accepted = 0;
      let refusals = 0;
      const seen = new Set<string>();
      for (let step = 0; step < 3000 && s.phase !== 'over'; step++) {
        const pid = rng.pick(game.waitingOn!(s));
        // Hand the player on their turn plenty to spend, out of the bank.
        if (s.phase === 'main' && !s.paired && rng.next() < 0.3) {
          const hands = { ...s.hands };
          const bank = { ...s.bank };
          for (const c of [...RESOURCES, ...COMMODITIES]) {
            const k = Math.min(2, bank[c]);
            bank[c] -= k;
            hands[pid] = { ...hands[pid]!, [c]: hands[pid]![c] + k };
          }
          s = { ...s, hands, bank };
        }
        const wild = s.phase === 'main' && rng.next() < 0.85 ? wildMoves(s, pid, rng) : [];
        const legal = legalMoves(s, pid);
        const pool = wild.length ? wild : legal;
        if (!pool.length) continue;
        const pick = rng.pick(pool);
        try {
          s = game.applyAction(s, pid, pick as CatanAction, rng, step * 1000);
          accepted++;
          seen.add(pick.type === 'build' ? `build:${pick.kind}` : pick.type);
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
          refusals++;
          continue;
        }
        for (const r of RESOURCES) {
          expect(s.bank[r] + s.seats.reduce((x, p) => x + s.hands[p]![r], 0)).toBe(total);
          for (const p of s.seats) expect(s.hands[p]![r]).toBeGreaterThanOrEqual(0);
        }
        for (const g of COMMODITIES) {
          expect(s.bank[g] + s.seats.reduce((x, p) => x + s.hands[p]![g], 0)).toBe(goods);
          for (const p of s.seats) expect(s.hands[p]![g]).toBeGreaterThanOrEqual(0);
        }
        if (s.ck) {
          for (const p of s.seats) {
            expect(s.ck.hands[p]!.length).toBeLessThanOrEqual(5);
            expect(
              Object.values(s.buildings).filter((b) => b.owner === p && b.city).length,
            ).toBeLessThanOrEqual(4);
          }
          for (const c of Object.keys(s.ck.knights)) expect(s.buildings[c]).toBeUndefined();
          for (const w of s.ck.walls) expect(s.buildings[w]?.city).toBe(true);
          for (const c of Object.values(s.ck.metros)) expect(s.buildings[c!]?.city).toBe(true);
        }
        if (s.phase !== 'over') {
          expect(game.getTableView(scrambled(s))).toEqual(game.getTableView(s));
          for (const p of s.seats)
            expect(game.getPlayerView(scrambled(s, p), p)).toEqual(game.getPlayerView(s, p));
        }
      }
      expect(accepted).toBeGreaterThan(30);
      expect(refusals).toBeGreaterThan(0);
      for (const k of seen) everSeen.add(k);
    },
    120_000,
  );

  it('really played the expansions� own moves', () => {
    for (const k of ['build:ship', 'build:knight', 'build:wall', 'improve', 'activate', 'promote'])
      expect(everSeen.has(k), k).toBe(true);
  });
});

describe('results', () => {
  it('standings, the points breakdown and highlights', () => {
    const s0 = main();
    const me = s0.turn;
    const corner = Object.keys(s0.buildings).find((c) => s0.buildings[c]!.owner === me)!;
    const s: CatanState = {
      ...s0,
      hands: { ...s0.hands, [me]: hand({ ore: 3, grain: 2 }) },
      dev: {
        ...s0.dev,
        [me]: Array.from({ length: 6 }, () => ({ card: 'victoryPoint' as DevCard, bought: 0 })),
      },
      longest: { holder: me, lengths: { ...s0.longest.lengths, [me]: 6 } },
      best: { haul: { pid: me, n: 5 } },
    };
    const over = act(s, me, { type: 'build', kind: 'city', at: corner });
    const result = game.getResult(over)!;
    const reveal = result.reveal as CatanReveal;
    expect(reveal.points[me]).toEqual({
      settlements: 1,
      cities: 1,
      road: 2,
      army: 0,
      vp: 6,
      total: 11,
    });
    expect(result.standings!.find((x) => x.playerId === me)!.outcome).toBe('win');
    expect(result.highlights!.map((h) => h.award).sort()).toEqual(['Biggest haul', 'Longest road']);
    expect(game.getTableView(over).vpCards![me]).toBe(6);
    expect(result.summary).toMatch(/11 points/);
  });

  it('announces the first player, awards, monopolies and the win', () => {
    const s = start(['a', 'b', 'c']);
    expect(game.announce!(null, s)).toEqual([`{${s.turn}} goes first`]);
    const s0 = main();
    const after = {
      ...s0,
      eventSeq: 1,
      award: { seq: 1, kind: 'army' as const, from: null, to: 'b' },
    };
    expect(game.announce!(s0, after)).toEqual(['{b} takes Largest Army']);
  });
});
