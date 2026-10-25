import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  GOALS,
  MIDDLE,
  REVEAL_MS,
  TARGET_MAX,
  TARGET_MIN,
  wavelength as game,
  guessersOf,
  callersOf,
  other,
  placeTeams,
  rating,
  scoreOf,
  sideOf,
  type WavelengthAction,
  type WavelengthOptions,
  type WavelengthState,
} from './rules';
import { SPECTRUMS } from './spectrums';

const six = ['a', 'b', 'c', 'd', 'e', 'f'];
const opts = (o: Partial<WavelengthOptions> = {}, n = 6): WavelengthOptions => ({
  ...game.defaultOptions(n),
  ...o,
});
const start = (players = six, o: Partial<WavelengthOptions> = {}, seed = 1) =>
  game.setup({
    playerIds: players,
    options: opts(o, players.length),
    rng: createRng(seed),
    now: 0,
  });
const act = (s: WavelengthState, who: string, a: WavelengthAction, now = 0) =>
  game.applyAction(s, who, a, createRng(7), now);

/** The psychic gives a clue for the first card. */
const clue = (s: WavelengthState, text = 'Soup', now = 0) =>
  act(s, s.round.psychic, { type: 'clue', card: 0, text }, now);

/** A state with this round's target set by hand. */
const withTarget = (s: WavelengthState, target: number): WavelengthState => ({
  ...s,
  round: { ...s.round, target },
});

/** Every guesser locks the shared dial at `at`. */
function guessAt(s: WavelengthState, at: number, now = 0): WavelengthState {
  const [first, ...rest] = guessersOf(s);
  let next = act(s, first!, { type: 'dial', at }, now);
  next = act(next, first!, { type: 'lock', on: true }, now);
  for (const id of rest)
    if (next.phase === 'guess') next = act(next, id, { type: 'lock', on: true }, now);
  return next;
}

/** The whole other team calls `side`. */
function callAll(s: WavelengthState, side: 'left' | 'right', now = 0): WavelengthState {
  let next = s;
  for (const id of callersOf(s))
    if (next.phase === 'call') next = act(next, id, { type: 'call', side }, now);
  return next;
}

describe('spectrum cards', () => {
  it('has at least 150 distinct pairs of two different words', () => {
    expect(SPECTRUMS.length).toBeGreaterThanOrEqual(150);
    const keys = SPECTRUMS.map(([l, r]) => `${l.toLowerCase()}|${r.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [l, r] of SPECTRUMS) {
      expect(l.trim()).not.toBe('');
      expect(r.trim()).not.toBe('');
      expect(l).not.toBe(r);
    }
  });
});

describe('scoring', () => {
  it('scores 4, 3, 2 and 0 by distance, edges included', () => {
    expect(scoreOf(50, 50)).toBe(4);
    expect(scoreOf(52, 50)).toBe(4);
    expect(scoreOf(48, 50)).toBe(4);
    expect(scoreOf(52.1, 50)).toBe(3);
    expect(scoreOf(56, 50)).toBe(3);
    expect(scoreOf(44, 50)).toBe(3);
    expect(scoreOf(56.1, 50)).toBe(2);
    expect(scoreOf(60, 50)).toBe(2);
    expect(scoreOf(40, 50)).toBe(2);
    expect(scoreOf(60.1, 50)).toBe(0);
    expect(scoreOf(0, 50)).toBe(0);
  });

  it('says which side the target is on, and none when dead on', () => {
    expect(sideOf(50, 40)).toBe('left');
    expect(sideOf(50, 60)).toBe('right');
    expect(sideOf(50, 50)).toBeNull();
  });

  it('rates a cooperative score', () => {
    expect(rating(28, 7)).toBe('one mind');
    expect(rating(20, 7)).toBe('on the same wavelength');
    expect(rating(4, 7)).toBe('lost the signal');
  });
});

describe('setup', () => {
  it('deals two even teams, a psychic from the starting team, and a target on the dial', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = start(six, {}, seed);
      expect(s.mode).toBe('teams');
      const sun = six.filter((id) => s.teams[id] === 'sun');
      expect(sun).toHaveLength(3);
      expect(s.teams[s.round.psychic]).toBe(s.round.team);
      expect(s.round.target).toBeGreaterThanOrEqual(TARGET_MIN);
      expect(s.round.target).toBeLessThanOrEqual(TARGET_MAX);
      expect(Number.isInteger(s.round.target)).toBe(true);
      expect(s.round.offer[0]).not.toBe(s.round.offer[1]);
      expect(s.phase).toBe('clue');
      expect(s.goal).toBe(GOALS.Standard.points);
    }
  });

  it('gives the team going second a point to start, in Teams only', () => {
    for (let seed = 1; seed < 10; seed++) {
      const s = start(six, {}, seed);
      expect(s.scores[s.round.team]).toBe(0);
      expect(s.scores[other(s.round.team)]).toBe(1);
    }
    expect(start(['a', 'b', 'c'], { mode: 'Together' }).scores).toEqual({ sun: 0, moon: 0 });
  });

  it('puts everyone on one team in Together, and defaults to it under four players', () => {
    expect(game.defaultOptions(3).mode).toBe('Together');
    expect(game.defaultOptions(4).mode).toBe('Teams');
    const s = start(['a', 'b', 'c'], { mode: 'Together', length: 'Short' });
    expect(s.mode).toBe('together');
    expect(Object.values(s.teams).every((t) => t === 'sun')).toBe(true);
    expect(s.goal).toBe(GOALS.Short.rounds);
  });

  it('keeps the host’s chosen teams, rotating psychics in seat order', () => {
    const sides = { a: 'moon', b: 'moon', c: 'moon', d: 'sun', e: 'sun', f: 'sun' } as const;
    for (let seed = 1; seed < 10; seed++) {
      const s = start(six, { teams: 'Chosen', sides }, seed);
      expect(s.teams).toEqual(sides);
      expect(s.order.moon).toEqual(['a', 'b', 'c']);
      expect(s.order.sun).toEqual(['d', 'e', 'f']);
    }
  });

  it('puts unplaced players on the smaller team and tops a team up to two', () => {
    const s = start(six, { teams: 'Chosen', sides: { a: 'sun', b: 'sun', c: 'sun' } });
    expect(['d', 'e', 'f'].every((id) => s.teams[id] === 'moon')).toBe(true);
    const lopsided = placeTeams(
      six,
      { a: 'sun', b: 'sun', c: 'sun', d: 'sun', e: 'sun', f: 'moon' },
      createRng(4),
    );
    expect(six.filter((id) => lopsided[id] === 'moon')).toHaveLength(2);
    expect(lopsided.f).toBe('moon');
    // Placings for players who have left are ignored.
    expect(
      Object.keys(placeTeams(['a', 'b', 'c', 'd'], { z: 'sun' }, createRng(1))).sort(),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deals random teams afresh when the option is Random, whatever was placed', () => {
    const sides = { a: 'moon', b: 'moon', c: 'moon', d: 'sun', e: 'sun', f: 'sun' } as const;
    const differs = [1, 2, 3, 4, 5].some(
      (seed) =>
        JSON.stringify(start(six, { teams: 'Random', sides }, seed).teams) !==
        JSON.stringify(sides),
    );
    expect(differs).toBe(true);
  });

  it('refuses Teams with fewer than four players', () => {
    expect(game.validateOptions!(opts({ mode: 'Teams' }), 3)).toMatch(/at least 4/);
    expect(game.validateOptions!(opts({ mode: 'Teams' }), 4)).toBeNull();
    expect(game.validateOptions!(opts({ mode: 'Together' }), 2)).toBeNull();
  });
});

describe('the clue', () => {
  it('only the psychic gives it, once, and it starts the guessing', () => {
    const s = start();
    const someoneElse = six.find((id) => id !== s.round.psychic)!;
    expect(() => act(s, someoneElse, { type: 'clue', card: 0, text: 'Soup' })).toThrow(GameError);
    expect(() => act(s, s.round.psychic, { type: 'clue', card: 1, text: '   ' })).toThrow(
      /Type a clue/,
    );
    const g = act(s, s.round.psychic, { type: 'clue', card: 1, text: '  Hot   soup ' });
    expect(g.phase).toBe('guess');
    expect(g.round.clue).toBe('Hot soup');
    expect(g.round.card).toBe(1);
    expect(() => act(g, g.round.psychic, { type: 'clue', card: 0, text: 'x' })).toThrow(GameError);
  });

  it('starts the dial timer when there is one', () => {
    const s = start(six, { timer: '60 seconds' });
    const g = clue(s, 'Soup', 1000);
    expect(g.actBy).toBe(61_000);
    expect(game.nextTimer!(g)).toEqual({ id: 'act', at: 61_000 });
  });
});

describe('shared dial', () => {
  it('lets the guessers move it, not the psychic or the other team', () => {
    const g = clue(start());
    const [guesser] = guessersOf(g);
    const rival = six.find((id) => g.teams[id] === other(g.round.team))!;
    expect(() => act(g, g.round.psychic, { type: 'dial', at: 10 })).toThrow(/psychic/);
    expect(() => act(g, rival, { type: 'dial', at: 10 })).toThrow(/your team/);
    const moved = act(g, guesser!, { type: 'dial', at: 33.33 });
    expect(moved.round.dial).toBe(33.3);
    expect(moved.round.dialSeq).toBe(1);
    expect(moved.round.dialBy).toBe(guesser);
  });

  it('locks in on a majority, and moving the dial takes the locks back', () => {
    const g = clue(start(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
    const gs = guessersOf(g);
    expect(gs).toHaveLength(3);
    let s = act(g, gs[0]!, { type: 'dial', at: 70 });
    s = act(s, gs[0]!, { type: 'lock', on: true });
    expect(s.round.locks).toEqual([gs[0]]);
    s = act(s, gs[1]!, { type: 'dial', at: 72 });
    expect(s.round.locks).toEqual([]);
    s = act(s, gs[0]!, { type: 'lock', on: true });
    s = act(s, gs[1]!, { type: 'lock', on: true });
    expect(s.phase).toBe('call');
    expect(s.round.guess).toBe(72);
  });

  it('a lock taken back no longer counts', () => {
    const g = clue(start(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']));
    const gs = guessersOf(g);
    let s = act(g, gs[0]!, { type: 'lock', on: true });
    s = act(s, gs[0]!, { type: 'lock', on: false });
    s = act(s, gs[1]!, { type: 'lock', on: true });
    expect(s.phase).toBe('guess');
  });

  it('refuses a lock on a dial that has moved since the locker saw it', () => {
    // Two guessers: one drags to 70, the other's screen still shows the middle.
    const g = clue(start(['a', 'b', 'c', 'd', 'e', 'f']));
    const [x, y] = guessersOf(g);
    let s = act(g, x!, { type: 'dial', at: 70 });
    s = act(s, x!, { type: 'lock', on: true, at: 70 });
    expect(() => act(s, y!, { type: 'lock', on: true, at: MIDDLE })).toThrow(/moved/);
    s = act(s, y!, { type: 'lock', on: true, at: 70 });
    expect(s.round.guess).toBe(70);
  });
});

describe('everyone guesses', () => {
  it('keeps each dial private and averages them once all have locked', () => {
    const g = clue(
      start(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], { guessing: 'Everyone guesses' }),
    );
    const gs = guessersOf(g);
    let s = act(g, gs[0]!, { type: 'dial', at: 20 });
    s = act(s, gs[1]!, { type: 'dial', at: 40 });
    const view = game.getPlayerView(s, gs[0]!);
    expect(view.myDial).toBe(20);
    expect(JSON.stringify(game.getTableView(s))).not.toContain('"dials"');
    expect(game.getPlayerView(s, gs[2]!).myDial).toBeNull();
    expect(game.getTableView(s).round.moved.sort()).toEqual([gs[0], gs[1]].sort());
    expect(game.getTableView(s).round.dial).toBe(MIDDLE);

    s = act(s, gs[0]!, { type: 'lock', on: true });
    s = act(s, gs[1]!, { type: 'lock', on: true });
    expect(s.phase).toBe('guess');
    // Locking an untouched dial means the middle: (20 + 40 + 50) / 3.
    s = act(s, gs[2]!, { type: 'lock', on: true });
    expect(s.round.guess).toBe(36.7);
  });

  it('turning your dial again takes your lock back', () => {
    const g = clue(start(six, { guessing: 'Everyone guesses' }));
    const [x] = guessersOf(g);
    let s = act(g, x!, { type: 'lock', on: true });
    s = act(s, x!, { type: 'dial', at: 80 });
    expect(s.round.locks).not.toContain(x);
  });

  it('a lock carries where your needle is, so a move still on its way can’t be lost', () => {
    const g = clue(start(['a', 'b', 'c', 'd'], { guessing: 'Everyone guesses' }));
    const [x] = guessersOf(g);
    // The only guesser locks before their last move arrives; the late move changes nothing.
    let s = act(g, x!, { type: 'lock', on: true, at: 80 });
    expect(s.round.guess).toBe(80);
    s = act(s, x!, { type: 'dial', at: 20 });
    expect(s.round.guess).toBe(80);
  });

  it('on a timeout averages only the dials that were turned', () => {
    const g = clue(
      start(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], {
        guessing: 'Everyone guesses',
        timer: '60 seconds',
      }),
    );
    const gs = guessersOf(g);
    let s = act(g, gs[0]!, { type: 'dial', at: 10 });
    s = act(s, gs[1]!, { type: 'dial', at: 30 });
    s = game.onTimer!(s, 'act', createRng(3), 60_000);
    expect(s.round.guess).toBe(20);
  });

  it('with nobody turning a dial, the guess is the middle', () => {
    const g = clue(start(six, { guessing: 'Everyone guesses', timer: '60 seconds' }));
    const s = game.onTimer!(g, 'act', createRng(3), 60_000);
    expect(s.round.guess).toBe(MIDDLE);
  });
});

describe('the left/right call', () => {
  it('belongs to the other team and is decided by a majority', () => {
    const g = withTarget(clue(start()), 30);
    let s = guessAt(g, 50);
    expect(s.phase).toBe('call');
    const callers = callersOf(s);
    expect(callers.every((id) => s.teams[id] === other(s.round.team))).toBe(true);
    expect(() => act(s, guessersOf(s)[0]!, { type: 'call', side: 'left' })).toThrow(/other team/);
    s = act(s, callers[0]!, { type: 'call', side: 'left' });
    s = act(s, callers[1]!, { type: 'call', side: 'right' });
    expect(s.phase).toBe('call');
    s = act(s, callers[2]!, { type: 'call', side: 'left' });
    expect(s.phase).toBe('reveal');
    expect(s.round.call).toBe('left');
    const last = s.history[0]!;
    expect(last.points).toBe(0);
    expect(last.callPoint).toBe(1);
    // The point for going second, and one for the call.
    expect(s.scores[other(s.round.team)]).toBe(2);
  });

  it('a wrong call scores nothing', () => {
    const s = callAll(guessAt(withTarget(clue(start()), 55), 50), 'left');
    expect(s.history[0]!.points).toBe(3);
    expect(s.history[0]!.callPoint).toBe(0);
    expect(s.scores[s.round.team]).toBe(3);
    expect(s.scores[other(s.round.team)]).toBe(1);
  });

  it('is skipped when the dial is dead on the target', () => {
    const s = guessAt(withTarget(clue(start()), 50), 50);
    expect(s.phase).toBe('reveal');
    expect(s.history[0]!.points).toBe(4);
    expect(s.history[0]!.call).toBeNull();
  });

  it('on a timeout goes with the bigger side, and a tie makes no call', () => {
    const base = guessAt(withTarget(clue(start(six, { timer: '60 seconds' })), 30), 50);
    const [x, y] = callersOf(base);
    let s = act(base, x!, { type: 'call', side: 'left' });
    expect(game.onTimer!(s, 'act', createRng(1), 999_999).round.call).toBe('left');
    s = act(s, y!, { type: 'call', side: 'right' });
    const tie = game.onTimer!(s, 'act', createRng(1), 999_999);
    expect(tie.round.call).toBeNull();
    expect(tie.history[0]!.callPoint).toBe(0);
  });
});

describe('lock it in now', () => {
  it('lets the psychic end the wait only once someone has locked in', () => {
    const g = clue(start());
    const [x] = guessersOf(g);
    expect(() => act(g, g.round.psychic, { type: 'hurry' })).toThrow(/locked in/);
    let s = act(g, x!, { type: 'dial', at: 30 });
    s = act(s, x!, { type: 'lock', on: true });
    // A move after the lock takes it back, so there's nothing to go with again.
    const moved = act(s, guessersOf(s)[1]!, { type: 'dial', at: 60 });
    expect(() => act(moved, moved.round.psychic, { type: 'hurry' })).toThrow(/locked in/);
    s = act(s, s.round.psychic, { type: 'hurry' });
    expect(s.round.guess).toBe(30);
  });

  it('lets the psychic end the call only once someone has called', () => {
    const c = guessAt(withTarget(clue(start()), 30), 50);
    expect(c.phase).toBe('call');
    expect(() => act(c, c.round.psychic, { type: 'hurry' })).toThrow(/called/);
    const s = act(c, callersOf(c)[0]!, { type: 'call', side: 'left' });
    expect(act(s, s.round.psychic, { type: 'hurry' }).round.call).toBe('left');
  });
});

describe('rounds and turns', () => {
  it('moves on after the reveal by itself, or when someone taps Next', () => {
    const s = guessAt(withTarget(clue(start()), 50), 50, 1000);
    expect(s.nextAt).toBe(1000 + REVEAL_MS);
    expect(game.nextTimer!(s)).toEqual({ id: 'next', at: 1000 + REVEAL_MS });
    const viaTimer = game.onTimer!(s, 'next', createRng(1), 1000 + REVEAL_MS);
    expect(viaTimer.round.n).toBe(2);
    expect(viaTimer.phase).toBe('clue');
    // A stale Next does nothing.
    expect(act(viaTimer, 'a', { type: 'next', after: 1 })).toBe(viaTimer);
  });

  it('alternates teams and rotates each team’s psychic', () => {
    let s = start();
    const seen: { team: string; psychic: string }[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push({ team: s.round.team, psychic: s.round.psychic });
      // Miss by a mile so nobody catches up or wins.
      s = withTarget(s, 90);
      s = callAll(guessAt(clue(s), 10), 'left');
      s = act(s, 'a', { type: 'next', after: s.round.n });
    }
    expect(seen.map((x) => x.team)).toEqual([
      seen[0]!.team,
      other(seen[0]!.team as 'sun'),
      seen[0]!.team,
      other(seen[0]!.team as 'sun'),
      seen[0]!.team,
      other(seen[0]!.team as 'sun'),
    ]);
    const firstTeam = seen.filter((_, i) => i % 2 === 0).map((x) => x.psychic);
    expect(new Set(firstTeam).size).toBe(3);
  });

  it('gives a team that hits the bullseye while behind another turn', () => {
    let s = start();
    const team = s.round.team;
    s = { ...s, scores: { ...s.scores, [other(team)]: 6 } };
    s = guessAt(withTarget(clue(s), 50), 50);
    expect(s.scores[team]).toBe(4);
    s = act(s, 'a', { type: 'next', after: s.round.n });
    expect(s.round.team).toBe(team);
    expect(s.round.catchUp).toBe(true);
  });

  it('a bullseye while ahead passes the turn as usual', () => {
    let s = start();
    const team = s.round.team;
    s = guessAt(withTarget(clue(s), 50), 50);
    s = act(s, 'a', { type: 'next', after: s.round.n });
    expect(s.round.team).toBe(other(team));
  });

  it('never offers the same card twice in a game until the box runs out', () => {
    let s = start();
    const offered = new Set<number>();
    for (let i = 0; i < 20; i++) {
      for (const o of s.round.offer) {
        expect(offered.has(o)).toBe(false);
        offered.add(o);
      }
      s = callAll(guessAt(clue(withTarget(s, 90)), 10), 'left');
      s = act(s, 'a', { type: 'next', after: s.round.n });
    }
  });
});

describe('winning', () => {
  it('ends when a team reaches the goal, after its reveal', () => {
    let s = start(six, { length: 'Short' });
    const team = s.round.team;
    s = { ...s, scores: { sun: 0, moon: 0, [team]: 5 } };
    s = guessAt(withTarget(clue(s), 50), 50);
    expect(s.phase).toBe('reveal');
    expect(s.history[0]!.final).toBe(true);
    expect(s.winner).toBe(team);
    expect(game.getResult(s)).toBeNull();
    s = act(s, 'a', { type: 'next', after: s.round.n });
    expect(s.phase).toBe('over');
    const result = game.getResult(s)!;
    expect(result.winners.every((id) => s.teams[id] === team)).toBe(true);
    expect(result.winners).toHaveLength(3);
    expect(result.summary).toMatch(/wins, 9 to 0/);
    expect(result.highlights?.[0]?.award).toBe('Bullseye');
    expect(result.standings?.find((x) => x.playerId === result.winners[0])?.outcome).toBe('win');
  });

  it('a tie at the goal plays on', () => {
    let s = start(six, { length: 'Short' });
    const team = s.round.team;
    s = { ...s, scores: { sun: 0, moon: 0, [team]: 4, [other(team)]: 7 } };
    // A 3 brings the guessing team level at 7.
    s = callAll(guessAt(withTarget(clue(s), 54), 50), 'left');
    expect(s.scores[team]).toBe(7);
    expect(s.history[0]!.final).toBe(false);
    expect(s.winner).toBeNull();
  });
});

describe('together', () => {
  it('rotates the psychic through everyone and has no call', () => {
    let s = start(['a', 'b', 'c'], { mode: 'Together' });
    const psychics: string[] = [];
    for (let i = 0; i < 3; i++) {
      psychics.push(s.round.psychic);
      expect(callersOf(s)).toEqual([]);
      s = guessAt(withTarget(clue(s), 90), 10);
      expect(s.phase).toBe('reveal');
      s = act(s, 'a', { type: 'next', after: s.round.n });
    }
    expect(new Set(psychics).size).toBe(3);
  });

  it('plays the set rounds plus one for each bullseye, then rates the team', () => {
    let s = start(['a', 'b', 'c'], { mode: 'Together', length: 'Short' });
    let rounds = 0;
    while (s.phase !== 'over') {
      // A bullseye in the first round only.
      s = guessAt(withTarget(clue(s), rounds === 0 ? 50 : 60), 50);
      s = act(s, 'a', { type: 'next', after: s.round.n });
      rounds++;
    }
    expect(rounds).toBe(GOALS.Short.rounds + 1);
    const result = game.getResult(s)!;
    // 4 + 2 a round for the other five: 14 ≥ 2 × 5 planned, so everyone wins.
    expect(s.scores.sun).toBe(14);
    expect(result.winners).toEqual(['a', 'b', 'c']);
    expect(result.summary).toMatch(/14 points in 6 rounds/);
  });
});

describe('hidden information', () => {
  it('only the psychic has the target before the reveal', () => {
    let s = clue(start());
    const secret = `"target":${s.round.target}`;
    expect(JSON.stringify(game.getTableView(s))).not.toContain('"target":' + s.round.target);
    expect(game.getTableView(s).round.target).toBeNull();
    for (const id of six) {
      const v = game.getPlayerView(s, id);
      if (id === s.round.psychic) expect(v.target).toBe(s.round.target);
      else {
        expect(v.target).toBeNull();
        expect(v.round.target).toBeNull();
        expect(JSON.stringify(v)).not.toContain(secret);
      }
    }
    s = callAll(guessAt(s, 0), 'right');
    expect(s.phase).toBe('reveal');
    expect(game.getTableView(s).round.target).toBe(s.round.target);
  });

  it('the announcements give the clue and the score, never the target', () => {
    const s0 = start();
    const s1 = clue(s0, 'Lukewarm tea');
    expect(game.announce!(s0, s1)[0]).toMatch(/Lukewarm tea/);
    const s2 = guessAt(withTarget(s1, 50), 50);
    const lines = game.announce!(s1, s2);
    expect(lines.join(' ')).toMatch(/scored 4/);
    expect(lines.join(' ')).not.toMatch(/50/);
  });
});

describe('who the game waits on', () => {
  it('names the psychic, then unlocked guessers, then callers yet to call', () => {
    const s = start();
    expect(game.waitingOn!(s)).toEqual([s.round.psychic]);
    const g = clue(s);
    expect(game.waitingOn!(g).sort()).toEqual(guessersOf(g).sort());
    const c = guessAt(withTarget(g, 20), 50);
    expect(game.waitingOn!(c).sort()).toEqual(callersOf(c).sort());
  });
});
