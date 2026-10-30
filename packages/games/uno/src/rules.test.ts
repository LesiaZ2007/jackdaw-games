import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { DECK_SIZE, cardName, cardOf, points, type Colour } from './cards';
import {
  CAUGHT_DRAW,
  HAND_SIZE,
  NEXT_ROUND_MS,
  uno as game,
  playable,
  type UnoAction,
  type UnoOptions,
  type UnoState,
} from './rules';

const ids = ['a', 'b', 'c'];
const opts = (o: Partial<UnoOptions> = {}): UnoOptions => ({
  ...game.defaultOptions(3),
  ...o,
});
const deal = (players = ids, o: Partial<UnoOptions> = {}, seed = 1) =>
  game.setup({ playerIds: players, options: opts(o), rng: createRng(seed), now: 0 });
const act = (s: UnoState, who: string, a: UnoAction, now = 0) =>
  game.applyAction(s, who, a, createRng(2), now);

/** Card ids by name: c('r', 7), c('b', 'skip'), c('w'), c('w4'). */
const OFF: Record<Colour, number> = { r: 0, y: 25, g: 50, b: 75 };
const ACTION_AT = { skip: 19, rev: 21, draw2: 23 } as const;
let spare = 0;
function c(
  colour: Colour | 'w' | 'w4',
  face?: number | keyof typeof ACTION_AT,
  second = false,
): number {
  if (colour === 'w') return 100 + (spare++ % 4);
  if (colour === 'w4') return 104 + (spare++ % 4);
  const k =
    typeof face === 'number'
      ? face === 0
        ? 0
        : 2 * face - 1
      : ACTION_AT[face as keyof typeof ACTION_AT];
  return OFF[colour] + k + (second && face !== 0 ? 1 : 0);
}

/** A round in progress with the hands, pile and turn chosen by hand. */
function table(
  hands: Record<string, number[]>,
  over: Partial<UnoState> = {},
  o: Partial<UnoOptions> = {},
): UnoState {
  const s = deal(Object.keys(hands), o);
  const used = new Set([...Object.values(hands).flat(), ...(over.discard ?? [c('r', 5)])]);
  return {
    ...s,
    hands,
    discard: [c('r', 5)],
    colour: 'r',
    toAct: Object.keys(hands)[0]!,
    dir: 1,
    deck: Array.from({ length: DECK_SIZE }, (_, i) => i).filter((i) => !used.has(i)),
    ...over,
  };
}

const total = (s: UnoState) =>
  Object.values(s.hands).reduce((n, h) => n + h.length, 0) + s.deck.length + s.discard.length;

describe('the deck', () => {
  it('has 108 cards: 19 numbers, 6 actions in each colour, and 8 wilds', () => {
    const faces = Array.from({ length: DECK_SIZE }, (_, i) => cardOf(i));
    expect(faces.filter((f) => f.colour === 'r')).toHaveLength(25);
    expect(faces.filter((f) => f.face === '0')).toHaveLength(4);
    expect(faces.filter((f) => f.face === '7')).toHaveLength(8);
    expect(faces.filter((f) => f.face === 'skip')).toHaveLength(8);
    expect(faces.filter((f) => f.face === 'wild')).toHaveLength(4);
    expect(faces.filter((f) => f.face === 'wild4')).toHaveLength(4);
    expect(cardName(c('b', 'skip'))).toBe('Blue Skip');
    expect(cardName(c('y', 9, true))).toBe('Gold 9');
    expect(cardName(104)).toBe('Wild Draw Four');
  });
  it('scores numbers at face value, actions at 20 and wilds at 50', () => {
    expect(points(c('g', 8))).toBe(8);
    expect(points(c('g', 'rev'))).toBe(20);
    expect(points(c('w4'))).toBe(50);
  });
});

describe('the deal', () => {
  it('gives everyone seven cards and turns up a number card', () => {
    const s = deal(['a', 'b', 'c', 'd']);
    for (const id of s.players) expect(s.hands[id]).toHaveLength(HAND_SIZE);
    expect(s.discard).toHaveLength(1);
    expect(cardOf(s.discard[0]!).face).toMatch(/^\d$/);
    expect(total(s)).toBe(DECK_SIZE);
    expect(s.toAct).toBe(s.players[(s.players.indexOf(s.dealer) + 1) % 4]);
  });
});

describe('playing', () => {
  it('takes a matching colour, number or symbol, or a wild, and refuses anything else', () => {
    const s = table({ a: [c('r', 9), c('b', 5), c('g', 2), c('w'), c('y', 1)], b: [c('y', 3)] });
    expect(() => act(s, 'a', { type: 'play', card: c('g', 2) })).toThrow(GameError);
    expect(act(s, 'a', { type: 'play', card: c('r', 9) }).colour).toBe('r');
    expect(act(s, 'a', { type: 'play', card: c('b', 5) }).colour).toBe('b');
    expect(() => act(s, 'a', { type: 'play', card: s.hands.a![3]! })).toThrow(/colour/);
    const w = act(s, 'a', { type: 'play', card: s.hands.a![3]!, colour: 'g' });
    expect(w.colour).toBe('g');
    expect(w.toAct).toBe('b');
    expect(() => act(s, 'b', { type: 'play', card: c('y', 3) })).toThrow(/turn/);
  });

  it('Skip misses the next player; Reverse turns play round', () => {
    const s = table({
      a: [c('r', 'skip'), c('r', 'rev'), c('b', 1)],
      b: [c('b', 2)],
      c: [c('b', 3)],
    });
    expect(act(s, 'a', { type: 'play', card: c('r', 'skip') }).toAct).toBe('c');
    const r = act(s, 'a', { type: 'play', card: c('r', 'rev') });
    expect(r.dir).toBe(-1);
    expect(r.toAct).toBe('c');
  });

  it('with two players Reverse is a Skip', () => {
    const s = table({ a: [c('r', 'rev'), c('b', 1)], b: [c('b', 2)] });
    expect(act(s, 'a', { type: 'play', card: c('r', 'rev') }).toAct).toBe('a');
  });

  it('Draw Two makes the next player take two and miss their go', () => {
    const s = table({ a: [c('r', 'draw2'), c('b', 1)], b: [c('b', 2)], c: [c('b', 3)] });
    const n = act(s, 'a', { type: 'play', card: c('r', 'draw2') });
    expect(n.hands.b).toHaveLength(3);
    expect(n.toAct).toBe('c');
    expect(total(n)).toBe(DECK_SIZE);
  });
});

describe('drawing', () => {
  it('draws one: a card that goes may be played or kept, one that doesn’t ends the turn', () => {
    const s = table({ a: [c('b', 1)], b: [c('b', 2)] });
    const good = act({ ...s, deck: [c('r', 7), ...s.deck] }, 'a', { type: 'draw' });
    expect(good.toAct).toBe('a');
    expect(good.drawn).toBe(c('r', 7));
    expect(() => act(good, 'a', { type: 'play', card: c('b', 1) })).toThrow(/drew/);
    expect(act(good, 'a', { type: 'pass' }).toAct).toBe('b');
    expect(act(good, 'a', { type: 'play', card: c('r', 7) }).discard.at(-1)).toBe(c('r', 7));
    const bad = act({ ...s, deck: [c('g', 7), ...s.deck] }, 'a', { type: 'draw' });
    expect(bad.toAct).toBe('b');
    expect(bad.hands.a).toHaveLength(2);
  });

  it('draws until a card goes when the table plays that way', () => {
    const s = table({ a: [c('b', 1)], b: [c('b', 2)] }, {}, { drawing: 'Draw until you can play' });
    const n = act({ ...s, deck: [c('g', 7), c('y', 8), c('r', 9), ...s.deck.slice(10)] }, 'a', {
      type: 'draw',
    });
    expect(n.hands.a).toHaveLength(4);
    expect(n.drawn).toBe(c('r', 9));
    expect(n.moves.at(-1)).toMatchObject({ kind: 'draw', count: 3 });
  });

  it('shuffles the discards back in when the draw pile runs out', () => {
    const s = table(
      { a: [c('b', 1)], b: [c('b', 2)] },
      { deck: [], discard: [c('g', 4), c('g', 6), c('r', 5)] },
    );
    const n = act(s, 'a', { type: 'draw' });
    expect(n.hands.a).toHaveLength(2);
    expect(n.discard).toEqual([c('r', 5)]);
    expect(n.deck).toHaveLength(1);
  });
});

describe('Wild Draw Four', () => {
  const s = table({ a: [c('w4'), c('r', 2), c('b', 1)], b: [c('b', 2)], c: [c('b', 3)] });
  const card = s.hands.a![0]!;
  const fair = table({ a: [card, c('b', 1), c('g', 1)], b: [c('b', 2)], c: [c('b', 3)] });

  it('waits on the next player, who takes four and misses their go', () => {
    const n = act(fair, 'a', { type: 'play', card, colour: 'g' });
    expect(n.toAct).toBe('b');
    expect(game.getTableView(n).pending).toEqual({ count: 4, from: 'a', wild4: true, was: 'r' });
    const t = act(n, 'b', { type: 'draw' });
    expect(t.hands.b).toHaveLength(5);
    expect(t.toAct).toBe('c');
    expect(t.colour).toBe('g');
  });

  it('a bluff challenged: the bluffer takes four and the challenger plays on', () => {
    const n = act(act(s, 'a', { type: 'play', card, colour: 'b' }), 'b', { type: 'challenge' });
    expect(n.hands.a).toHaveLength(6);
    expect(n.hands.b).toHaveLength(1);
    expect(n.toAct).toBe('b');
    expect(n.moves.at(-1)).toMatchObject({ kind: 'challenge', ok: true });
  });

  it('a fair one challenged costs the challenger six', () => {
    const n = act(act(fair, 'a', { type: 'play', card, colour: 'b' }), 'b', { type: 'challenge' });
    expect(n.hands.b).toHaveLength(7);
    expect(n.toAct).toBe('c');
    expect(n.moves.at(-1)).toMatchObject({ kind: 'challenge', ok: false });
  });

  it('keeps the bluff secret from every screen', () => {
    const n = act(s, 'a', { type: 'play', card, colour: 'b' });
    expect(JSON.stringify(game.getTableView(n))).not.toContain('bluff');
    expect(JSON.stringify(game.getPlayerView(n, 'b'))).not.toContain('bluff');
  });
});

describe('stacking', () => {
  it('is off by default: you can’t pass a Draw Two on', () => {
    const s = table({
      a: [c('r', 'draw2'), c('b', 1)],
      b: [c('b', 'draw2'), c('b', 2)],
      c: [c('b', 3)],
    });
    const n = act(s, 'a', { type: 'play', card: c('r', 'draw2') });
    expect(n.toAct).toBe('c');
  });

  it('when on, a Draw Two passes on and the next player takes the lot', () => {
    const s = table(
      { a: [c('r', 'draw2'), c('b', 1)], b: [c('b', 'draw2'), c('b', 2)], c: [c('b', 3)] },
      {},
      { stacking: 'Yes' },
    );
    const n = act(act(s, 'a', { type: 'play', card: c('r', 'draw2') }), 'b', {
      type: 'play',
      card: c('b', 'draw2'),
    });
    expect(n.toAct).toBe('c');
    expect(n.pending?.count).toBe(4);
    expect(() => act(n, 'c', { type: 'play', card: c('b', 3) })).toThrow(/Take 4/);
    const t = act(n, 'c', { type: 'draw' });
    expect(t.hands.c).toHaveLength(5);
    expect(t.toAct).toBe('a');
  });

  it('a Draw Two can’t go on a Wild Draw Four', () => {
    const w4 = c('w4');
    const s = table(
      { a: [w4, c('b', 1)], b: [c('b', 'draw2'), c('b', 2)], c: [c('b', 3)] },
      {},
      { stacking: 'Yes' },
    );
    const n = act(s, 'a', { type: 'play', card: w4, colour: 'b' });
    expect(() => act(n, 'b', { type: 'play', card: c('b', 'draw2') })).toThrow(GameError);
  });
});

describe('calling UNO', () => {
  const s = table({
    a: [c('r', 1), c('b', 1)],
    b: [c('b', 2), c('g', 2)],
    c: [c('b', 3), c('g', 3)],
  });

  it('anyone can catch you before the next player moves: you take two', () => {
    const n = act(s, 'a', { type: 'play', card: c('r', 1) });
    expect(n.uncalled).toBe('a');
    expect(() => act(n, 'a', { type: 'catch' })).toThrow(GameError);
    const caught = act(n, 'c', { type: 'catch' });
    expect(caught.hands.a).toHaveLength(1 + CAUGHT_DRAW);
    expect(caught.uncalled).toBeNull();
    expect(caught.toAct).toBe('b');
  });

  it('calling it, as you play or just after, keeps you safe', () => {
    const called = act(s, 'a', { type: 'play', card: c('r', 1), call: true });
    expect(called.uncalled).toBeNull();
    expect(called.called).toEqual(['a']);
    expect(() => act(called, 'b', { type: 'catch' })).toThrow(GameError);
    const late = act(act(s, 'a', { type: 'play', card: c('r', 1) }), 'a', { type: 'call' });
    expect(late.called).toEqual(['a']);
  });

  it('the next player’s move closes the window', () => {
    const n = act(act(s, 'a', { type: 'play', card: c('r', 1) }), 'b', { type: 'draw' });
    expect(n.uncalled).toBeNull();
    expect(() => act(n, 'c', { type: 'catch' })).toThrow(GameError);
  });
});

describe('rounds and scoring', () => {
  it('going out scores everyone else’s cards, and the next round deals itself', () => {
    const s = table({ a: [c('b', 5)], b: [c('g', 9), c('w')], c: [c('y', 'skip')] });
    const n = act(s, 'a', { type: 'play', card: c('b', 5) }, 1000);
    expect(n.phase).toBe('done');
    expect(n.last).toMatchObject({ winner: 'a', points: 9 + 50 + 20 });
    expect(n.scores.a).toBe(79);
    expect(n.dealAt).toBe(1000 + NEXT_ROUND_MS);
    expect(game.nextTimer!(n)).toEqual({ id: 'deal', at: 1000 + NEXT_ROUND_MS });
    const next = game.onTimer!(n, 'deal', createRng(3), n.dealAt!);
    expect(next.round).toBe(2);
    expect(next.phase).toBe('play');
    expect(next.dealer).not.toBe(s.dealer);
    expect(next.hands.a).toHaveLength(HAND_SIZE);
  });

  it('going out on a Draw Two still makes the next player draw, for the points', () => {
    const s = table({ a: [c('r', 'draw2')], b: [c('g', 9)], c: [] as number[] });
    const n = act({ ...s, deck: [c('y', 9), c('y', 8), ...s.deck.slice(4)] }, 'a', {
      type: 'play',
      card: c('r', 'draw2'),
    });
    expect(n.last?.points).toBe(9 + 9 + 8);
  });

  it('ends at the target with standings, scores and the biggest round', () => {
    const s = table(
      { a: [c('b', 5)], b: [c('w4')], c: [c('y', 2)] },
      { scores: { a: 190, b: 0, c: 0 } },
    );
    const n = act(s, 'a', { type: 'play', card: c('b', 5) });
    expect(game.getResult(n)).toBeNull();
    const over = act(n, 'b', { type: 'deal', after: n.round });
    expect(over.phase).toBe('over');
    const r = game.getResult(over)!;
    expect(r.winners).toEqual(['a']);
    expect(r.standings?.find((x) => x.playerId === 'a')).toMatchObject({
      outcome: 'win',
      role: '242 points',
    });
    expect(r.highlights?.[0]).toMatchObject({ award: 'Biggest round', value: 52 });
  });

  it('a one-round game ends after the first round', () => {
    const s = table({ a: [c('b', 5)], b: [c('g', 1)] }, { target: 0 });
    const over = act(act(s, 'a', { type: 'play', card: c('b', 5) }), 'b', { type: 'deal' });
    expect(game.getResult(over)?.winners).toEqual(['a']);
  });

  it('a stale "deal" from an older round does nothing', () => {
    const s = table({ a: [c('b', 5)], b: [c('g', 1)] });
    const n = act(s, 'a', { type: 'play', card: c('b', 5) });
    expect(act(n, 'b', { type: 'deal', after: n.round - 1 })).toBe(n);
  });
});

describe('turn timer', () => {
  it('runs out: the player draws and play moves on', () => {
    const s = deal(['a', 'b', 'c'], { turnTimer: '30 seconds' });
    expect(s.actBy).toBe(30_000);
    const who = s.toAct!;
    const n = game.onTimer!(s, 'act', createRng(4), 30_000);
    expect(n.toAct).not.toBe(who);
    expect(n.hands[who]).toHaveLength(HAND_SIZE + 1);
    expect(n.moves.at(-1)?.late).toBe(true);
    expect(n.actBy).toBe(60_000);
  });

  it('starts again when a two-player Skip brings the turn straight back', () => {
    const s = table(
      { a: [c('r', 'skip'), c('b', 1)], b: [c('g', 2)] },
      {},
      { turnTimer: '30 seconds' },
    );
    const n = act(s, 'a', { type: 'play', card: c('r', 'skip') }, 20_000);
    expect(n.toAct).toBe('a');
    expect(n.actBy).toBe(50_000);
  });

  it('starts again for the challenger when a bluff is caught', () => {
    const s = table(
      { a: [c('w4'), c('r', 1), c('g', 3)], b: [c('g', 2), c('y', 4)], c: [c('b', 6)] },
      {},
      { turnTimer: '30 seconds' },
    );
    const n = act(s, 'a', { type: 'play', card: s.hands.a![0]!, colour: 'b' }, 10_000);
    expect(n.actBy).toBe(40_000);
    const ch = act(n, 'b', { type: 'challenge' }, 25_000);
    expect(ch.toAct).toBe('b');
    expect(ch.actBy).toBe(55_000);
  });

  it('keeps running through a call or a catch', () => {
    const s = table(
      { a: [c('r', 1), c('b', 1)], b: [c('g', 2), c('g', 3)], c: [c('y', 4)] },
      {},
      {
        turnTimer: '30 seconds',
      },
    );
    const n = act(s, 'a', { type: 'play', card: c('r', 1) }, 10_000);
    expect(n.uncalled).toBe('a');
    expect(act(n, 'a', { type: 'call' }, 20_000).actBy).toBe(40_000);
    expect(act(n, 'c', { type: 'catch' }, 20_000).actBy).toBe(40_000);
  });
});

describe('hidden information', () => {
  it('the table view and other players never see anyone’s cards or the draw pile', () => {
    const s = deal(['a', 'b', 'c', 'd']);
    const tv = JSON.stringify(game.getTableView(s));
    const b = game.getPlayerView(s, 'b');
    expect(tv).not.toMatch(/"hand"|"hands"|"deck"|"drawn"/);
    expect(b.hand).toEqual([...s.hands.b!].sort((x, y) => x - y));
    expect(JSON.stringify(b)).not.toContain(JSON.stringify([...s.hands.a!].sort((x, y) => x - y)));
    expect(Object.keys(b)).not.toContain('deck');
  });

  it('only the player who drew sees the card they drew', () => {
    const s = table({ a: [c('b', 1)], b: [c('b', 2)] });
    const n = act({ ...s, deck: [c('r', 7), ...s.deck] }, 'a', { type: 'draw' });
    expect(game.getPlayerView(n, 'a').drawn).toBe(c('r', 7));
    expect(game.getPlayerView(n, 'b').drawn).toBeNull();
    expect(game.getTableView(n).deciding).toBe(true);
  });

  it('a fuzzed game keeps every card accounted for and never leaks a hand', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const players = ['a', 'b', 'c', 'd', 'e'].slice(0, 2 + (seed % 4));
      let s = deal(
        players,
        {
          stacking: seed % 2 ? 'Yes' : 'No',
          drawing: seed % 3 ? 'Draw one' : 'Draw until you can play',
        },
        seed,
      );
      const rng = createRng(seed * 7);
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        if (s.phase === 'done') {
          s = game.applyAction(s, players[0]!, { type: 'deal' }, rng, i);
          continue;
        }
        const me = s.toAct!;
        const v = game.getPlayerView(s, me);
        const can = playable(v);
        const choice = rng.int(10);
        let a: UnoAction;
        if (s.uncalled && s.uncalled !== me && choice === 0) a = { type: 'catch' };
        else if (v.pending?.wild4 && choice < 3) a = { type: 'challenge' };
        else if (can.length && choice > 1) {
          const card = rng.pick(can);
          a = {
            type: 'play',
            card,
            colour: rng.pick(['r', 'y', 'g', 'b'] as const),
            call: choice > 4,
          };
        } else a = v.drawn !== null ? { type: 'pass' } : { type: 'draw' };
        const who = a.type === 'catch' ? players.find((p) => p !== s.uncalled)! : me;
        s = game.applyAction(s, who, a, rng, i);
        expect(total(s)).toBe(DECK_SIZE);
        const t = game.getTableView(s);
        for (const p of players) expect(t.counts[p]).toBe(s.hands[p]!.length);
        expect(JSON.stringify(t)).not.toMatch(/"hands?"|"deck"|bluff/);
      }
    }
  });
});

describe('the recap', () => {
  it('logs wild calls, bluff challenges and the final card, with the hidden truth in secret', () => {
    const s = table({
      a: [c('w4'), c('r', 2), c('b', 1), c('w')],
      b: [c('b', 2), c('g', 5)],
      c: [c('b', 3)],
    });
    const card = s.hands.a![0]!;
    const played = act(s, 'a', { type: 'play', card, colour: 'b' });
    // Nothing secret reaches a screen mid-game.
    expect(JSON.stringify(game.getTableView(played))).not.toContain('bluff');
    expect(JSON.stringify(game.getTableView(played))).not.toContain('recap');
    const n = act(played, 'b', { type: 'challenge' });
    const ev = n.recap.find((e) => e.tag === 'Bluff caught')!;
    expect(ev).toMatchObject({ actor: 'b', tone: 'good', key: true, round: 1 });
    expect(ev.secret).toContain('{a}');
    expect(n.recap.find((e) => e.tag === 'Draw 4')?.secret).toMatch(/bluff/);
    const wildCard = s.hands.a![3]!;
    const wild = act(table({ a: [wildCard, c('r', 2)], b: [c('b', 2)] }), 'a', {
      type: 'play',
      card: wildCard,
      colour: 'g',
    });
    expect(wild.recap.at(-1)).toMatchObject({ tag: 'Green' });
    expect(wild.recap.at(-1)!.secret).toContain('Red');
  });

  it('ends with stats rows, winner first, and the leftover hands as a secret', () => {
    const s = table({ a: [c('b', 5)], b: [c('g', 9), c('w')], c: [c('y', 'skip')] }, { target: 0 });
    const over = act(act(s, 'a', { type: 'play', card: c('b', 5) }), 'b', { type: 'deal' });
    const r = game.getResult(over)!;
    expect(r.stats!.rows.map((x) => x.playerId)[0]).toBe('a');
    expect(r.stats!.rows).toHaveLength(3);
    for (const row of r.stats!.rows) expect(row.values).toHaveLength(r.stats!.columns.length);
    const last = r.recap.at(-1)!;
    expect(last).toMatchObject({ tag: '+79', key: true, tone: 'good' });
    expect(last.secret).toContain('{b} was left with');
  });

  it('logs UNO calls and catches', () => {
    const s = table({
      a: [c('r', 1), c('b', 1)],
      b: [c('b', 2), c('g', 2)],
      c: [c('b', 3), c('g', 3)],
    });
    const n = act(s, 'a', { type: 'play', card: c('r', 1) });
    const caught = act(n, 'c', { type: 'catch' });
    expect(caught.recap.at(-1)).toMatchObject({ actor: 'a', tag: 'Caught +2', tone: 'bad' });
    const called = act(s, 'a', { type: 'play', card: c('r', 1), call: true });
    expect(called.recap.at(-1)).toMatchObject({ tag: 'UNO!' });
    expect(act(n, 'a', { type: 'call' }).recap.at(-1)).toMatchObject({ tag: 'UNO!' });
  });
});
