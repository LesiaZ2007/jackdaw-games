import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { defaultOptions, type Policy } from './lineup';
import { secretHitler as game, type ShAction, type ShState } from './rules';
import { busyPlayers, phaseBanner, statusText, tallyLine, yourMove } from './status';

const rng = createRng(3);
const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const name = (id: string) => id.toUpperCase();

function table(deck?: Policy[]): ShState {
  const s = game.setup({ playerIds: ids, options: defaultOptions(), rng, now: 0 });
  return { ...s, president: 'p0', rotation: 'p0', deck: deck ?? s.deck };
}
const act = (s: ShState, who: string, a: ShAction) => game.applyAction(s, who, a, rng, 0);
const tv = (s: ShState) => game.getTableView(s);

describe('who the game is waiting on', () => {
  it('is the president while nominating, then everyone who has not voted', () => {
    let s = table();
    expect(busyPlayers(tv(s))).toEqual(['p0']);
    expect(statusText(tv(s), name)).toBe(
      'Waiting for P0, the president, to nominate a chancellor.',
    );
    expect(statusText(tv(s), name, 'p0')).toBe(
      'Waiting for you, the president, to nominate a chancellor.',
    );
    expect(yourMove(tv(s), 'p0')).toBe('Nominate a chancellor');
    expect(yourMove(tv(s), 'p1')).toBeNull();

    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    expect(busyPlayers(tv(s))).toEqual(ids);
    s = act(s, 'p2', { type: 'vote', ja: false });
    s = act(s, 'p5', { type: 'vote', ja: true });
    // Who has voted is public; how they voted is not, and it never shows here.
    expect(busyPlayers(tv(s))).toEqual(['p0', 'p1', 'p3', 'p4', 'p6']);
    expect(yourMove(tv(s), 'p2')).toBeNull();
    expect(yourMove(tv(s), 'p1')).toBe('Vote Ja or Nein');
    expect(statusText(tv(s), name)).toBe('Waiting for 5 players to vote: P0, P1, P3, P4, P6.');
  });

  it('is the president, then the chancellor, through legislation; then nobody once it ends', () => {
    let s = table(Array<Policy>(17).fill('liberal'));
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    for (const id of ids) s = act(s, id, { type: 'vote', ja: id !== 'p6' });
    expect(busyPlayers(tv(s))).toEqual(['p0']);
    expect(tallyLine(tv(s))).toBe('Ja 6 – Nein 1: elected');
    expect(statusText(tv(s), name)).toMatch(/P0, the president, to choose a policy to discard/);
    s = act(s, 'p0', { type: 'discard', policy: 'liberal' });
    expect(busyPlayers(tv(s))).toEqual(['p3']);
    expect(yourMove(tv(s), 'p3')).toBe('Enact one policy');
    s = { ...s, liberal: 4 };
    s = act(s, 'p3', { type: 'enact', policy: 'liberal' });
    expect(busyPlayers(tv(s))).toEqual([]);
    expect(statusText(tv(s), name)).toMatch(/Liberals win/);
  });

  it('is the president using a power, and leaves out the executed', () => {
    let s = table(Array<Policy>(17).fill('fascist'));
    s = { ...s, fascist: 3 };
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    for (const id of ids) s = act(s, id, { type: 'vote', ja: true });
    s = act(s, 'p0', { type: 'discard', policy: 'fascist' });
    s = act(s, 'p3', { type: 'enact', policy: 'fascist' });
    expect(s.pending).toBe('execute');
    expect(busyPlayers(tv(s))).toEqual(['p0']);
    expect(yourMove(tv(s), 'p0')).toBe('Choose a player to execute');
    expect(statusText(tv(s), name)).toBe(
      'Execution: waiting for P0 to choose a player to execute.',
    );
    // Pick someone who isn't Hitler, so the game carries on.
    const target = ids.find((id) => id !== 'p0' && s.roles[id] !== 'hitler')!;
    s = act(s, 'p0', { type: 'power', target });
    s = act(s, s.president, { type: 'nominate', chancellor: tv(s).eligible[0]! });
    expect(busyPlayers(tv(s))).not.toContain(target);
    expect(yourMove(tv(s), target)).toBeNull();
  });
});

describe('the phase banner', () => {
  it('changes key once per phase, and stays put through a refused veto', () => {
    let s = table(Array<Policy>(17).fill('fascist'));
    const keys = [phaseBanner(tv(s))!.key];
    s = act(s, 'p0', { type: 'nominate', chancellor: 'p3' });
    keys.push(phaseBanner(tv(s))!.key);
    expect(phaseBanner(tv(s))!.title).toBe('Voting');
    for (const id of ids) s = act(s, id, { type: 'vote', ja: true });
    keys.push(phaseBanner(tv(s))!.key);
    expect(phaseBanner(tv(s))!.title).toBe('Legislative session');
    s = act(s, 'p0', { type: 'discard', policy: 'fascist' });
    expect(phaseBanner(tv(s))!.key).toBe(keys[2]);
    expect(new Set(keys).size).toBe(3);

    // A failed vote starts a new nomination with a new key.
    let f = table();
    const before = phaseBanner(tv(f))!.key;
    f = act(f, 'p0', { type: 'nominate', chancellor: 'p3' });
    for (const id of ids) f = act(f, id, { type: 'vote', ja: false });
    expect(phaseBanner(tv(f))!.title).toBe('Chancellor nomination');
    expect(phaseBanner(tv(f))!.key).not.toBe(before);
    expect(tallyLine(tv(f))).toBe('Ja 0 – Nein 7: voted down');
  });
});
