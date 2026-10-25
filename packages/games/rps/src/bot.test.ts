import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { botPick, rps, type Pick, type RpsState } from './rules';

const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'owl', 'crow', 'jay', 'kite'];

/** An all-bot table, run the way the platform runs it: the first bot with a move plays it. */
function playOut(count: number, rounds: number, seed: number) {
  const playerIds = birds.slice(0, count);
  const rng = createRng(seed);
  let s = rps.setup({ playerIds, options: { rounds }, rng, now: 0 });
  let moves = 0;
  while (!rps.getResult(s)) {
    if (++moves > rounds * count + 1) throw new Error('Too many moves');
    const tableView = rps.getTableView(s);
    let acted = false;
    for (const id of playerIds) {
      const action = rps.bot!({
        playerId: id,
        playerIds,
        view: rps.getPlayerView(s, id),
        tableView,
        rng,
        now: 0,
        level: 'hard',
      });
      if (!action) continue;
      rps.actionSchema.parse(action);
      const next = rps.applyAction(s, id, action, rng, 0);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (!acted) throw new Error(`No bot moved in round ${s.round}`);
  }
  return { s, moves };
}

describe('the computer players', () => {
  for (const count of [2, 5, 10]) {
    for (const rounds of [1, 3, 9]) {
      it(`play ${count} players, ${rounds} rounds, to the end with one throw each a round`, () => {
        for (const seed of [1, 2, 3, 4]) {
          const { s, moves } = playOut(count, rounds, seed);
          expect(moves).toBe(count * rounds);
          expect(s.history).toHaveLength(rounds);
        }
      });
    }
  }

  it('throw nothing once they have thrown, or once the game is over', () => {
    let s = rps.setup({
      playerIds: ['wren', 'rook'],
      options: { rounds: 1 },
      rng: createRng(1),
      now: 0,
    });
    s = rps.applyAction(s, 'wren', { type: 'pick', pick: 'rock' }, createRng(1), 0);
    expect(botPick(rps.getPlayerView(s, 'wren'), 'wren', createRng(1))).toBeNull();
    expect(botPick(rps.getPlayerView(s, 'rook'), 'rook', createRng(1))).not.toBeNull();
    s = rps.applyAction(s, 'rook', { type: 'pick', pick: 'paper' }, createRng(1), 0);
    expect(botPick(rps.getPlayerView(s, 'rook'), 'rook', createRng(1))).toBeNull();
  });

  it('throw all three, leaning against what was thrown last', () => {
    const s: RpsState = {
      ...rps.setup({
        playerIds: ['wren', 'rook'],
        options: { rounds: 9 },
        rng: createRng(1),
        now: 0,
      }),
      round: 2,
      history: [{ round: 1, picks: { wren: 'paper', rook: 'rock' }, points: { wren: 1, rook: 0 } }],
    };
    const counts: Record<Pick, number> = { rock: 0, paper: 0, scissors: 0 };
    for (let seed = 1; seed <= 600; seed++) {
      const a = botPick(rps.getPlayerView(s, 'wren'), 'wren', createRng(seed))!;
      counts[a.pick]++;
    }
    // Rook threw rock, so paper comes up more than a third of the time; the others still appear.
    expect(counts.paper).toBeGreaterThan(260);
    expect(counts.rock).toBeGreaterThan(100);
    expect(counts.scissors).toBeGreaterThan(100);
  });
});

describe('ending a game early', () => {
  const start = (players = ['wren', 'rook', 'magpie']) =>
    rps.setup({ playerIds: players, options: { rounds: 5 }, rng: createRng(1), now: 0 });
  const round = (s: RpsState, picks: Record<string, Pick>) =>
    Object.entries(picks).reduce(
      (st, [id, pick]) => rps.applyAction(st, id, { type: 'pick', pick }, createRng(1), 0),
      s,
    );

  it('decides nothing before the first round resolves', () => {
    expect(rps.partialResult!(start())).toBeNull();
    expect(rps.partialResult!(round(start(), { wren: 'rock', rook: 'paper' }))).toBeNull();
  });

  it('gives it to whoever has the most points so far', () => {
    let s = start(['wren', 'rook']);
    s = round(s, { wren: 'rock', rook: 'scissors' });
    s = round(s, { wren: 'rock', rook: 'paper' });
    s = round(s, { wren: 'paper', rook: 'rock' });
    // A pick in the unfinished round doesn't count.
    s = round(s, { rook: 'paper' });
    const r = rps.partialResult!(s)!;
    expect(r.winners).toEqual(['wren']);
    expect(r.summary).toBe('Led 2–1 after 3 of 5 rounds');
    expect(r.standings).toEqual([
      { playerId: 'wren', outcome: 'win' },
      { playerId: 'rook', outcome: 'loss' },
    ]);
  });

  it('shares it between the leaders, and calls it a draw when everyone is level', () => {
    let s = round(start(), { wren: 'rock', rook: 'rock', magpie: 'scissors' });
    let r = rps.partialResult!(s)!;
    expect(r.winners).toEqual(['wren', 'rook']);
    expect(r.summary).toBe('Level at 1 after 1 of 5 rounds');
    s = round(start(), { wren: 'rock', rook: 'rock', magpie: 'rock' });
    r = rps.partialResult!(s)!;
    expect(r.winners).toHaveLength(3);
    expect(r.standings?.every((x) => x.outcome === 'draw')).toBe(true);
  });
});
