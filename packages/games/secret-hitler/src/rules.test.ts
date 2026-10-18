import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import {
  boardFor,
  deckFor,
  defaultOptions,
  fascistTeamSize,
  lineupFor,
  validateShOptions,
  type Policy,
  type Role,
} from './lineup';
import { eligibleChancellors, secretHitler as game, type ShAction, type ShState } from './rules';

const rng = createRng(7);
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/**
 * A table of `n` with chosen roles (default: p0 Hitler, p1.. Fascists, the rest Liberal), p0 as
 * the first president, and a stacked deck so tests know what gets drawn.
 */
function table(n: number, opts: { roles?: Role[]; deck?: Policy[]; president?: string } = {}) {
  const s = game.setup({ playerIds: ids(n), options: defaultOptions(), rng, now: 0 });
  const team = fascistTeamSize(n, defaultOptions());
  const roles =
    opts.roles ??
    ids(n).map((_, i): Role => (i === 0 ? 'hitler' : i < team ? 'fascist' : 'liberal'));
  const president = opts.president ?? 'p0';
  return {
    ...s,
    roles: Object.fromEntries(ids(n).map((id, i) => [id, roles[i]!])),
    deck: opts.deck ?? s.deck,
    president,
    rotation: president,
  } satisfies ShState;
}

const apply = (s: ShState, who: string, a: ShAction) => game.applyAction(s, who, a, rng, 0);

/** One move, with the president pressing End term straight away once the round is done. */
function act(s: ShState, who: string, a: ShAction): ShState {
  const next = apply(s, who, a);
  return next.phase === 'post' ? apply(next, next.president, { type: 'endTerm' }) : next;
}

/** Everyone alive votes; `nein` lists who votes no. */
function vote(s: ShState, nein: string[] = []): ShState {
  let next = s;
  for (const id of s.players.filter((p) => !s.dead.includes(p)))
    next = act(next, id, { type: 'vote', ja: !nein.includes(id) });
  return next;
}

/** A whole elected government that enacts `policy` (the deck must allow it). */
function govern(s: ShState, chancellor: string, policy: Policy): ShState {
  let next = act(s, s.president, { type: 'nominate', chancellor });
  next = vote(next);
  const toss = next.hand.find((p, i) => next.hand.indexOf(policy) !== i) ?? policy;
  next = act(next, next.president, { type: 'discard', policy: toss });
  return act(next, chancellor, { type: 'enact', policy });
}

/** A chancellor who is not term-limited and not Hitler, for routine governments. */
const anyone = (s: ShState) =>
  eligibleChancellors(s).find((id) => s.roles[id] !== 'hitler') ?? eligibleChancellors(s)[0]!;

const L: Policy = 'liberal';
const F: Policy = 'fascist';

describe('the deal', () => {
  it('follows the official counts at 5 to 10', () => {
    const expected: Record<number, [number, number]> = {
      5: [3, 1],
      6: [4, 1],
      7: [4, 2],
      8: [5, 2],
      9: [5, 3],
      10: [6, 3],
    };
    for (const [n, [liberals, fascists]] of Object.entries(expected)) {
      const s = game.setup({ playerIds: ids(+n), options: defaultOptions(), rng, now: 0 });
      const roles = Object.values(s.roles);
      expect(roles.filter((r) => r === 'liberal')).toHaveLength(liberals);
      expect(roles.filter((r) => r === 'fascist')).toHaveLength(fascists);
      expect(roles.filter((r) => r === 'hitler')).toHaveLength(1);
      expect(s.deck.filter((p) => p === L)).toHaveLength(6);
      expect(s.deck.filter((p) => p === F)).toHaveLength(11);
    }
  });

  it('uses the house rules at 11 to 15, with Liberals always ahead', () => {
    const o = defaultOptions();
    expect([11, 12, 13, 14, 15].map((n) => fascistTeamSize(n, o))).toEqual([5, 5, 6, 6, 7]);
    for (const n of [11, 12, 13, 14, 15]) {
      const { liberals, fascists } = lineupFor(n, o);
      expect(liberals).toBeGreaterThan(fascists + 1);
      expect(validateShOptions(o, n)).toBeNull();
      expect(boardFor(n)).toEqual(boardFor(10));
    }
    expect(deckFor(11, o)).toEqual({ liberal: 7, fascist: 12 });
    expect(deckFor(15, o)).toEqual({ liberal: 8, fascist: 13 });
    expect(deckFor(12, { ...o, bigDeck: false })).toEqual({ liberal: 6, fascist: 11 });
    expect(deckFor(10, o)).toEqual({ liberal: 6, fascist: 11 });
  });

  it('refuses house options that would let the Fascists match the Liberals', () => {
    expect(validateShOptions({ fascistTeam: 6, bigDeck: true }, 12)).toMatch(/outnumber/);
    expect(validateShOptions({ fascistTeam: 4, bigDeck: true }, 12)).toBeNull();
    expect(validateShOptions({ fascistTeam: 7, bigDeck: true }, 15)).toBeNull();
    // Official counts ignore the house options.
    expect(validateShOptions({ fascistTeam: 7, bigDeck: true }, 8)).toBeNull();
    const s = game.setup({
      playerIds: ids(12),
      options: { fascistTeam: 4, bigDeck: true },
      rng,
      now: 0,
    });
    expect(Object.values(s.roles).filter((r) => r !== 'liberal')).toHaveLength(4);
    expect(s.deck).toHaveLength(19);
  });

  it('tells Fascists their team, and Hitler only at 5 and 6 players', () => {
    for (const n of [5, 6, 7, 10]) {
      const s = table(n);
      const fascistView = game.getPlayerView(s, 'p1');
      expect(fascistView.known.map((k) => k.id).sort()).toEqual(
        ids(n).filter((id) => id !== 'p1' && s.roles[id] !== 'liberal'),
      );
      const hitlerView = game.getPlayerView(s, 'p0');
      expect(hitlerView.known.length > 0).toBe(n <= 6);
      expect(game.getPlayerView(s, ids(n)[n - 1]!).known).toEqual([]);
    }
  });
});

describe('ending a term', () => {
  it('waits for the president to press End term after every round', () => {
    let s = table(5, { deck: [L, L, F, F, F, F, F, F, F, F] });
    s = apply(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    for (const id of s.players) s = apply(s, id, { type: 'vote', ja: id !== 'p4' });
    s = apply(s, 'p0', { type: 'discard', policy: F });
    s = apply(s, 'p3', { type: 'enact', policy: L });
    expect(s.phase).toBe('post');
    expect(s.president).toBe('p0');
    expect(s.nominee).toBe('p3');
    expect(game.getTableView(s).phase).toBe('post');
    expect(() => apply(s, 'p3', { type: 'endTerm' })).toThrow(/Only the president/);
    s = apply(s, 'p0', { type: 'endTerm' });
    expect(s.phase).toBe('nominate');
    expect(s.president).toBe('p1');
    expect(s.nominee).toBeNull();
    expect(() => apply(s, 'p1', { type: 'endTerm' })).toThrow(/not over/);
  });

  it('also follows a failed vote', () => {
    let s = apply(table(5), 'p0', { type: 'nominate', chancellor: 'p3' });
    for (const id of s.players) s = apply(s, id, { type: 'vote', ja: false });
    expect(s.phase).toBe('post');
    expect(s.tracker).toBe(1);
    expect(apply(s, 'p0', { type: 'endTerm' }).president).toBe('p1');
  });
});

describe('elections', () => {
  it('applies term limits, except the last president when five are left', () => {
    let s = table(7);
    s = govern(s, 'p3', L);
    // p1 is president now; p0 (last president) and p3 (last chancellor) are term-limited.
    expect(s.president).toBe('p1');
    expect(eligibleChancellors(s)).not.toContain('p0');
    expect(eligibleChancellors(s)).not.toContain('p3');
    expect(() => act(s, 'p1', { type: 'nominate', chancellor: 'p3' })).toThrow(GameError);

    let five = table(5);
    five = govern(five, 'p3', L);
    expect(eligibleChancellors(five)).toContain('p0');
    expect(eligibleChancellors(five)).not.toContain('p3');
  });

  it('only the president nominates, and votes stay hidden until all are in', () => {
    let s = table(5);
    expect(() => act(s, 'p2', { type: 'nominate', chancellor: 'p3' })).toThrow(/president/);
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    s = act(s, 'p1', { type: 'vote', ja: false });
    s = act(s, 'p1', { type: 'vote', ja: true }); // changed their mind
    const tv = game.getTableView(s);
    expect(tv.voted).toEqual(['p1']);
    expect(JSON.stringify(tv)).not.toMatch(/"ja"|ballots/);
    expect(game.getPlayerView(s, 'p2').myVote).toBeNull();
    expect(game.getPlayerView(s, 'p1').myVote).toBe(true);
  });

  it('needs a strict majority: a tie fails and moves the tracker', () => {
    let s = table(6);
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    s = vote(s, ['p1', 'p2', 'p4']);
    expect(s.tracker).toBe(1);
    expect(s.phase).toBe('nominate');
    expect(s.president).toBe('p1');
    expect(game.getTableView(s).governments[0]).toMatchObject({ passed: false });
    expect(Object.keys(game.getTableView(s).governments[0]!.votes)).toHaveLength(6);
  });

  it('three failed elections enact the top policy with no power and clear term limits', () => {
    let s = table(7, { deck: [F, F, L, L, L, F, F, F, F, L, L, F, F, F, F, F, F] });
    s = govern(s, 'p3', F); // fascist 1, no power at 7
    expect(s.lastChancellor).toBe('p3');
    for (let i = 0; i < 3; i++) {
      s = act(s, s.president, { type: 'nominate', chancellor: anyone(s) });
      s = vote(s, s.players);
    }
    expect(s.tracker).toBe(0);
    expect(s.fascist + s.liberal).toBe(2);
    expect(s.phase).toBe('nominate');
    expect(s.pending).toBeNull();
    expect(s.lastChancellor).toBeNull();
    expect(s.lastPresident).toBeNull();
    expect(s.chaos).toHaveLength(1);
  });

  it('electing Hitler chancellor wins for the Fascists only after three Fascist policies', () => {
    const s = table(5, { president: 'p2' });
    let early = act(s, 'p2', { type: 'nominate', chancellor: 'p0' });
    early = vote(early);
    expect(early.winner).toBeNull();

    let late: ShState = { ...s, fascist: 3 };
    late = act(late, 'p2', { type: 'nominate', chancellor: 'p0' });
    late = vote(late);
    expect(late.winner).toBe('fascist');
    expect(late.reason).toBe('hitler-elected');
    expect(game.getResult(late)!.summary).toMatch(/Hitler was elected/);
  });
});

describe('legislation', () => {
  it('gives the president three cards, the chancellor two, and records what was drawn', () => {
    let s = table(5, { deck: [L, F, F, L, L, L, F, F, F, F, F, F, F, F, F, L, L] });
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    s = vote(s);
    expect(s.phase).toBe('president');
    expect(game.getPlayerView(s, 'p0').hand).toEqual([L, F, F]);
    expect(game.getPlayerView(s, 'p3').hand).toEqual([]);
    expect(game.getPlayerView(s, 'p1').hand).toEqual([]);
    expect(() => act(s, 'p3', { type: 'enact', policy: F })).toThrow();
    s = act(s, 'p0', { type: 'discard', policy: L });
    expect(game.getPlayerView(s, 'p3').hand).toEqual([F, F]);
    expect(game.getPlayerView(s, 'p0').hand).toEqual([]);
    expect(() => act(s, 'p3', { type: 'enact', policy: L })).toThrow(/don't hold/);
    s = act(s, 'p3', { type: 'enact', policy: F });
    expect(s.fascist).toBe(1);
    expect(s.discard).toEqual([L, F]);
    expect(s.governments[0]).toMatchObject({
      drawn: [L, F, F],
      presidentDiscard: L,
      chancellorDiscard: F,
      enacted: F,
    });
    // The table only ever learns what was enacted.
    const tv = JSON.stringify(game.getTableView(s));
    expect(tv).not.toMatch(/drawn|Discard/);
  });

  it('shuffles the discards back in when fewer than three cards are left', () => {
    let s = table(5, { deck: [L, F, F, L, L] });
    s = { ...s, discard: [F, F, F, F] };
    s = govern(s, 'p3', F);
    expect(s.deck.length).toBeGreaterThanOrEqual(3);
    expect(s.deck.length + s.discard.length).toBe(8);
    expect(s.discard).toEqual([]);
  });
});

describe('presidential powers', () => {
  it('5–6 players: the third Fascist policy lets the president peek at the top three', () => {
    let s = table(5, { deck: [F, F, F, L, L, L, F, F, F, F, F, F, F, F, F, L, L] });
    s = { ...s, fascist: 2 };
    s = govern(s, 'p3', F);
    expect(s.phase).toBe('power');
    expect(s.pending).toBe('peek');
    expect(game.getPlayerView(s, 'p0').peek).toEqual(s.deck.slice(0, 3));
    expect(game.getPlayerView(s, 'p3').peek).toBeNull();
    expect(JSON.stringify(game.getTableView(s))).not.toMatch(/peek":\[/);
    s = act(s, 'p0', { type: 'power' });
    expect(s.phase).toBe('nominate');
    expect(s.governments[0]!.secret?.cards).toHaveLength(3);
  });

  it('7–8 players: investigate at two, and only that president learns the answer', () => {
    let s = table(7, { deck: Array<Policy>(17).fill(F) });
    s = { ...s, fascist: 1 };
    s = govern(s, 'p3', F);
    expect(s.pending).toBe('investigate');
    expect(() => act(s, 'p0', { type: 'power' })).toThrow(/Pick another/);
    expect(() => act(s, 'p0', { type: 'power', target: 'p0' })).toThrow();
    s = act(s, 'p0', { type: 'power', target: 'p1' });
    expect(game.getPlayerView(s, 'p0').investigations).toEqual([{ target: 'p1', team: 'fascist' }]);
    for (const id of ['p1', 'p2', 'p3', 'p6'])
      expect(game.getPlayerView(s, id).investigations).toEqual([]);
    expect(JSON.stringify(game.getTableView(s))).not.toMatch(/"team"|secret/);
    // Hitler investigates as a Fascist; nobody can be investigated twice.
    s = { ...s, phase: 'power', pending: 'investigate', president: 'p4' };
    s = act(s, 'p4', { type: 'power', target: 'p0' });
    expect(game.getPlayerView(s, 'p4').investigations).toEqual([{ target: 'p0', team: 'fascist' }]);
    s = { ...s, phase: 'power', pending: 'investigate', president: 'p5' };
    expect(() => act(s, 'p5', { type: 'power', target: 'p1' })).toThrow(/already/);
  });

  it('9 and up: investigate at one; special election at three, then the rotation carries on', () => {
    expect(boardFor(9)[0]).toBe('investigate');
    let s = table(9, { deck: Array<Policy>(17).fill(F) });
    s = { ...s, fascist: 2 };
    s = govern(s, 'p4', F);
    expect(s.pending).toBe('special');
    s = act(s, 'p0', { type: 'power', target: 'p6' });
    expect(s.president).toBe('p6');
    s = act(s, 'p6', { type: 'nominate', chancellor: 'p7' });
    s = vote(s, s.players);
    // Back to the left of the president who called the special election.
    expect(s.president).toBe('p1');
  });

  it('execution removes a player from votes and nominations; executing Hitler wins', () => {
    let s = table(7, { deck: Array<Policy>(17).fill(F) });
    s = { ...s, fascist: 3 };
    s = govern(s, 'p3', F);
    expect(s.pending).toBe('execute');
    s = act(s, 'p0', { type: 'power', target: 'p5' });
    expect(s.dead).toEqual(['p5']);
    expect(eligibleChancellors(s)).not.toContain('p5');
    expect(() => act(s, 'p5', { type: 'vote', ja: true })).toThrow(/Executed/);
    expect(game.getTableView(s).roles).toBeNull();

    let shot = table(7, { deck: Array<Policy>(17).fill(F), president: 'p3' });
    shot = { ...shot, fascist: 3 };
    shot = govern(shot, 'p4', F);
    shot = act(shot, 'p3', { type: 'power', target: 'p0' });
    expect(shot.winner).toBe('liberal');
    expect(shot.reason).toBe('hitler-shot');
  });

  it('skips executed players in the rotation and counts only the living in votes', () => {
    let s = table(7);
    s = { ...s, dead: ['p1', 'p2'] };
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    // 5 alive: three Ja are enough.
    s = vote(s, ['p5', 'p6']);
    expect(s.phase).toBe('president');
    s = act(s, 'p0', { type: 'discard', policy: s.hand[0]! });
    s = act(s, 'p3', { type: 'enact', policy: s.hand[0]! });
    if (s.phase === 'nominate') expect(s.president).toBe('p3');
  });
});

describe('veto', () => {
  function atFive(): ShState {
    let s = table(7, { deck: [F, F, L, F, F, L, L, L, L, L, L, F, F, F, F, F, F] });
    s = { ...s, fascist: 5, liberal: 0 };
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    s = vote(s);
    return act(s, 'p0', { type: 'discard', policy: L });
  }

  it("isn't available before five Fascist policies", () => {
    let s = table(7);
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    s = vote(s);
    s = act(s, 'p0', { type: 'discard', policy: s.hand[0]! });
    expect(() => act(s, 'p3', { type: 'veto' })).toThrow(/five Fascist/);
  });

  it('an agreed veto throws both away and moves the election tracker', () => {
    let s = atFive();
    s = act(s, 'p3', { type: 'veto' });
    expect(s.phase).toBe('veto');
    s = act(s, 'p0', { type: 'vetoReply', accept: true });
    expect(s.fascist).toBe(5);
    expect(s.tracker).toBe(1);
    expect(s.phase).toBe('nominate');
    expect(s.governments[0]).toMatchObject({ vetoed: true });
    expect(game.getTableView(s).event).toEqual({ kind: 'veto', n: 1 });
  });

  it('a refused veto means the chancellor must enact, and can only ask once', () => {
    let s = atFive();
    s = act(s, 'p3', { type: 'veto' });
    s = act(s, 'p0', { type: 'vetoReply', accept: false });
    expect(s.phase).toBe('chancellor');
    expect(s.tracker).toBe(0);
    expect(() => act(s, 'p3', { type: 'veto' })).toThrow(/already refused/);
    s = act(s, 'p3', { type: 'enact', policy: F });
    expect(s.winner).toBe('fascist');
  });

  it('a third failure through veto top-decks the next policy', () => {
    let s = atFive();
    s = { ...s, tracker: 2 };
    s = act(s, 'p3', { type: 'veto' });
    s = act(s, 'p0', { type: 'vetoReply', accept: true });
    expect(s.tracker).toBe(0);
    expect(s.chaos).toHaveLength(1);
  });
});

describe('winning', () => {
  it('five Liberal policies win for the Liberals', () => {
    let s = table(5, { deck: Array<Policy>(17).fill(L) });
    s = { ...s, liberal: 4 };
    s = govern(s, 'p3', L);
    expect(s.winner).toBe('liberal');
    const result = game.getResult(s)!;
    expect(result.winners.sort()).toEqual(['p2', 'p3', 'p4']);
    expect(result.standings!.find((x) => x.playerId === 'p0')).toMatchObject({
      outcome: 'loss',
      team: 'Fascist',
      role: 'Hitler',
    });
    expect(game.getTableView(s).roles).toEqual(s.roles);
  });

  it('six Fascist policies win for the Fascists', () => {
    let s = table(5, { deck: Array<Policy>(17).fill(F) });
    s = { ...s, fascist: 5 };
    s = govern(s, 'p3', F);
    expect(s.winner).toBe('fascist');
    expect(game.getResult(s)!.winners.sort()).toEqual(['p0', 'p1']);
  });

  it('plays a whole random game to the end without leaking anything mid-game', () => {
    for (const n of [5, 8, 10, 12, 15]) {
      const local = createRng(n * 31);
      let s = game.setup({ playerIds: ids(n), options: defaultOptions(), rng: local, now: 0 });
      for (let step = 0; step < 400 && !s.winner; step++) {
        const view = game.getTableView(s);
        expect(view.roles).toBeNull();
        expect(JSON.stringify(view)).not.toMatch(
          /"hitler"|"(hand|ballots|drawn|secret|investigations|myRole|known|peek)":/,
        );
        for (const id of s.players) {
          const v = game.getPlayerView(s, id);
          if (v.hand.length)
            expect(
              (s.phase === 'president' && id === s.president) ||
                (s.phase !== 'president' && id === s.nominee),
            ).toBe(true);
        }
        const move = (a: ShAction, who: string) => game.applyAction(s, who, a, local, 0);
        switch (s.phase) {
          case 'nominate':
            s = move(
              { type: 'nominate', chancellor: local.pick(eligibleChancellors(s)) },
              s.president,
            );
            break;
          case 'vote':
            for (const id of s.players.filter((p) => !s.dead.includes(p)))
              s = move({ type: 'vote', ja: local.next() < 0.7 }, id);
            break;
          case 'president':
            s = move({ type: 'discard', policy: local.pick(s.hand) }, s.president);
            break;
          case 'chancellor':
            s = move({ type: 'enact', policy: local.pick(s.hand) }, s.nominee!);
            break;
          case 'veto':
            s = move({ type: 'vetoReply', accept: local.next() < 0.5 }, s.president);
            break;
          case 'power': {
            const others = s.players.filter(
              (p) =>
                p !== s.president &&
                !s.dead.includes(p) &&
                !s.investigations.some((x) => x.target === p),
            );
            s = move({ type: 'power', target: local.pick(others) }, s.president);
            break;
          }
          case 'post':
            s = move({ type: 'endTerm' }, s.president);
            break;
        }
      }
      expect(s.winner).not.toBeNull();
      const result = game.getResult(s)!;
      expect(result.standings).toHaveLength(n);
      expect(result.recap.length).toBeGreaterThan(0);
    }
  });
});
