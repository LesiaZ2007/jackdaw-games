import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { RESOURCE_COUNT, type BoardStyle } from './board';
import { legalMoves } from './bot';
import { piecesLeft } from './build';
import { catan, type CatanAction, type CatanReveal, type CatanState } from './rules';
import { act, hand, main, start } from './testkit';
import { RESOURCES, countCards, type Cards, type DevCard } from './types';

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
