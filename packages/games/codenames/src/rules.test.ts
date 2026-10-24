import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  BOARD_SIZE,
  clueOnBoard,
  clueProblem,
  codenames,
  defaultOptions,
  type Card,
  type CodenamesAction,
  type CodenamesOptions,
  type CodenamesState,
} from './rules';
import { lastGuess, guessOutcome } from './outcome';
import { place } from './teams';
import { WORDS } from './words';

const P = ['ana', 'ben', 'cy', 'dee', 'eli', 'fay'];

function opts(extra: Partial<CodenamesOptions> = {}): CodenamesOptions {
  return { ...defaultOptions(), ...extra };
}

/**
 * A fixed table: red = ana (spymaster), ben, cy; blue = dee (spymaster), eli, fay. Red starts.
 * Key: words 0–8 red, 9–16 blue, 17–23 bystanders, 24 the assassin.
 */
function fixed(): CodenamesState {
  const base = codenames.setup({
    playerIds: P,
    options: opts({
      teams: { ana: 'red', ben: 'red', cy: 'red', dee: 'blue', eli: 'blue', fay: 'blue' },
      spymasters: { red: 'ana', blue: 'dee' },
    }),
    rng: createRng(1),
    now: 0,
  });
  const key: Card[] = [
    ...Array<Card>(9).fill('red'),
    ...Array<Card>(8).fill('blue'),
    ...Array<Card>(7).fill('bystander'),
    'assassin',
  ];
  return { ...base, starting: 'red', turn: 'red', key, words: WORDS.slice(0, BOARD_SIZE) };
}

const act = (s: CodenamesState, who: string, a: CodenamesAction) =>
  codenames.applyAction(s, who, a, createRng(2), 0);

const clue = (s: CodenamesState, count: number | null = 2, who = s.spymasters[s.turn]) =>
  act(s, who, { type: 'clue', word: 'river', count });

function throwsCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

describe('setup', () => {
  it('deals 25 distinct words and a 9/8/7/1 key', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = codenames.setup({ playerIds: P, options: opts(), rng: createRng(seed), now: 0 });
      expect(new Set(s.words).size).toBe(25);
      const count = (c: Card) => s.key.filter((k) => k === c).length;
      expect(count(s.starting)).toBe(9);
      expect(count(s.starting === 'red' ? 'blue' : 'red')).toBe(8);
      expect(count('bystander')).toBe(7);
      expect(count('assassin')).toBe(1);
      expect(s.turn).toBe(s.starting);
      expect(s.phase).toBe('clue');
    }
  });

  it('keeps the host’s arrangement and spymasters', () => {
    const s = fixed();
    expect(s.teams).toMatchObject({ ana: 'red', ben: 'red', dee: 'blue', fay: 'blue' });
    expect(s.spymasters).toEqual({ red: 'ana', blue: 'dee' });
  });
});

describe('team placement', () => {
  const rng = () => createRng(7);

  it('places everyone, gives every team a spymaster and at least two players', () => {
    for (let n = 4; n <= 15; n++) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const { teams, spymasters } = place(
        ids,
        { teams: {}, spymasters: {} },
        { balance: false, fresh: false },
        createRng(n),
      );
      for (const id of ids) expect(['red', 'blue']).toContain(teams[id]);
      for (const t of ['red', 'blue'] as const) {
        expect(ids.filter((id) => teams[id] === t).length).toBeGreaterThanOrEqual(2);
        expect(teams[spymasters[t]]).toBe(t);
      }
    }
  });

  it('ignores players who left and places newcomers on the smaller team', () => {
    const { teams } = place(
      ['a', 'b', 'c', 'd', 'new'],
      { teams: { a: 'red', b: 'red', c: 'red', d: 'blue', gone: 'blue' }, spymasters: {} },
      { balance: false, fresh: false },
      rng(),
    );
    expect(teams.new).toBe('blue');
    expect(teams).not.toHaveProperty('gone');
  });

  it('balances when asked, never moving a chosen spymaster', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const arranged = {
      teams: Object.fromEntries(ids.map((id) => [id, 'red' as const])),
      spymasters: { red: 'a' },
    };
    const { teams, spymasters } = place(ids, arranged, { balance: true, fresh: false }, rng());
    expect(ids.filter((id) => teams[id] === 'red')).toHaveLength(3);
    expect(teams.a).toBe('red');
    expect(spymasters.red).toBe('a');
  });

  it('without balance, still moves someone so each team has two players', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const { teams } = place(
      ids,
      { teams: { a: 'red', b: 'red', c: 'red', d: 'blue' }, spymasters: {} },
      { balance: false, fresh: false },
      rng(),
    );
    expect(ids.filter((id) => teams[id] === 'blue')).toHaveLength(2);
  });

  it('draws spymasters when the option asks, or when the pick moved team', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const arranged = {
      teams: { a: 'red' as const, b: 'red' as const, c: 'blue' as const, d: 'blue' as const },
      spymasters: { red: 'c', blue: 'c' },
    };
    const { spymasters } = place(ids, arranged, { balance: false, fresh: false }, rng());
    expect(['a', 'b']).toContain(spymasters.red);
    expect(spymasters.blue).toBe('c');
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++)
      seen.add(
        place(ids, arranged, { balance: false, fresh: true }, createRng(seed)).spymasters.blue,
      );
    expect(seen).toEqual(new Set(['c', 'd']));
  });
});

describe('clues', () => {
  it('only the spymaster whose turn it is gives a clue', () => {
    const s = fixed();
    throwsCode(() => act(s, 'ben', { type: 'clue', word: 'river', count: 2 }), 'NOT_SPYMASTER');
    throwsCode(() => act(s, 'dee', { type: 'clue', word: 'river', count: 2 }), 'NOT_YOUR_TURN');
    const g = clue(s);
    expect(g.phase).toBe('guess');
    expect(g.clues[0]).toMatchObject({ word: 'RIVER', count: 2, team: 'red', by: 'ana' });
    expect(g.guessesLeft).toBe(3);
    throwsCode(() => clue(g), 'NOT_YOUR_TURN');
  });

  it('must be one word of letters', () => {
    expect(clueProblem('')).toMatch(/one-word/);
    expect(clueProblem('two words')).toMatch(/no spaces/);
    expect(clueProblem('r2d2')).toMatch(/letters/);
    expect(clueProblem("o'clock")).toBeNull();
    expect(clueProblem('well-known')).toBeNull();
    throwsCode(
      () => act(fixed(), 'ana', { type: 'clue', word: 'two words', count: 1 }),
      'BAD_CLUE',
    );
  });

  it('flags, but allows, a clue that is a word on the board', () => {
    const s = fixed();
    expect(clueOnBoard('anchor', s.words)).toBe(true);
    expect(clueOnBoard('anchors', s.words)).toBe(true);
    const g = act(s, 'ana', { type: 'clue', word: s.words[3]!, count: 1 });
    expect(g.clues[0]!.onBoard).toBe(true);
  });

  it('zero and unlimited give unlimited guesses', () => {
    expect(clue(fixed(), 0).guessesLeft).toBeNull();
    expect(clue(fixed(), null).guessesLeft).toBeNull();
  });
});

describe('guessing', () => {
  it('allows the number plus one, then ends the turn', () => {
    let s = clue(fixed(), 1);
    s = act(s, 'ben', { type: 'guess', index: 0 });
    expect(s.turn).toBe('red');
    expect(s.guessesLeft).toBe(1);
    s = act(s, 'ben', { type: 'guess', index: 1 });
    expect(s.turn).toBe('blue');
    expect(s.phase).toBe('clue');
    expect(s.clues[0]!.ended).toBe('limit');
  });

  it('a bystander or the other team’s word ends the turn', () => {
    let s = act(clue(fixed()), 'ben', { type: 'guess', index: 20 });
    expect(s.turn).toBe('blue');
    expect(s.clues[0]!.ended).toBe('bystander');
    s = act(clue(s), 'eli', { type: 'guess', index: 2 });
    expect(s.turn).toBe('red');
    expect(s.clues[1]!.ended).toBe('other-team');
  });

  it('passing ends the turn', () => {
    const g = act(clue(fixed()), 'ben', { type: 'guess', index: 0 });
    const s = act(g, 'cy', { type: 'pass' });
    expect(s.turn).toBe('blue');
    expect(s.clues[0]!.ended).toBe('pass');
  });

  it('refuses to pass before the team has made a guess', () => {
    throwsCode(() => act(clue(fixed()), 'cy', { type: 'pass' }), 'GUESS_FIRST');
    // Guesses under an earlier clue don't count towards this one.
    let s = act(clue(fixed()), 'ben', { type: 'guess', index: 20 });
    s = act(clue(s), 'eli', { type: 'guess', index: 21 });
    throwsCode(() => act(clue(s), 'cy', { type: 'pass' }), 'GUESS_FIRST');
  });

  it('only operatives of the team in play guess, and only after a clue', () => {
    const s = fixed();
    throwsCode(() => act(s, 'ben', { type: 'guess', index: 0 }), 'NO_CLUE');
    const g = clue(s);
    throwsCode(() => act(g, 'ana', { type: 'guess', index: 0 }), 'SPYMASTER');
    throwsCode(() => act(g, 'eli', { type: 'guess', index: 0 }), 'NOT_YOUR_TURN');
    throwsCode(() => act(g, 'stranger', { type: 'guess', index: 0 }), 'NOT_A_PLAYER');
    const once = act(g, 'ben', { type: 'guess', index: 0 });
    throwsCode(() => act(once, 'cy', { type: 'guess', index: 0 }), 'REVEALED');
  });

  it('the assassin loses the game on the spot', () => {
    const s = act(clue(fixed()), 'ben', { type: 'guess', index: 24 });
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('blue');
    expect(s.how).toBe('assassin');
    const r = codenames.getResult(s)!;
    expect(r.summary).toBe('Blue wins: Red found the assassin');
    expect(new Set(r.winners)).toEqual(new Set(['dee', 'eli', 'fay']));
  });

  it('finding every word wins, with teams and roles in the standings', () => {
    let s = fixed();
    for (let i = 0; i < 9; i++) {
      if (s.phase === 'clue') s = clue(s, null);
      s = act(s, 'ben', { type: 'guess', index: i });
    }
    expect(s.phase).toBe('over');
    expect(s.winner).toBe('red');
    expect(s.how).toBe('words');
    const r = codenames.getResult(s)!;
    expect(r.summary).toBe('Red wins: all 9 words found');
    expect(r.standings).toContainEqual({
      playerId: 'ana',
      outcome: 'win',
      team: 'Red',
      role: 'Spymaster',
    });
    expect(r.standings).toContainEqual({
      playerId: 'eli',
      outcome: 'loss',
      team: 'Blue',
      role: 'Operative',
    });
  });

  it('revealing the other team’s last word wins it for them', () => {
    let s = fixed();
    s = { ...s, revealed: s.revealed.map((_, i) => i >= 9 && i <= 15) }; // blue has one left (16)
    s = act(clue(s), 'ben', { type: 'guess', index: 16 });
    expect(s.winner).toBe('blue');
    expect(s.how).toBe('words');
  });

  it('a majority of operatives suggesting a word guesses it', () => {
    let s = clue(fixed());
    s = act(s, 'ben', { type: 'suggest', index: 4 });
    expect(s.revealed[4]).toBe(false);
    expect(s.suggestions).toEqual({ ben: 4 });
    s = act(s, 'cy', { type: 'suggest', index: 4 });
    expect(s.revealed[4]).toBe(true);
    expect(s.suggestions).toEqual({});
    expect(s.clues[0]!.guesses).toEqual([{ index: 4, card: 'red', by: 'cy' }]);
  });

  it('suggesting again, or null, takes a suggestion back; a lone operative’s tap counts', () => {
    let s = clue(fixed());
    s = act(s, 'ben', { type: 'suggest', index: 4 });
    s = act(s, 'ben', { type: 'suggest', index: 4 });
    expect(s.suggestions).toEqual({});
    s = act(s, 'ben', { type: 'suggest', index: 5 });
    s = act(s, 'ben', { type: 'suggest', index: null });
    expect(s.suggestions).toEqual({});

    const pair = codenames.setup({
      playerIds: ['a', 'b', 'c', 'd'],
      options: opts({
        teams: { a: 'red', b: 'red', c: 'blue', d: 'blue' },
        spymasters: { red: 'a', blue: 'c' },
      }),
      rng: createRng(3),
      now: 0,
    });
    const started = codenames.applyAction(
      pair,
      pair.spymasters[pair.turn],
      { type: 'clue', word: 'tide', count: 1 },
      createRng(4),
      0,
    );
    const op = started.turn === 'red' ? 'b' : 'd';
    const tapped = codenames.applyAction(
      started,
      op,
      { type: 'suggest', index: 0 },
      createRng(5),
      0,
    );
    expect(tapped.revealed[0]).toBe(true);
  });
});

describe('hidden information', () => {
  const unrevealedColours = (s: CodenamesState, json: string) => {
    // Every key entry is one of four words; check the view carries no key array at all.
    expect(json).not.toContain('"key"');
    const view = JSON.parse(json) as { revealed: (Card | null)[] };
    view.revealed.forEach((c, i) => expect(c).toBe(s.revealed[i] ? s.key[i] : null));
  };

  it('the table view and operatives never see an unrevealed colour', () => {
    let s = act(clue(fixed()), 'ben', { type: 'guess', index: 0 });
    unrevealedColours(s, JSON.stringify(codenames.getTableView(s)));
    const op = codenames.getPlayerView(s, 'ben');
    expect(op.key).toBeNull();
    expect(op.spymaster).toBe(false);
    unrevealedColours(s, JSON.stringify({ ...op, key: undefined }));
    s = { ...s };
    expect(JSON.stringify(codenames.getPlayerView(s, 'eli'))).not.toContain('assassin');
  });

  it('spymasters see the whole key; everyone does once it is over', () => {
    const s = fixed();
    expect(codenames.getPlayerView(s, 'ana').key).toEqual(s.key);
    expect(codenames.getPlayerView(s, 'dee').key).toEqual(s.key);
    const over = act(clue(s), 'ben', { type: 'guess', index: 24 });
    expect(codenames.getPlayerView(over, 'ben').key).toEqual(s.key);
  });
});

describe('outcomes and chat', () => {
  it('works out the latest guess from public data', () => {
    let s = clue(fixed());
    s = act(s, 'ben', { type: 'guess', index: 20 });
    const t = codenames.getTableView(s);
    const last = lastGuess(t)!;
    expect(last.guess).toMatchObject({ index: 20, card: 'bystander' });
    expect(guessOutcome(last.clue, last.guess, 'red')).toBe('loss');
    expect(guessOutcome(last.clue, last.guess, 'blue')).toBe('reveal');
    expect(guessOutcome(last.clue, last.guess, null)).toBe('reveal');
  });

  it('posts each clue in chat', () => {
    const s = fixed();
    expect(codenames.announce!(s, clue(s, 3))).toEqual(['{ana} gave Red the clue RIVER 3.']);
    expect(codenames.announce!(null, s)).toEqual([]);
  });
});

describe('the word list', () => {
  it('has at least 400 unique single words', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(400);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    for (const w of WORDS) expect(w).toMatch(/^[A-Z]+$/);
  });
});
