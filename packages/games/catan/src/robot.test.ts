import { createRng, type Rng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { layout } from './geometry';
import { catan, type CatanAction, type CatanOptions, type CatanState } from './rules';
import { act, hand, main, start, withDev } from './testkit';

const game = catan;
const ask = (s: CatanState, pid: string, seed = 1): CatanAction | null =>
  game.bot!({
    playerId: pid,
    playerIds: s.seats,
    view: game.getPlayerView(s, pid),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now: 0,
  });

/**
 * Plays as the platform does: the first bot in seat order with a move makes it, through the
 * module's applyAction; timers fire when nobody has a move.
 */
function playOut(players: string[], options: Partial<CatanOptions>, seed: number, cap: number) {
  let s = start(players, options, seed);
  const rng: Rng = createRng(seed * 31 + 7);
  let moves = 0;
  let now = 0;
  while (s.phase !== 'over' && moves < cap) {
    now += 1100;
    let moved = false;
    for (const pid of s.seats) {
      const a = game.bot!({
        playerId: pid,
        playerIds: s.seats,
        view: game.getPlayerView(s, pid),
        tableView: game.getTableView(s),
        rng,
        now,
      });
      if (!a) continue;
      const next = game.applyAction(s, pid, game.actionSchema.parse(a), rng, now);
      expect(next).not.toBe(s);
      s = next;
      moved = true;
      break;
    }
    if (!moved) {
      const t = game.nextTimer?.(s);
      if (!t) throw new Error(`stalled in ${s.phase}, round ${s.round}`);
      now = Math.max(now, t.at);
      s = game.onTimer!(s, t.id, rng, now);
    }
    moves++;
  }
  return { s, moves };
}

describe('the computer player', () => {
  const cases: [number, Partial<CatanOptions>][] = [
    [3, {}],
    [3, { points: '12', board: 'Random' }],
    [4, { board: 'Beginner', robber: 'Friendly' }],
    [4, { points: '8', turnTimer: '1 minute' }],
    [5, { robber: 'Friendly' }],
    [6, {}],
    [6, { points: '12', board: 'Random' }],
  ];
  for (const [n, options] of cases)
    for (const seed of [1, 2, 3])
      it(`finishes a game of ${n} bots (${JSON.stringify(options)}, seed ${seed})`, () => {
        const players = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron'].slice(0, n);
        const { s, moves } = playOut(players, options, seed, 3000);
        expect(s.phase, `after ${moves} moves, round ${s.round}`).toBe('over');
        expect(game.getResult(s)).not.toBe(null);
      });

  it('answers an offer made to it: yes when it gains, no otherwise', () => {
    const s0 = main({ a: { ore: 3 }, b: { wool: 4 }, c: { wool: 1 } });
    const me = s0.turn;
    const other = s0.seats.find((p) => p !== me)!;
    let s: CatanState = {
      ...s0,
      hands: { ...s0.hands, [me]: hand({ ore: 3, grain: 2 }), [other]: hand({ wool: 4 }) },
    };
    s = act(s, me, { type: 'offer', give: { ore: 1, grain: 1 }, want: { wool: 1 }, to: other });
    expect(ask(s, other)).toEqual({ type: 'answer', offer: s.offerSeq, reply: 'accept' });
    s = act(s, me, { type: 'offer', give: { ore: 1 }, want: { wool: 3 }, to: other });
    s = act(s, other, { type: 'answer', offer: s.offerSeq - 1, reply: 'accept' });
    expect(ask(s, other)).toEqual({ type: 'answer', offer: s.offerSeq, reply: 'decline' });
    // Nothing to answer once it has replied to everything.
    s = act(s, other, { type: 'answer', offer: s.offerSeq, reply: 'decline' });
    expect(ask(s, other)).toBe(null);
  });

  it('builds a city when it can, and ends its turn when it has nothing to do', () => {
    const s0 = main();
    const me = s0.turn;
    const city = { ...s0, hands: { ...s0.hands, [me]: hand({ ore: 3, grain: 2 }) } };
    expect(ask(city, me)).toMatchObject({ type: 'build', kind: 'city' });
    expect(ask(s0, me)).toEqual({ type: 'endTurn' });
  });

  it('plays a knight before rolling when the robber sits on its land', () => {
    const s0 = main();
    const me = s0.turn;
    const ready = act(s0, me, { type: 'endTurn' });
    const next = ready.turn;
    const mine = Object.entries(ready.buildings).find(([, b]) => b.owner === next)![0];
    const L = layout(ready.size);
    const tile = ready.board.tiles.findIndex(
      (t, i) => t.number !== null && L.tiles[i]!.corners.includes(mine),
    );
    const s = withDev({ ...ready, robber: tile }, next, ['knight']);
    expect(ask(s, next)).toEqual({ type: 'play', card: 'knight' });
    expect(ask(withDev(ready, next, ['knight']), next)).toEqual({ type: 'roll' });
  });

  it('discards half on a 7, keeping what it is saving for', () => {
    const s0 = main();
    const me = s0.seats[1]!;
    const s: CatanState = {
      ...s0,
      phase: 'discard',
      discards: { [me]: 4 },
      robberBy: s0.turn,
      hands: { ...s0.hands, [me]: hand({ wool: 6, ore: 2 }) },
    };
    const a = ask(s, me);
    expect(a).toEqual({ type: 'discard', cards: { wool: 4 } });
  });
});

describe('ending early', () => {
  it('saves nothing in the opening or before anyone has built', () => {
    const s = start(['a', 'b', 'c']);
    expect(game.partialResult!(s)).toBe(null);
    expect(game.partialResult!(main())).toBe(null);
  });

  it('the most victory points wins, hidden cards included', () => {
    const s0 = main();
    const [a, b] = s0.seats;
    const s = withDev(s0, b!, ['victoryPoint']);
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual([b]);
    expect(r.summary).toBe('Led with 3 points after 1 round');
    expect(r.standings!.find((x) => x.playerId === b)!.outcome).toBe('win');
    expect(r.standings!.find((x) => x.playerId === a)!.outcome).toBe('loss');
  });

  it('a tie shares the win', () => {
    const s0 = main();
    const [a, b, c] = s0.seats;
    const s = withDev(withDev(s0, a!, ['victoryPoint']), b!, ['victoryPoint']);
    const r = game.partialResult!(s)!;
    expect(r.winners).toEqual([a, b]);
    expect(r.summary).toBe('2 players tied on 3 points after 1 round');
    expect(r.standings!.map((x) => x.outcome)).toEqual(['draw', 'draw', 'loss']);
    expect(r.standings!.find((x) => x.playerId === c)!.outcome).toBe('loss');
  });
});
