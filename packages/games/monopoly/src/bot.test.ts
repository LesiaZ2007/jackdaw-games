import { BOT_LEVELS, createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { DEEDS, HOTELS, HOUSES } from './board';
import { monopoly as game, type MonopolyOptions, type MonopolyState } from './rules';

const NAMES = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron'];

const ask = (s: MonopolyState, id: string, seed: number, now: number) =>
  game.bot!({
    playerId: id,
    playerIds: s.players,
    view: game.getPlayerView(s, id),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now,
    level: BOT_LEVELS[s.players.indexOf(id) % BOT_LEVELS.length]!,
  });

function check(s: MonopolyState) {
  let houses = 0;
  let hotels = 0;
  for (const d of DEEDS) {
    const h = s.deeds[String(d)];
    if (!h) continue;
    if (h.houses === 5) hotels += 1;
    else houses += h.houses;
  }
  expect(s.bankHouses + houses).toBe(HOUSES);
  expect(s.bankHotels + hotels).toBe(HOTELS);
  for (const id of s.players) expect(s.seats[id]!.cash).toBeGreaterThanOrEqual(0);
}

const lengths: number[] = [];

/** A whole game with a bot in every seat, timers fired the way the platform would. */
function playOut(count: number, options: Partial<MonopolyOptions>, seed: number, cap: number) {
  let now = 1_000;
  const ids = NAMES.slice(0, count);
  let s = game.setup({
    playerIds: ids,
    options: { ...game.defaultOptions(count), ...options },
    rng: createRng(seed),
    now,
  });
  let moves = 0;
  while (s.phase !== 'over') {
    if (++moves > cap) {
      throw new Error(
        `no finish after ${cap} moves (${count} bots, seed ${seed}, ${s.phase}, round ${s.round})`,
      );
    }
    now += 1_300;
    let acted = false;
    for (const id of game.waitingOn!(s)) {
      const action = ask(s, id, seed * 7919 + moves, now);
      if (!action) continue;
      const next = game.applyAction(s, id, action, createRng(moves), now);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (!acted) {
      const timer = game.nextTimer!(s);
      if (!timer) throw new Error(`bots stuck in ${s.phase} (${count} bots, seed ${seed})`);
      now = Math.max(now, timer.at);
      const next = game.onTimer!(s, timer.id, createRng(moves), now);
      if (next === s) throw new Error(`timer did nothing in ${s.phase} (seed ${seed})`);
      s = next;
    }
    check(s);
  }
  lengths.push(moves);
  return s;
}

describe('Monopoly bots', { timeout: 180_000 }, () => {
  for (const count of [2, 3, 4, 6]) {
    it(`${count} bots play whole games to the end (After 20 rounds)`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const s = playOut(count, { ends: 'After 20 rounds' }, seed * 31 + count, 20_000);
        expect(game.getResult(s)).not.toBeNull();
        expect(s.winners.length).toBeGreaterThan(0);
      }
    });
  }

  it('plays with the bank keeping unbought land and a Free Parking pot', () => {
    const s = playOut(
      4,
      { ends: 'After 20 rounds', unbought: 'Stays with the bank', parking: 'Collects the taxes' },
      5,
      20_000,
    );
    expect(game.getResult(s)).not.toBeNull();
  });

  it('a long game of last one standing reaches a winner', () => {
    const s = playOut(3, { ends: 'Last one standing' }, 3, 60_000);
    const result = game.getResult(s);
    expect(result).not.toBeNull();
    expect(result!.winners.length).toBeGreaterThan(0);
  });

  it('turns down a trade that hands over a full set, takes a gift of a deed', () => {
    const s = game.setup({
      playerIds: ['wren', 'rook'],
      options: game.defaultOptions(2),
      rng: createRng(1),
      now: 0,
    });
    s.deeds['1'] = { owner: 'rook', mortgaged: false, houses: 0 };
    s.deeds['3'] = { owner: 'wren', mortgaged: false, houses: 0 };
    const nothing = { cash: 0, deeds: [], cards: 0 };
    const swap = {
      ...s,
      offers: [
        {
          id: 1,
          from: 'rook',
          to: 'wren',
          give: { ...nothing, cash: 20 },
          get: { ...nothing, deeds: [3] },
        },
      ],
    };
    expect(ask(swap, 'wren', 1, 0)).toEqual({ type: 'reject', id: 1 });
    const gift = {
      ...s,
      offers: [
        { id: 2, from: 'rook', to: 'wren', give: { ...nothing, cash: 300 }, get: { ...nothing } },
      ],
    };
    expect(ask(gift, 'wren', 1, 0)).toEqual({ type: 'accept', id: 2 });
  });

  it('reports the average length', () => {
    const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
    expect(avg).toBeGreaterThan(0);
    console.info(
      `monopoly bot games: ${lengths.length}, average ${Math.round(avg)} moves, max ${Math.max(...lengths)}`,
    );
  });
});
