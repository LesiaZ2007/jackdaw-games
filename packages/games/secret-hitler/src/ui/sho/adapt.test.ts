import { createRng } from '@jackdaw/engine';
import type { ScreenPlayer } from '@jackdaw/ui';
import { describe, expect, it } from 'vitest';
import { defaultOptions, type Role } from '../../lineup';
import { secretHitler as game, type ShAction, type ShState } from '../../rules';
import { finalGameState, namesFor, toGameState } from './adapt';
import { LobbyState } from './types';

const rng = createRng(3);
const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
const NAMES = ['Wren', 'Bran', 'Cerys', 'Dafydd', 'Elin'];
const CRESTS = ['helm', 'crown', 'swords', 'shield', 'tower'];
const players: ScreenPlayer[] = ids.map((id, i) => ({
  id,
  name: NAMES[i]!,
  avatar: { crest: CRESTS[i]!, tint: 'slate' },
  online: true,
}));

/** p0 Hitler, p1 Fascist, the rest Liberal; p0 presides first. */
function table(): ShState {
  const s = game.setup({ playerIds: ids, options: defaultOptions(), rng, now: 0 });
  const roles: Role[] = ['hitler', 'fascist', 'liberal', 'liberal', 'liberal'];
  return {
    ...s,
    roles: Object.fromEntries(ids.map((id, i) => [id, roles[i]!])),
    deck: ['fascist', 'liberal', 'fascist', ...s.deck],
    president: 'p0',
    rotation: 'p0',
  };
}
const act = (s: ShState, who: string, a: ShAction) => game.applyAction(s, who, a, rng, 0);
const seen = (s: ShState, id: string | null) =>
  toGameState(game.getTableView(s), id ? game.getPlayerView(s, id) : null, players);

describe('the game state for secret-hitler.online’s screens', () => {
  it('names players, and gives each the portrait for their crest', () => {
    const g = seen(table(), 'p2');
    expect(g.playerOrder).toEqual(NAMES);
    expect(g.icon).toMatchObject({ the owner: 'p1', Bran: 'p2', Elin: 'p5' });
    expect(namesFor(ids, players).idOf('Cerys')).toBe('p2');
  });

  it('shows a Liberal only their own role, and a TV nobody’s', () => {
    const s = table();
    const liberal = seen(s, 'p2');
    expect(liberal.players.Cerys!.id).toBe('LIBERAL');
    for (const n of ['Wren', 'Bran', 'Dafydd', 'Elin'])
      expect(liberal.players[n]!.id).toBeUndefined();
    const tv = seen(s, null);
    for (const n of NAMES) expect(tv.players[n]!.id).toBeUndefined();
    expect(JSON.stringify(tv)).not.toMatch(/HITLER|FASCIST"|LIBERAL"/);
  });

  it('shows a Fascist the team, and Hitler the Fascists at five players', () => {
    const s = table();
    const fascist = seen(s, 'p1');
    expect(fascist.players.the owner!.id).toBe('HITLER');
    expect(fascist.players.Cerys!.id).toBeUndefined();
    expect(seen(s, 'p0').players.Bran!.id).toBe('FASCIST');
  });

  it('keeps a vote secret until it’s counted, then shows it', () => {
    let s = act(table(), 'p0', { type: 'nominate', chancellor: 'p2' });
    s = act(s, 'p3', { type: 'vote', ja: true });
    const voting = seen(s, 'p4');
    expect(voting.state).toBe(LobbyState.CHANCELLOR_VOTING);
    expect(voting.chancellor).toBe('Cerys');
    expect(voting.userVotes).toEqual({ Dafydd: false });
    for (const id of ['p0', 'p1', 'p2', 'p4']) s = act(s, id, { type: 'vote', ja: id !== 'p1' });
    const counted = seen(s, 'p4');
    expect(counted.state).toBe(LobbyState.LEGISLATIVE_PRESIDENT);
    expect(counted.userVotes).toMatchObject({ Bran: false, Dafydd: true });
  });

  it('gives only the president and then the chancellor their cards', () => {
    let s = act(table(), 'p0', { type: 'nominate', chancellor: 'p2' });
    for (const id of ids) s = act(s, id, { type: 'vote', ja: true });
    expect(seen(s, 'p0').presidentChoices).toEqual(['FASCIST', 'LIBERAL', 'FASCIST']);
    expect(seen(s, 'p2').presidentChoices).toBeUndefined();
    s = act(s, 'p0', { type: 'discard', policy: 'fascist' });
    expect(seen(s, 'p2').chancellorChoices).toEqual(['LIBERAL', 'FASCIST']);
    expect(seen(s, 'p0').chancellorChoices).toBeUndefined();
    s = act(s, 'p2', { type: 'enact', policy: 'liberal' });
    const post = seen(s, 'p3');
    expect(post.state).toBe(LobbyState.POST_LEGISLATIVE);
    expect(post.lastState).toBe(LobbyState.LEGISLATIVE_CHANCELLOR);
    expect(post.lastPolicy).toBe('LIBERAL');
    expect(post.liberalPolicies).toBe(1);
  });

  it('marks a failed election, and the policy three of them put down', () => {
    let s = table();
    for (let round = 0; round < 3; round++) {
      s = act(s, s.president, {
        type: 'nominate',
        chancellor: ids.find((id) => id !== s.president && id !== 'p0')!,
      });
      for (const id of ids) s = act(s, id, { type: 'vote', ja: false });
      if (round < 2) {
        expect(seen(s, 'p3')).toMatchObject({
          electionTracker: round + 1,
          electionTrackerAdvanced: false,
        });
        s = act(s, s.president, { type: 'endTerm' });
      }
    }
    expect(seen(s, 'p3')).toMatchObject({
      state: LobbyState.POST_LEGISLATIVE,
      electionTracker: 0,
      electionTrackerAdvanced: true,
      lastPolicy: 'FASCIST',
    });
  });
});

describe('the end of the game', () => {
  it('reveals every role, with the vote that elected Hitler', () => {
    let s: ShState = { ...table(), fascist: 3, president: 'p2', rotation: 'p2' };
    s = act(s, 'p2', { type: 'nominate', chancellor: 'p0' });
    for (const id of ids) s = act(s, id, { type: 'vote', ja: true });
    const result = game.getResult(s)!;
    const g = finalGameState(result.reveal as never, players);
    expect(g.state).toBe(LobbyState.FASCIST_VICTORY_ELECTION);
    expect(g.players.the owner!.id).toBe('HITLER');
    expect(g.players.Cerys!.id).toBe('LIBERAL');
    expect(g.chancellor).toBe('Wren');
    expect(Object.values(g.userVotes)).toEqual([true, true, true, true, true]);
  });
});
