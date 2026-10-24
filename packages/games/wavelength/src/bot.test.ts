import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { placeClue, wavelengthBot } from './bot';
import { CLUES, cluesFor, missingCards } from './clues';
import {
  CLUE_MAX,
  wavelength as game,
  type WavelengthOptions,
  type WavelengthState,
} from './rules';
import { SPECTRUMS } from './spectrums';

const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'swift', 'kite', 'crow'];
const ids = (n: number) => Array.from({ length: n }, (_, i) => birds[i] ?? `bird${i}`);

const ask = (s: WavelengthState, id: string, seed: number, now: number) =>
  wavelengthBot({
    playerId: id,
    playerIds: s.players,
    view: game.getPlayerView(s, id),
    tableView: game.getTableView(s),
    rng: createRng(seed),
    now,
  });

/** A whole game with a bot in every seat, timers fired as the platform would. */
function playOut(players: string[], options: WavelengthOptions, seed: number) {
  let now = 1_000;
  let s = game.setup({ playerIds: players, options, rng: createRng(seed), now });
  let moves = 0;
  const clues: string[] = [];
  while (s.phase !== 'over') {
    if (++moves > 2000) throw new Error(`no finish after 2000 moves (seed ${seed})`);
    now += 1100;
    let acted = false;
    for (const id of game.waitingOn!(s)) {
      const action = ask(s, id, seed * 7919 + moves, now);
      if (!action) continue;
      if (action.type === 'clue') clues.push(action.text);
      const next = game.applyAction(s, id, action, createRng(moves), now);
      expect(next, JSON.stringify(action)).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (acted) continue;
    const timer = game.nextTimer!(s);
    if (!timer) throw new Error(`bots stuck in ${s.phase} (seed ${seed})`);
    now = Math.max(now, timer.at);
    const next = game.onTimer!(s, timer.id, createRng(moves), now);
    if (next === s) throw new Error(`timer did nothing in ${s.phase}`);
    s = next;
  }
  return { s, moves, clues };
}

const base = (n: number, o: Partial<WavelengthOptions> = {}): WavelengthOptions => ({
  ...game.defaultOptions(n),
  ...o,
});

describe('Wavelength bots', () => {
  const tables: [number, Partial<WavelengthOptions>, string][] = [
    [2, {}, 'Together, shared dial'],
    [3, { guessing: 'Everyone guesses' }, 'Together, everyone guesses'],
    [4, {}, 'Teams, shared dial'],
    [4, { guessing: 'Everyone guesses', timer: '60 seconds' }, 'Teams, everyone guesses, timer'],
    [8, { teams: 'Chosen', sides: {} }, 'Teams, chosen (unplaced)'],
    [9, { guessing: 'Everyone guesses', length: 'Short' }, 'Teams, everyone guesses, short'],
    [15, { length: 'Long' }, 'Teams, 15, long'],
    [15, { mode: 'Together', guessing: 'Everyone guesses' }, 'Together, 15, everyone guesses'],
  ];
  for (const [n, o, label] of tables) {
    it(`an all-bot table finishes: ${n} players, ${label}`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const players = ids(n);
        const options = base(n, o);
        if (options.teams === 'Chosen')
          options.sides = Object.fromEntries(
            players.slice(0, 3).map((id, i) => [id, i % 2 ? 'moon' : 'sun']),
          );
        const { s, clues } = playOut(players, options, seed);
        expect(game.getResult(s)).not.toBeNull();
        for (const c of clues) {
          expect(c.trim().length).toBeGreaterThan(0);
          expect(c.length).toBeLessThanOrEqual(CLUE_MAX);
        }
      }
    });
  }

  it('scores like a decent team: around three points a round together', () => {
    let points = 0;
    let rounds = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = playOut(ids(4), base(4, { mode: 'Together' }), seed);
      points += s.scores.sun;
      rounds += s.history.length;
    }
    const each = points / rounds;
    expect(each).toBeGreaterThan(2);
    expect(each).toBeLessThan(3.8);
  });

  it('gives the clue nearest the target', () => {
    const s = game.setup({
      playerIds: ids(4),
      options: base(4, { mode: 'Together' }),
      rng: createRng(1),
      now: 0,
    });
    const t: WavelengthState = { ...s, round: { ...s.round, target: 12 } };
    const a = ask(t, t.round.psychic, 1, 0);
    expect(a?.type).toBe('clue');
    if (a?.type !== 'clue') return;
    const spot = placeClue(t.round.offer.map((i) => SPECTRUMS[i]!)[a.card]!, a.text);
    expect(spot).not.toBeNull();
    expect(Math.abs(spot! - 12)).toBeLessThanOrEqual(15);
  });

  it('reads a person’s clue that names an end', () => {
    expect(placeClue(['Cold', 'Hot'], 'Really hot')).toBe(85);
    expect(placeClue(['Cold', 'Hot'], 'Bit cold')).toBe(15);
    expect(placeClue(['Cold', 'Hot'], 'lava')).toBe(97);
    expect(placeClue(['Cold', 'Hot'], 'Soup')).toBeNull();
  });
});

describe('the bots’ clue table', () => {
  it('has clues for every card, spread along the dial', () => {
    expect(missingCards()).toEqual([]);
    for (const s of SPECTRUMS) {
      const clues = cluesFor(s);
      expect(clues.length, s.join('|')).toBeGreaterThanOrEqual(4);
      expect(clues[0]!.at, s.join('|')).toBeLessThanOrEqual(20);
      expect(clues[clues.length - 1]!.at, s.join('|')).toBeGreaterThanOrEqual(80);
    }
  });

  it('only lists cards in the game, each clue a fair clue', () => {
    const keys = new Set(SPECTRUMS.map(([l, r]) => `${l}|${r}`));
    for (const [key, clues] of CLUES) {
      expect(keys.has(key), key).toBe(true);
      const texts = clues.map((c) => c.text.toLowerCase());
      expect(new Set(texts).size, key).toBe(texts.length);
      for (const c of clues) {
        expect(c.text.length, key).toBeGreaterThan(0);
        expect(c.text.length, key).toBeLessThanOrEqual(CLUE_MAX);
        expect(Number.isFinite(c.at) && c.at >= 0 && c.at <= 100, `${key} ${c.text}`).toBe(true);
      }
    }
  });
});

describe('ending a Wavelength game early', () => {
  const four = ids(4);

  it('saves nothing before a round has scored', () => {
    const s = game.setup({ playerIds: four, options: base(4), rng: createRng(2), now: 0 });
    expect(game.partialResult!(s)).toBeNull();
  });

  it('gives Teams to the team ahead, and a level game to nobody', () => {
    const s = game.setup({ playerIds: four, options: base(4), rng: createRng(2), now: 0 });
    const played = playOut(four, base(4), 2).s;
    const mid: WavelengthState = {
      ...s,
      history: played.history.slice(0, 2),
      scores: { sun: 6, moon: 4 },
    };
    const r = game.partialResult!(mid)!;
    expect(r.summary).toBe('Sun led 6 to 4');
    expect(r.winners.sort()).toEqual(four.filter((id) => s.teams[id] === 'sun').sort());
    expect(r.standings!.find((x) => s.teams[x.playerId] === 'moon')).toMatchObject({
      outcome: 'loss',
      team: 'Moon',
    });

    const level = game.partialResult!({ ...mid, scores: { sun: 5, moon: 5 } })!;
    expect(level.summary).toBe('Level at 5 each');
    expect(level.winners).toEqual([]);
    expect(level.standings!.every((x) => x.outcome === 'draw')).toBe(true);
  });

  it('holds Together to two points a round', () => {
    const played = playOut(four, base(4, { mode: 'Together' }), 3).s;
    const s = game.setup({
      playerIds: four,
      options: base(4, { mode: 'Together' }),
      rng: createRng(3),
      now: 0,
    });
    const good = game.partialResult!({
      ...s,
      history: played.history.slice(0, 3),
      scores: { sun: 9, moon: 0 },
    })!;
    expect(good.winners.sort()).toEqual([...four].sort());
    expect(good.summary).toMatch(/^9 points in 3 rounds/);
    const poor = game.partialResult!({
      ...s,
      history: played.history.slice(0, 3),
      scores: { sun: 2, moon: 0 },
    })!;
    expect(poor.winners).toEqual([]);
    expect(poor.standings!.every((x) => x.outcome === 'loss')).toBe(true);
  });
});
