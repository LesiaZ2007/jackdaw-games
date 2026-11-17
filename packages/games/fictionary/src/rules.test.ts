import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { BANK } from './bank';
import { CATEGORIES, type Category } from './bank/types';
import { fictionaryBot } from './bot';
import {
  factOf,
  fillBlank,
  FOOL_POINTS,
  fictionary as game,
  LIKE_POINTS,
  MIN_ANSWERS,
  NUDGE_MS,
  TRUTH_POINTS,
  type FictionaryOptions,
  type FictionaryState,
} from './rules';
import { isTruth, normalize } from './truth';

const birds = [
  'wren',
  'rook',
  'magpie',
  'robin',
  'finch',
  'heron',
  'swift',
  'kite',
  'crow',
  'jay',
  'tit',
  'owl',
];
const opts = (o: Partial<FictionaryOptions> = {}): FictionaryOptions => ({
  ...game.defaultOptions(3),
  ...o,
});
const start = (n = 3, o: Partial<FictionaryOptions> = {}, seed = 1) =>
  game.setup({ playerIds: birds.slice(0, n), options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: FictionaryState, id: string, a: Parameters<typeof game.applyAction>[2], now = 1) =>
  game.applyAction(s, id, a, createRng(9), now);

/** Past the choose phase, onto a card's write phase. */
function toWrite(s: FictionaryState): FictionaryState {
  if (s.phase !== 'choose') return s;
  return act(s, s.play.chooser!, { type: 'choose', tab: s.play.offer[0]! });
}
const fact = (s: FictionaryState) => factOf(s.play.cat!, s.play.idx);
/** A lie for this card that can't be the truth. */
const lie = (s: FictionaryState, n: number) => `zzq made up ${n}`;
function writeAll(s: FictionaryState, lies?: Record<string, string>): FictionaryState {
  for (const [i, id] of s.players.entries())
    s = act(s, id, { type: 'write', text: lies?.[id] ?? lie(s, i) });
  return s;
}

describe('the bank', () => {
  const all = (Object.keys(BANK) as Category[]).flatMap((c) => BANK[c].map((f) => ({ c, f })));

  it('has a card in some tab and every tab has a name', () => {
    expect(all.length).toBeGreaterThan(100);
    for (const c of Object.keys(BANK)) expect(CATEGORIES[c as Category]).toBeTruthy();
  });

  it.each(all.map(({ c, f }) => [c, f.q, f] as const))('%s: %s', (_c, _q, f) => {
    expect(f.q.split('____').length, 'one blank').toBe(2);
    expect(f.a.length).toBeGreaterThan(0);
    expect(f.a.length).toBeLessThanOrEqual(30);
    expect(f.lies).toHaveLength(4);
    expect(new Set(f.lies.map(normalize)).size, 'four different lies').toBe(4);
    for (const l of f.lies) {
      expect(l.length).toBeLessThanOrEqual(40);
      expect(isTruth(l, f), `lie "${l}" reads as the truth`).toBe(false);
    }
    expect(f.note.length).toBeLessThanOrEqual(160);
    expect(f.src.length).toBeGreaterThan(0);
  });

  it('never gives the answer away in its own sentence', () => {
    // 2026-11-16: "some of the facts are a bit too obvious, like the morgana one".
    const roots = (t: string) =>
      normalize(t)
        .split(' ')
        .filter((w) => w.length >= 5)
        .map((w) => w.slice(0, 5));
    const bad = all.filter(({ f }) => {
      const q = roots(f.q.replace('____', ' '));
      return roots(f.a).some((r) => q.includes(r));
    });
    expect(bad.map(({ c, f }) => `${c}: ${f.q} → ${f.a}`)).toEqual([]);
  });

  it('never has the same card twice', () => {
    const seen = new Map<string, string>();
    for (const { c, f } of all) {
      const key = normalize(f.q);
      expect(seen.get(key), `${c}: ${f.q}`).toBeUndefined();
      seen.set(key, c);
    }
  });
});

describe('the truth check', () => {
  const f = { a: 'parliament', alt: ['a parliament of owls'] };
  it('sees through case, articles, punctuation and a slip', () => {
    for (const t of [
      'Parliament',
      'a parliament.',
      'THE PARLIAMENT!',
      'parliments',
      'parliaments',
      'A parliament of owls',
    ])
      expect(isTruth(t, f), t).toBe(true);
  });
  it('lets real lies through', () => {
    for (const t of ['senate', 'a congress', 'parley', 'hoot'])
      expect(isTruth(t, f), t).toBe(false);
  });
  it('reads numbers either way', () => {
    expect(isTruth('one thousand', { a: '1,000' })).toBe(true);
    expect(isTruth('a hundred', { a: '100' })).toBe(true);
    expect(isTruth('101', { a: '100' })).toBe(false);
  });
});

describe('a card', () => {
  it('starts with a chooser offered up to three tabs', () => {
    const s = start();
    expect(s.phase).toBe('choose');
    expect(s.play.offer.length).toBeGreaterThan(0);
    expect(s.play.offer.length).toBeLessThanOrEqual(3);
    expect(game.waitingOn!(s)).toEqual([s.play.chooser]);
  });

  it('only the chooser chooses, and only a tab on offer', () => {
    const s = start();
    const other = s.players.find((id) => id !== s.play.chooser)!;
    expect(() => act(s, other, { type: 'choose', tab: s.play.offer[0]! })).toThrow(GameError);
    expect(() => act(s, s.play.chooser!, { type: 'choose', tab: 'nope' })).toThrow(GameError);
  });

  it('deals a random tab when nobody chooses in time', () => {
    const s = start();
    const t = game.nextTimer!(s)!;
    const n = game.onTimer!(s, t.id, createRng(2), t.at);
    expect(n.phase).toBe('write');
    expect(s.play.offer).toContain(n.play.cat);
  });

  it('skips choosing with random tabs or a one-tab deck', () => {
    expect(start(3, { tabs: 'Random' }).phase).toBe('write');
    const w = start(3, { deck: 'Words' });
    expect(w.phase).toBe('write');
    expect(w.play.cat).toBe('words');
  });

  it('refuses the truth as a lie', () => {
    const s = toWrite(start());
    expect(() => act(s, 'wren', { type: 'write', text: fact(s).a })).toThrow(/truth/);
  });

  it('opens the pick once everyone has written, with house lies up to the minimum', () => {
    const s = writeAll(toWrite(start(2)));
    expect(s.phase).toBe('pick');
    expect(s.play.entries.length).toBe(MIN_ANSWERS);
    expect(s.play.entries.filter((e) => e.truth)).toHaveLength(1);
  });

  it('merges the same lie from two players', () => {
    const s = writeAll(toWrite(start(3)), {
      wren: 'A Big Lie',
      rook: 'a big lie.',
      magpie: 'other',
    });
    const merged = s.play.entries.find((e) => e.by.length === 2)!;
    expect(merged.by.sort()).toEqual(['rook', 'wren']);
  });

  it('won’t let you pick your own lie', () => {
    const s = writeAll(toWrite(start(3)));
    const mine = s.play.entries.find((e) => e.by.includes('wren'))!;
    expect(() => act(s, 'wren', { type: 'pick', id: mine.id })).toThrow(/own/);
  });

  it('scores the truth and each player fooled, doubled in round 2', () => {
    let s = writeAll(toWrite(start(3)));
    const truth = s.play.entries.find((e) => e.truth)!;
    const wrens = s.play.entries.find((e) => e.by.includes('wren'))!;
    s = act(s, 'wren', { type: 'pick', id: truth.id });
    s = act(s, 'rook', { type: 'pick', id: wrens.id });
    s = act(s, 'magpie', { type: 'like', id: wrens.id });
    s = act(s, 'magpie', { type: 'pick', id: wrens.id });
    expect(s.phase).toBe('reveal');
    expect(s.scores.wren).toBe(TRUTH_POINTS + 2 * FOOL_POINTS + LIKE_POINTS);
    expect(s.scores.rook).toBe(0);
    const card = s.history[0]!;
    expect(card.gains.wren).toBe(s.scores.wren);
  });

  it('counts a like given during the reveal', () => {
    let s = writeAll(toWrite(start(3)));
    const rooks = s.play.entries.find((e) => e.by.includes('rook'))!;
    for (const id of s.players) {
      const pick = s.play.entries.find((e) => !e.by.includes(id))!;
      s = act(s, id, { type: 'pick', id: pick.id });
    }
    const before = s.scores.rook!;
    s = act(s, 'wren', { type: 'like', id: rooks.id });
    expect(s.scores.rook).toBe(before + LIKE_POINTS);
    s = act(s, 'wren', { type: 'like', id: rooks.id });
    expect(s.scores.rook).toBe(before);
  });

  it('lets someone who’s done start a short countdown', () => {
    let s = toWrite(start(3, { timer: 'Off' }));
    expect(s.actBy).toBeNull();
    expect(() => act(s, 'wren', { type: 'nudge' })).toThrow(/own/);
    s = act(s, 'wren', { type: 'write', text: 'zzq' });
    s = act(s, 'wren', { type: 'nudge' }, 100);
    expect(s.actBy).toBe(100 + NUDGE_MS);
  });

  it('hands out two house lies once', () => {
    let s = toWrite(start(3));
    s = act(s, 'wren', { type: 'help' });
    const v = game.getPlayerView(s, 'wren');
    expect(v.suggestions).toHaveLength(2);
    for (const x of v.suggestions) expect(fact(s).lies).toContain(x);
    expect(act(s, 'wren', { type: 'help' })).toBe(s);
  });
});

describe('hidden information', () => {
  it('never shows the answer, authors or picks before the reveal', () => {
    let s = toWrite(start(4));
    const answer = fact(s).a;
    const note = fact(s).note;
    s = act(s, 'wren', { type: 'write', text: 'zzq secret one' });
    s = act(s, 'rook', { type: 'help' });
    for (const st of [s, writeAll(s)]) {
      const table = JSON.stringify(game.getTableView(st));
      if (st.phase === 'write') expect(table).not.toContain('zzq secret one');
      expect(table).not.toContain(note);
      if (st.phase !== 'pick') expect(table).not.toContain(answer);
      expect(table).not.toContain('"by"');
      expect(table).not.toContain('"truth"');
      for (const id of st.players) {
        const view = JSON.stringify(game.getPlayerView(st, id));
        expect(view).not.toContain(note);
        expect(view).not.toContain('"truth"');
        if (id !== 'rook') expect(game.getPlayerView(st, id).suggestions).toEqual([]);
        if (id !== 'wren' && st.phase === 'write') expect(view).not.toContain('zzq secret one');
      }
    }
  });
});

describe('the recap', () => {
  // 2026-11-16: "make sure there's a game recap for fictionary too".
  it('tells every card: the truth, who found it and every lie that fooled someone', () => {
    let s = writeAll(toWrite(start(3)));
    const truth = s.play.entries.find((e) => e.truth)!;
    const wrens = s.play.entries.find((e) => e.by.includes('wren'))!;
    s = act(s, 'wren', { type: 'pick', id: truth.id });
    s = act(s, 'rook', { type: 'pick', id: wrens.id });
    s = act(s, 'magpie', { type: 'pick', id: wrens.id });
    const r = game.partialResult!(s)!;
    const texts = r.recap.map((e) => e.text);
    expect(r.recap.every((e) => e.round === 1)).toBe(true);
    expect(texts[0]).toContain(`“${s.history[0]!.answer}”`);
    expect(texts).toContain('{wren} found the truth.');
    expect(
      texts.some((t) => t.startsWith('{wren}’s lie') && t.includes('{rook} and {magpie}')),
    ).toBe(true);
    expect(r.recap.some((e) => e.key)).toBe(true);
    expect(r.roundName).toBe('Card');
  });

  it('never doubles the quotes round a blank that is already quoted', () => {
    expect(fillBlank('Reykjavík means “____ bay.”', 'smoky')).toBe('Reykjavík means “smoky bay.”');
    expect(fillBlank('A group of owls is a ____.', 'parliament')).toBe(
      'A group of owls is a “parliament”.',
    );
  });
});

describe('bots', () => {
  function playOut(n: number, o: Partial<FictionaryOptions>, seed: number) {
    let now = 1_000;
    let s = start(n, o, seed);
    let moves = 0;
    while (s.phase !== 'over') {
      if (++moves > 3000) throw new Error(`no finish (seed ${seed})`);
      now += 1500;
      const id = game.waitingOn!(s)[0];
      if (id) {
        const a = fictionaryBot({
          playerId: id,
          playerIds: s.players,
          view: game.getPlayerView(s, id),
          tableView: game.getTableView(s),
          rng: createRng(seed * 31 + moves),
          now,
          level: 'normal',
        });
        if (a) {
          s = game.applyAction(s, id, a, createRng(moves), now);
          continue;
        }
      }
      const t = game.nextTimer!(s);
      if (!t) throw new Error(`stuck in ${s.phase}`);
      now = Math.max(now, t.at);
      s = game.onTimer!(s, t.id, createRng(moves), now);
    }
    return s;
  }

  it.each([
    [2, {}],
    [5, { length: 'Long' as const }],
    [12, { deck: 'Facts' as const, timer: 'Off' as const }],
    [4, { deck: 'Words' as const, tabs: 'Random' as const }],
  ])('play a whole game with %i seats', (n, o) => {
    for (const seed of [1, 2, 3]) {
      const s = playOut(n, o, seed);
      const r = game.getResult(s)!;
      expect(r.winners.length).toBeGreaterThan(0);
      expect(s.history).toHaveLength(s.plan[0] + s.plan[1] + 1);
      expect(new Set(s.used).size).toBe(s.used.length);
      expect(r.stats!.rows).toHaveLength(n);
    }
  });
});
