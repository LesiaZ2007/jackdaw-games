import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { codenamesBot, readClue } from './bot';
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
import { WORDS } from './words';

const birds = ['wren', 'rook', 'magpie', 'robin', 'finch', 'heron', 'swift', 'kite', 'crow'];
const ids = (n: number) => Array.from({ length: n }, (_, i) => birds[i] ?? `bird${i}`);

const ask = (s: CodenamesState, id: string, seed: number) =>
  codenamesBot({
    playerId: id,
    playerIds: s.players,
    view: codenames.getPlayerView(s, id),
    tableView: codenames.getTableView(s),
    rng: createRng(seed),
    now: 0,
  });

/** Plays a whole game with a bot in every seat, as the platform would: whoever it waits on. */
function playOut(players: string[], options: CodenamesOptions, seed: number) {
  let s = codenames.setup({ playerIds: players, options, rng: createRng(seed), now: 0 });
  const clues: string[] = [];
  let moves = 0;
  while (s.phase !== 'over') {
    if (++moves > 600) throw new Error(`no finish after 600 moves (seed ${seed})`);
    let acted = false;
    for (const id of codenames.waitingOn!(s)) {
      const action = ask(s, id, seed * 1000 + moves);
      if (!action) continue;
      if (action.type === 'clue') {
        expect(clueProblem(action.word)).toBeNull();
        expect(clueOnBoard(action.word, s.words)).toBe(false);
        clues.push(`${action.word} ${action.count}`);
      }
      const next = codenames.applyAction(s, id, action, createRng(moves), 0);
      expect(next).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (!acted) throw new Error(`bots stuck in ${s.phase} (seed ${seed})`);
  }
  return { s, moves, clues };
}

const variants: [string, (p: string[]) => CodenamesOptions][] = [
  ['dealt by the game', () => defaultOptions()],
  [
    'chosen teams and spymasters',
    (p) => ({
      ...defaultOptions(),
      teams: Object.fromEntries(p.map((id, i) => [id, i % 2 ? 'blue' : 'red'])),
      spymasters: { red: p[0], blue: p[1] },
    }),
  ],
  [
    'uneven teams, new spymasters',
    (p) => ({
      ...defaultOptions(),
      teams: Object.fromEntries(
        p.map((id, i) => [id, i < Math.ceil(p.length * 0.7) ? 'red' : 'blue']),
      ),
      balance: false,
      newSpymasters: true,
    }),
  ],
];

describe('Codenames bots', () => {
  for (const n of [4, 8, 15]) {
    for (const [label, opts] of variants) {
      it(`an all-bot table of ${n} finishes (${label})`, () => {
        for (let seed = 1; seed <= 6; seed++) {
          const players = ids(n);
          const { s, moves } = playOut(players, opts(players), seed);
          expect(codenames.getResult(s)).not.toBeNull();
          expect(moves).toBeLessThan(600);
        }
      });
    }
  }

  it('mostly wins by finding words, not by the assassin', () => {
    let byWords = 0;
    for (let seed = 1; seed <= 40; seed++) {
      if (playOut(ids(6), defaultOptions(), seed).s.how === 'words') byWords++;
    }
    expect(byWords).toBeGreaterThan(24);
  });

  it('gives theme clues for several words', () => {
    let multi = 0;
    let all = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const c of playOut(ids(6), defaultOptions(), seed).clues) {
        all++;
        if (!c.endsWith(' 1')) multi++;
      }
    }
    expect(multi / all).toBeGreaterThan(0.22);
  });

  it('a spymaster clues a theme and steers clear of the assassin', () => {
    const base = codenames.setup({
      playerIds: ids(4),
      options: {
        ...defaultOptions(),
        teams: { wren: 'red', rook: 'red', magpie: 'blue', robin: 'blue' },
        spymasters: { red: 'wren', blue: 'magpie' },
      },
      rng: createRng(3),
      now: 0,
    });
    const words = [
      'ICE',
      'SLED',
      'GLACIER',
      'LION',
      'TIGER',
      ...WORDS.filter(
        (w) =>
          ![
            'ICE',
            'SLED',
            'GLACIER',
            'LION',
            'TIGER',
            'SNOW',
            'FROST',
            'SKATE',
            'MITTEN',
            'SCARF',
            'SEAL',
            'WHALE',
            'WINTER',
            'POLE',
            'ZEBRA',
            'CAMEL',
            'JUNGLE',
            'HORN',
            'TRUNK',
            'MANE',
            'IVORY',
          ].includes(w),
      ).slice(0, BOARD_SIZE - 5),
    ];
    // ICE, SLED, GLACIER red; LION the assassin; TIGER blue.
    const key: Card[] = ['red', 'red', 'red', 'assassin', 'blue'];
    while (key.length < BOARD_SIZE)
      key.push(key.filter((k) => k === 'red').length < 9 ? 'bystander' : 'blue');
    const s: CodenamesState = { ...base, words, key, turn: 'red', starting: 'red' };
    const clue = ask(s, 'wren', 1) as Extract<CodenamesAction, { type: 'clue' }>;
    expect(clue).toMatchObject({ type: 'clue', count: 3 });
    expect(
      readClue(clue.word, words)
        .slice(0, 3)
        .every((w) => w >= 1),
    ).toBe(true);
    expect(readClue(clue.word, words)[3]).toBe(0);
  });

  it('an operative reads a clue by the table, never the key', () => {
    const s = codenames.setup({
      playerIds: ids(4),
      options: {
        ...defaultOptions(),
        teams: { wren: 'red', rook: 'red', magpie: 'blue', robin: 'blue' },
        spymasters: { red: 'wren', blue: 'magpie' },
      },
      rng: createRng(5),
      now: 0,
    });
    const words = ['APPLE', ...WORDS.filter((w) => w !== 'APPLE').slice(0, BOARD_SIZE - 1)];
    const t: CodenamesState = { ...s, words, turn: 'red', starting: 'red' };
    expect(codenames.getPlayerView(t, 'rook').key).toBeNull();
    const clued = codenames.applyAction(
      t,
      'wren',
      { type: 'clue', word: 'NEWTON', count: 1 },
      createRng(1),
      0,
    );
    // A lone operative's suggestion is a majority, so it's guessed at once.
    expect(ask(clued, 'rook', 1)).toEqual({ type: 'suggest', index: 0 });
    // A person's clue built on a board word reads too.
    expect(readClue('APPLES', words)[0]).toBeGreaterThan(0);
  });

  it('ends the turn once the clue’s number is found', () => {
    let s = codenames.setup({
      playerIds: ids(4),
      options: {
        ...defaultOptions(),
        teams: { wren: 'red', rook: 'red', magpie: 'blue', robin: 'blue' },
        spymasters: { red: 'wren', blue: 'magpie' },
      },
      rng: createRng(5),
      now: 0,
    });
    const key: Card[] = [...s.key];
    const words = [...s.words];
    s = { ...s, turn: 'red', starting: 'red', key, words };
    const red = key.findIndex((k) => k === 'red');
    words[red] = 'APPLE';
    s = codenames.applyAction(
      s,
      'wren',
      { type: 'clue', word: 'NEWTON', count: 1 },
      createRng(1),
      0,
    );
    s = codenames.applyAction(s, 'rook', { type: 'suggest', index: red }, createRng(1), 0);
    expect(s.phase).toBe('guess');
    expect(ask(s, 'rook', 2)).toEqual({ type: 'pass' });
  });
});

describe('ending a Codenames game early', () => {
  const s0 = () =>
    codenames.setup({
      playerIds: ids(4),
      options: {
        ...defaultOptions(),
        teams: { wren: 'red', rook: 'red', magpie: 'blue', robin: 'blue' },
        spymasters: { red: 'wren', blue: 'magpie' },
      },
      rng: createRng(9),
      now: 0,
    });
  const reveal = (s: CodenamesState, card: Card, n: number) => {
    const revealed = [...s.revealed];
    s.key.forEach((c, i) => {
      if (c === card && n > 0 && !revealed[i]) {
        revealed[i] = true;
        n--;
      }
    });
    return { ...s, revealed };
  };

  it('saves nothing before a team has found a word', () => {
    expect(codenames.partialResult!(s0())).toBeNull();
    expect(codenames.partialResult!(reveal(s0(), 'bystander', 2))).toBeNull();
  });

  it('gives it to the team that found more of its words', () => {
    const r = codenames.partialResult!(reveal(reveal(s0(), 'red', 5), 'blue', 3))!;
    expect(r.summary).toBe('Red led 5 words to 3');
    expect(r.winners.sort()).toEqual(['rook', 'wren']);
    expect(r.standings).toContainEqual({
      playerId: 'magpie',
      outcome: 'loss',
      team: 'Blue',
      role: 'Spymaster',
    });
    expect(r.standings).toContainEqual({
      playerId: 'rook',
      outcome: 'win',
      team: 'Red',
      role: 'Operative',
    });
  });

  it('calls a level game a draw for everyone', () => {
    const r = codenames.partialResult!(reveal(reveal(s0(), 'red', 2), 'blue', 2))!;
    expect(r.summary).toBe('Level at 2 words each');
    expect(r.winners).toEqual([]);
    expect(r.standings!.every((st) => st.outcome === 'draw')).toBe(true);
  });
});
