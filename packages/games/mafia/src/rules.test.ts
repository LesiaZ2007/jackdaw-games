import { createRng, GameError } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { autoKillers, castFor, type Role } from './roles';
import {
  mafia as game,
  nightAct,
  targetsFor,
  validateOptions,
  WITCH_MS,
  type MafiaAction,
  type MafiaOptions,
  type MafiaState,
} from './rules';

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
  'owl',
  'lark',
  'jay',
  'teal',
  'snipe',
  'tern',
];
const ids = (n: number) => birds.slice(0, n);

const NOW = 100_000;
const rng = () => createRng(11);

/** A table with a known deal: list[i] is the card of the i-th bird. */
function deal(list: Role[], o: Partial<MafiaOptions> = {}): MafiaState {
  const n = list.length;
  const options: MafiaOptions = { ...game.defaultOptions(n), ...o };
  const s = game.setup({ playerIds: ids(n), options, rng: createRng(5), now: NOW });
  const roles: Record<string, Role> = {};
  ids(n).forEach((id, i) => (roles[id] = list[i]!));
  return { ...s, roles, cast: list };
}

const act = (s: MafiaState, id: string, a: MafiaAction, at = NOW) =>
  game.applyAction(s, id, a, rng(), at);
const advance = (s: MafiaState) => game.onTimer!(s, game.nextTimer!(s)!.id, rng(), NOW + 1000);
const patch = (s: MafiaState, p: Partial<MafiaState>): MafiaState => ({ ...s, ...p });
const inVote = (s: MafiaState): MafiaState =>
  patch(s, {
    phase: 'vote',
    night: 1,
    day: 1,
    step: s.step + 1,
    since: NOW,
    deadline: NOW + 60_000,
    votes: {},
    ready: [],
  });
const inDay = (s: MafiaState): MafiaState =>
  patch(s, {
    phase: 'day',
    night: 1,
    day: 1,
    step: s.step + 1,
    since: NOW,
    deadline: NOW + 180_000,
    votes: {},
    ready: [],
  });
/** These players are already dead. */
const dead = (s: MafiaState, who: string[]): MafiaState =>
  patch(s, {
    alive: s.alive.filter((id) => !who.includes(id)),
    deaths: [...s.deaths, ...who.map((id) => ({ id, cause: 'night' as const, night: 1, day: 0 }))],
  });

function readyAll(s: MafiaState, snaps?: MafiaState[]) {
  for (const id of s.players) {
    s = act(s, id, { type: 'ready', on: true });
    snaps?.push(s);
  }
  return s;
}

/** Everyone alive picks. The pack and a few others pick as told, the rest take their first target. */
function runNight(
  s: MafiaState,
  packPicks: Record<string, string>,
  over: Record<string, string> = {},
  second = '',
  snaps?: MafiaState[],
) {
  for (const id of [...s.alive]) {
    if (s.phase !== 'night') break;
    const a = nightAct(s, id)!;
    const target = packPicks[id] ?? over[id] ?? targetsFor(s, id, a)[0]!;
    s = act(s, id, { type: 'pick', target, ...(a === 'love' ? { second } : {}) });
    snaps?.push(s);
  }
  return s;
}

function voteAll(s: MafiaState, votes: Record<string, string>, snaps?: MafiaState[]) {
  for (const id of [...s.alive]) {
    if (s.phase !== 'vote') break;
    s = act(s, id, { type: 'vote', target: votes[id] ?? 'skip' });
    snaps?.push(s);
  }
  return s;
}

/** Dawn to the next night with nobody voted out. */
function skipDay(s: MafiaState) {
  s = advance(s); // dawn -> day
  s = advance(s); // talk timer -> vote
  s = voteAll(s, {});
  return advance(s); // dusk -> night
}

const count = (list: Role[], r: Role) => list.filter((x) => x === r).length;

// wren, rook: Mafia. magpie: Angel. robin: Sheriff. finch, heron, swift: Civilians.
const R7: Role[] = ['mafia', 'mafia', 'angel', 'sheriff', 'civilian', 'civilian', 'civilian'];
// wren, rook: Mafia. magpie: Serial Killer. robin: Angel. finch: Sheriff. heron, swift, kite: Civilians.
const R8K: Role[] = [
  'mafia',
  'mafia',
  'killer',
  'angel',
  'sheriff',
  'civilian',
  'civilian',
  'civilian',
];
const werewolf: Partial<MafiaOptions> = { mode: 'Werewolf' };

describe('setup', () => {
  const sizes: [number, number][] = [
    [5, 1],
    [6, 1],
    [7, 2],
    [8, 2],
    [9, 2],
    [10, 3],
    [11, 3],
    [12, 3],
    [13, 4],
    [14, 4],
    [15, 4],
  ];
  for (const [n, k] of sizes) {
    it(`Auto deals ${k} Mafia to ${n} players`, () => {
      expect(autoKillers(n)).toBe(k);
      const s = game.setup({
        playerIds: ids(n),
        options: game.defaultOptions(n),
        rng: createRng(n),
        now: 0,
      });
      expect(s.cast).toHaveLength(n);
      expect(count(s.cast, 'mafia')).toBe(k);
      expect(count(s.cast, 'angel')).toBe(1);
      expect(count(s.cast, 'sheriff')).toBe(1);
      expect(count(s.cast, 'civilian')).toBe(n - k - 2);
      // Everyone gets one card, and the cards dealt are the cards in the cast.
      expect(Object.keys(s.roles).sort()).toEqual([...ids(n)].sort());
      expect(Object.values(s.roles).sort()).toEqual([...s.cast].sort());
    });
  }

  it('deals Werewolf cards in the Werewolf setting', () => {
    const s = game.setup({
      playerIds: ids(8),
      options: { ...game.defaultOptions(8), mode: 'Werewolf' },
      rng: createRng(2),
      now: 0,
    });
    expect(count(s.cast, 'wolf')).toBe(2);
    expect(count(s.cast, 'seer')).toBe(1);
    expect(count(s.cast, 'villager')).toBe(5);
    expect(count(s.cast, 'mafia')).toBe(0);
  });

  it('deals only the extras of the chosen setting', () => {
    const mafia = game.setup({
      playerIds: ids(10),
      options: {
        ...game.defaultOptions(10),
        extras: ['jester', 'mayor', 'killer', 'witch', 'hunter', 'cupid'],
      },
      rng: createRng(3),
      now: 0,
    });
    for (const r of ['jester', 'mayor', 'killer'] as Role[]) expect(count(mafia.cast, r)).toBe(1);
    for (const r of ['witch', 'hunter', 'cupid'] as Role[]) expect(count(mafia.cast, r)).toBe(0);

    const wolves = game.setup({
      playerIds: ids(10),
      options: {
        ...game.defaultOptions(10),
        mode: 'Werewolf',
        extras: ['witch', 'jester', 'mayor', 'killer'],
      },
      rng: createRng(3),
      now: 0,
    });
    expect(count(wolves.cast, 'witch')).toBe(1);
    for (const r of ['jester', 'mayor', 'killer', 'hunter', 'cupid'] as Role[])
      expect(count(wolves.cast, r)).toBe(0);
  });

  it('deals no extras unless the host picked them', () => {
    const s = game.setup({
      playerIds: ids(12),
      options: game.defaultOptions(12),
      rng: createRng(4),
      now: 0,
    });
    expect(s.cast.every((r) => ['mafia', 'angel', 'sheriff', 'civilian'].includes(r))).toBe(true);
  });

  it('castFor drops extras that do not fit', () => {
    const cast = castFor('Mafia', 5, 2, ['jester', 'mayor', 'killer']);
    expect(cast).toHaveLength(5);
    expect(count(cast, 'mafia')).toBe(2);
  });

  it('rejects too many killers', () => {
    const o = (killers: MafiaOptions['killers']): MafiaOptions => ({
      ...game.defaultOptions(7),
      killers,
    });
    expect(validateOptions(o('4'), 7)).toMatch(/too many/);
    expect(validateOptions(o('3'), 6)).toMatch(/too many/);
    expect(validateOptions(o('3'), 7)).toBeNull();
    expect(validateOptions(o('2'), 5)).toBeNull();
    expect(game.validateOptions!(o('4'), 7)).not.toBeNull();
    for (let n = 5; n <= 15; n++) expect(validateOptions(o('Auto'), n)).toBeNull();
  });

  it('never deals so many killers that they outnumber the table', () => {
    const s = game.setup({
      playerIds: ids(5),
      options: { ...game.defaultOptions(5), killers: '4' },
      rng: createRng(1),
      now: 0,
    });
    expect(count(s.cast, 'mafia')).toBeLessThan(3);
  });
});

describe('the deal', () => {
  it('starts in the deal phase with a timer', () => {
    const s = deal(R7);
    expect(s.phase).toBe('deal');
    expect(game.nextTimer!(s)).not.toBeNull();
    expect(game.waitingOn!(s)).toEqual(ids(7));
  });

  it('goes to night 1 when everyone has seen their card', () => {
    let s = deal(R7);
    for (const id of ids(6)) s = act(s, id, { type: 'ready', on: true });
    expect(s.phase).toBe('deal');
    expect(game.waitingOn!(s)).toEqual(['swift']);
    s = act(s, 'swift', { type: 'ready', on: true });
    expect(s.phase).toBe('night');
    expect(s.night).toBe(1);
    expect(s.ready).toEqual([]);
  });

  it('lets a player take their ready back', () => {
    let s = deal(R7);
    s = act(s, 'wren', { type: 'ready', on: true });
    s = act(s, 'wren', { type: 'ready', on: false });
    expect(s.ready).toEqual([]);
  });

  it('starts the night when the deal timer runs out', () => {
    const s = advance(deal(R7));
    expect(s.phase).toBe('night');
    expect(s.night).toBe(1);
  });

  it('ignores a timer from an earlier step', () => {
    const s = deal(R7);
    expect(game.onTimer!(s, 'deal:99', rng(), NOW)).toBe(s);
  });

  it('refuses a vote or a pick during the deal', () => {
    const s = deal(R7);
    expect(() => act(s, 'wren', { type: 'pick', target: 'finch' })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'vote', target: 'finch' })).toThrow(GameError);
  });
});

describe('the night', () => {
  const night = () => readyAll(deal(R7));

  it('does not end while the pack disagrees, and ends once they agree', () => {
    let s = runNight(
      night(),
      { wren: 'finch', rook: 'heron' },
      { magpie: 'magpie', robin: 'wren' },
    );
    expect(s.phase).toBe('night');
    expect(game.waitingOn!(s)).toEqual([]);
    s = act(s, 'rook', { type: 'pick', target: 'finch' });
    expect(s.phase).toBe('dawn');
    expect(s.alive).not.toContain('finch');
    expect(s.deaths).toEqual([{ id: 'finch', cause: 'night', night: 1, day: 0 }]);
    expect(s.dawn).toEqual(['finch']);
  });

  it('waits for everyone, not just the pack', () => {
    let s = night();
    s = act(s, 'wren', { type: 'pick', target: 'finch' });
    s = act(s, 'rook', { type: 'pick', target: 'finch' });
    expect(s.phase).toBe('night');
    expect(game.waitingOn!(s)).toEqual(['magpie', 'robin', 'finch', 'heron', 'swift']);
  });

  it('lets the pack change their pick until they agree', () => {
    let s = night();
    s = act(s, 'wren', { type: 'pick', target: 'finch' });
    s = act(s, 'wren', { type: 'pick', target: 'heron' });
    expect(s.picks.wren).toBe('heron');
  });

  it('does not let the pack target the pack', () => {
    const s = night();
    expect(() => act(s, 'wren', { type: 'pick', target: 'rook' })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'pick', target: 'wren' })).toThrow(GameError);
    expect(targetsFor(s, 'wren', 'kill')).toEqual(['magpie', 'robin', 'finch', 'heron', 'swift']);
  });

  it('refuses a pick from the dead and a pick of the dead', () => {
    const s = dead(night(), ['finch']);
    expect(() => act(s, 'finch', { type: 'pick', target: 'wren' })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'pick', target: 'finch' })).toThrow(GameError);
  });

  it('tells the Sheriff whether a target is Mafia', () => {
    let s = runNight(night(), { wren: 'heron', rook: 'heron' }, { robin: 'wren' });
    expect(s.checks.robin).toEqual([{ night: 1, target: 'wren', result: 'mafia' }]);
    expect(game.getPlayerView(s, 'robin').checks).toEqual(s.checks.robin);

    s = runNight(night(), { wren: 'heron', rook: 'heron' }, { robin: 'finch' });
    expect(s.checks.robin![0]!.result).toBe('clean');
  });

  it('shows the Serial Killer as clean to the Sheriff', () => {
    const s = runNight(
      readyAll(deal(R8K)),
      { wren: 'heron', rook: 'heron' },
      { finch: 'magpie', magpie: 'swift', robin: 'finch' },
    );
    expect(s.checks.finch).toEqual([{ night: 1, target: 'magpie', result: 'clean' }]);
  });

  it('shows the Seer the real role', () => {
    const list: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];
    let s = runNight(
      readyAll(deal(list, werewolf)),
      { wren: 'finch', rook: 'finch' },
      { magpie: 'wren' },
    );
    expect(s.checks.magpie).toEqual([{ night: 1, target: 'wren', result: 'wolf' }]);
    expect(game.getPlayerView(s, 'magpie').known.wren).toBe('wolf');

    s = runNight(
      readyAll(deal(list, werewolf)),
      { wren: 'finch', rook: 'finch' },
      { magpie: 'heron' },
    );
    expect(s.checks.magpie![0]!.result).toBe('villager');
  });

  it('does not let the Sheriff or the Seer change their pick', () => {
    let s = readyAll(deal(R7));
    s = act(s, 'robin', { type: 'pick', target: 'finch' });
    const again = act(s, 'robin', { type: 'pick', target: 'wren' });
    expect(again).toBe(s);
    expect(again.checks.robin).toHaveLength(1);
    expect(again.checks.robin![0]!.target).toBe('finch');

    const list: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];
    let w = readyAll(deal(list, werewolf));
    w = act(w, 'magpie', { type: 'pick', target: 'wren' });
    expect(act(w, 'magpie', { type: 'pick', target: 'finch' })).toBe(w);
    expect(w.checks.magpie).toHaveLength(1);
  });

  it('does not let the Angel change their pick', () => {
    let s = readyAll(deal(R7));
    s = act(s, 'magpie', { type: 'pick', target: 'finch' });
    expect(act(s, 'magpie', { type: 'pick', target: 'heron' })).toBe(s);
  });

  it('stops the Mafia kill when the Angel watches the victim', () => {
    const s = runNight(readyAll(deal(R7)), { wren: 'finch', rook: 'finch' }, { magpie: 'finch' });
    expect(s.phase).toBe('dawn');
    expect(s.alive).toContain('finch');
    expect(s.deaths).toEqual([]);
    expect(s.dawn).toEqual([]);
    expect(s.saves).toEqual(['magpie']);
  });

  it('stops the Serial Killer when the Angel watches their target', () => {
    // The killer goes after heron, the Mafia after swift; the Angel covers heron.
    const s = runNight(
      readyAll(deal(R8K)),
      { wren: 'swift', rook: 'swift' },
      { magpie: 'heron', robin: 'heron' },
    );
    expect(s.alive).toContain('heron');
    expect(s.deaths.map((d) => d.id)).toEqual(['swift']);
  });

  it('lets the Serial Killer kill alongside the Mafia', () => {
    const s = runNight(
      readyAll(deal(R8K)),
      { wren: 'swift', rook: 'swift' },
      { magpie: 'heron', robin: 'robin' },
    );
    expect(s.deaths.map((d) => d.id).sort()).toEqual(['heron', 'swift']);
  });

  it('lets the Angel save themself', () => {
    const s = runNight(
      readyAll(deal(R7)),
      { wren: 'magpie', rook: 'magpie' },
      { magpie: 'magpie' },
    );
    expect(s.alive).toContain('magpie');
    expect(s.deaths).toEqual([]);
  });

  it('resolves the night timer with the most-picked target', () => {
    const list: Role[] = [
      'mafia',
      'mafia',
      'mafia',
      'angel',
      'sheriff',
      'civilian',
      'civilian',
      'civilian',
      'civilian',
      'civilian',
    ];
    let s = readyAll(deal(list));
    s = act(s, 'wren', { type: 'pick', target: 'heron' });
    s = act(s, 'rook', { type: 'pick', target: 'heron' });
    s = act(s, 'magpie', { type: 'pick', target: 'swift' });
    expect(s.phase).toBe('night');
    expect(game.nextTimer!(s)!.id).toBe(`night:${s.step}`);
    s = advance(s);
    expect(s.phase).toBe('dawn');
    expect(s.deaths.map((d) => d.id)).toEqual(['heron']);
  });

  it('draws a tied night timer from the tied targets', () => {
    let s = readyAll(deal(R7));
    s = act(s, 'wren', { type: 'pick', target: 'finch' });
    s = act(s, 'rook', { type: 'pick', target: 'heron' });
    s = advance(s);
    expect(['finch', 'heron']).toContain(s.deaths[0]!.id);
    expect(s.deaths).toHaveLength(1);
  });

  it('kills nobody if the pack never picked', () => {
    const s = advance(readyAll(deal(R7)));
    expect(s.phase).toBe('dawn');
    expect(s.deaths).toEqual([]);
  });

  it('goes from the morning to the day', () => {
    let s = runNight(readyAll(deal(R7)), { wren: 'finch', rook: 'finch' });
    s = advance(s);
    expect(s.phase).toBe('day');
    expect(s.day).toBe(1);
  });
});

describe('Werewolf extras', () => {
  // wren, rook: wolves. magpie: Seer. robin: Witch. finch, heron: Villagers.
  const W6: Role[] = ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'];
  const toWitch = (s = readyAll(deal(W6, werewolf))) =>
    runNight(s, { wren: 'finch', rook: 'finch' });

  it('gives the Witch her turn after the night, with the victim shown only to her', () => {
    const s = toWitch();
    expect(s.phase).toBe('witch');
    expect(s.deaths).toEqual([]);
    expect(s.victim).toBe('finch');
    const witch = game.getPlayerView(s, 'robin');
    expect(witch.witch).toEqual({ victim: 'finch', heal: true, poison: true });
    expect(witch.prompt?.act).toBe('potion');
    expect(game.getPlayerView(s, 'heron').witch).toBeNull();
    expect(game.getPlayerView(s, 'heron').prompt).toBeNull();
    expect(game.waitingOn!(s)).toEqual(['robin']);
  });

  it('saves the victim with the heal potion, and the potion is used up', () => {
    let s = act(toWitch(), 'robin', { type: 'potion', heal: true, poison: null });
    expect(s.phase).toBe('dawn');
    expect(s.alive).toContain('finch');
    expect(s.deaths).toEqual([]);
    expect(s.potions).toEqual({ heal: false, poison: true });
    expect(s.saves).toEqual(['robin']);

    s = skipDay(s);
    expect(s.phase).toBe('night');
    s = runNight(s, { wren: 'finch', rook: 'finch' });
    expect(s.phase).toBe('witch');
    expect(game.getPlayerView(s, 'robin').witch).toEqual({
      victim: 'finch',
      heal: false,
      poison: true,
    });
    expect(() => act(s, 'robin', { type: 'potion', heal: true, poison: null })).toThrow(GameError);
  });

  it('kills with the poison potion', () => {
    const s = act(toWitch(), 'robin', { type: 'potion', heal: false, poison: 'heron' });
    expect(s.phase).toBe('dawn');
    expect(s.deaths.map((d) => d.id).sort()).toEqual(['finch', 'heron']);
    expect(s.potions).toEqual({ heal: true, poison: false });
  });

  it('lets the Witch heal and poison on the same night', () => {
    const s = act(toWitch(), 'robin', { type: 'potion', heal: true, poison: 'heron' });
    expect(s.deaths.map((d) => d.id)).toEqual(['heron']);
    expect(s.potions).toEqual({ heal: false, poison: false });
  });

  it('refuses a potion from anyone else, or a poison for the dead', () => {
    const s = toWitch();
    expect(() => act(s, 'heron', { type: 'potion', heal: true, poison: null })).toThrow(GameError);
    expect(() => act(s, 'robin', { type: 'potion', heal: false, poison: 'ghost' })).toThrow(
      GameError,
    );
  });

  it('moves on without a potion when the witch timer runs out', () => {
    const s = advance(toWitch());
    expect(s.phase).toBe('dawn');
    expect(s.deaths.map((d) => d.id)).toEqual(['finch']);
    expect(s.potions).toEqual({ heal: true, poison: true });
  });

  it('holds a short fake wait when the Witch is dead, with no prompt', () => {
    const start = advance(dead(deal(W6, werewolf), ['robin']));
    expect(start.phase).toBe('night');
    const s = runNight(start, { wren: 'finch', rook: 'finch' });
    expect(s.phase).toBe('witch');
    // Every screen shows the usual clock; the turn quietly ends a few seconds in.
    expect(s.deadline! - s.since).toBe(WITCH_MS);
    expect(game.getTableView(s)).not.toHaveProperty('wakeAt');
    const wait = game.nextTimer!(s)!.at - s.since;
    expect(wait).toBeGreaterThanOrEqual(4_000);
    expect(wait).toBeLessThan(9_000);
    const v = game.getPlayerView(s, 'robin');
    expect(v.prompt).toBeNull();
    expect(v.witch).toBeNull();
    expect(game.waitingOn!(s)).toEqual([]);
    expect(() => act(s, 'robin', { type: 'potion', heal: true, poison: null })).toThrow(GameError);
    const after = advance(s);
    expect(after.phase).toBe('dawn');
    expect(after.deaths.map((d) => d.id)).toEqual(['robin', 'finch']);
  });

  it('has no Witch phase when no witch was dealt', () => {
    const list: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];
    const s = runNight(readyAll(deal(list, werewolf)), { wren: 'finch', rook: 'finch' });
    expect(s.phase).toBe('dawn');
  });

  describe('Cupid', () => {
    // wren, rook: wolves. magpie: Cupid. robin, finch, heron: Villagers. swift: Seer.
    const CW: Role[] = ['wolf', 'wolf', 'cupid', 'villager', 'villager', 'villager', 'seer'];

    it('binds the lovers on night 1 and keeps them private', () => {
      const s = runNight(
        readyAll(deal(CW, werewolf)),
        { wren: 'heron', rook: 'heron' },
        { magpie: 'wren' },
        'finch',
      );
      expect(s.lovers).toEqual(['wren', 'finch']);
      expect(game.getPlayerView(s, 'finch').lover).toBe('wren');
      expect(game.getPlayerView(s, 'wren').lover).toBe('finch');
      expect(game.getPlayerView(s, 'robin').lover).toBeNull();
      expect(game.getTableView(s).lovers).toBeNull();
    });

    it('needs two different lovers before the night can end', () => {
      const s = readyAll(deal(CW, werewolf));
      expect(() => act(s, 'magpie', { type: 'pick', target: 'wren' })).toThrow(GameError);
      expect(() => act(s, 'magpie', { type: 'pick', target: 'wren', second: 'wren' })).toThrow(
        GameError,
      );
    });

    it('takes the other lover with them (grief)', () => {
      const s = runNight(
        readyAll(deal(CW, werewolf)),
        { wren: 'finch', rook: 'finch' },
        { magpie: 'wren' },
        'finch',
      );
      expect(s.phase).toBe('dawn');
      expect(s.deaths).toEqual([
        { id: 'finch', cause: 'night', night: 1, day: 0 },
        { id: 'wren', cause: 'grief', night: 1, day: 0 },
      ]);
      expect(s.alive.sort()).toEqual(['heron', 'magpie', 'robin', 'rook', 'swift']);
      expect(game.getTableView(s).lovers).toEqual(['wren', 'finch']);
    });

    it('takes a lover who is voted out together with the other', () => {
      let s = inVote(patch(deal(CW, werewolf), { lovers: ['robin', 'finch'] }));
      s = voteAll(s, {
        wren: 'robin',
        rook: 'robin',
        magpie: 'robin',
        finch: 'wren',
        heron: 'robin',
      });
      expect(s.phase).toBe('dusk');
      expect(s.lastVote!.out).toBe('robin');
      expect(s.deaths.map((d) => [d.id, d.cause])).toEqual([
        ['robin', 'vote'],
        ['finch', 'grief'],
      ]);
    });

    it('lets mixed lovers win when they are the last two', () => {
      let s = patch(deal(CW, werewolf), {
        alive: ['wren', 'finch', 'heron'],
        lovers: ['wren', 'finch'],
      });
      s = inVote(s);
      s = voteAll(s, { wren: 'heron', finch: 'heron', heron: 'wren' });
      expect(s.lastVote!.out).toBe('heron');
      s = advance(s);
      expect(s.phase).toBe('over');
      expect(s.win!.team).toBe('lovers');
      const r = game.getResult(s)!;
      expect(r.winners.sort()).toEqual(['finch', 'wren']);
      const standing = (id: string) => r.standings!.find((x) => x.playerId === id)!;
      expect(standing('wren')).toMatchObject({ team: 'Lovers', role: 'Werewolf', outcome: 'win' });
      expect(standing('finch')).toMatchObject({ team: 'Lovers', role: 'Villager', outcome: 'win' });
      expect(standing('rook').outcome).toBe('loss');
    });
  });

  describe('Hunter', () => {
    // wren, rook: wolves. magpie: Seer. robin: Hunter. finch, heron: Villagers.
    const HW: Role[] = ['wolf', 'wolf', 'seer', 'hunter', 'villager', 'villager'];

    it('shoots when killed in the night', () => {
      let s = runNight(readyAll(deal(HW, werewolf)), { wren: 'robin', rook: 'robin' });
      expect(s.phase).toBe('dawn');
      expect(s.alive).not.toContain('robin');
      s = advance(s);
      expect(s.phase).toBe('hunter');
      expect(game.getTableView(s).hunter).toBe('robin');
      expect(game.waitingOn!(s)).toEqual(['robin']);
      expect(game.getPlayerView(s, 'robin').prompt?.act).toBe('shoot');
      s = act(s, 'robin', { type: 'shoot', target: 'wren' });
      expect(s.alive).not.toContain('wren');
      expect(s.deaths.at(-1)).toMatchObject({ id: 'wren', cause: 'shot' });
      expect(s.phase).toBe('day');
    });

    it('shoots when voted out', () => {
      let s = inVote(deal(HW, werewolf));
      s = voteAll(s, {
        wren: 'robin',
        rook: 'robin',
        magpie: 'robin',
        finch: 'robin',
        heron: 'robin',
      });
      expect(s.phase).toBe('dusk');
      expect(s.alive).not.toContain('robin');
      s = advance(s);
      expect(s.phase).toBe('hunter');
      s = act(s, 'robin', { type: 'shoot', target: 'rook' });
      expect(s.deaths.map((d) => [d.id, d.cause])).toEqual([
        ['robin', 'vote'],
        ['rook', 'shot'],
      ]);
      expect(s.phase).toBe('night');
      expect(s.night).toBe(2);
    });

    it('only lets the Hunter shoot, and only the living', () => {
      const s = advance(runNight(readyAll(deal(HW, werewolf)), { wren: 'robin', rook: 'robin' }));
      expect(() => act(s, 'wren', { type: 'shoot', target: 'finch' })).toThrow(GameError);
      expect(() => act(s, 'robin', { type: 'shoot', target: 'robin' })).toThrow(GameError);
    });

    it('shoots nobody when the Hunter timer runs out', () => {
      let s = advance(runNight(readyAll(deal(HW, werewolf)), { wren: 'robin', rook: 'robin' }));
      expect(s.phase).toBe('hunter');
      s = advance(s);
      expect(s.phase).toBe('day');
      expect(s.deaths.map((d) => d.id)).toEqual(['robin']);
      expect(s.alive).toHaveLength(5);
    });

    it('lets the Hunter choose nobody', () => {
      let s = advance(runNight(readyAll(deal(HW, werewolf)), { wren: 'robin', rook: 'robin' }));
      s = act(s, 'robin', { type: 'shoot', target: null });
      expect(s.phase).toBe('day');
      expect(s.deaths).toHaveLength(1);
    });
  });
});

describe('the day and the vote', () => {
  it('starts the vote when most of the table is ready', () => {
    let s = inDay(deal(R7));
    expect(game.getTableView(s).readyNeed).toBe(4);
    for (const id of ['wren', 'rook', 'magpie']) s = act(s, id, { type: 'ready', on: true });
    expect(s.phase).toBe('day');
    s = act(s, 'robin', { type: 'ready', on: true });
    expect(s.phase).toBe('vote');
  });

  it('only counts the living as ready', () => {
    const s = dead(inDay(deal(R7)), ['finch']);
    expect(() => act(s, 'finch', { type: 'ready', on: true })).toThrow(GameError);
    expect(game.getTableView(s).readyNeed).toBe(4);
  });

  it('starts the vote when the talk timer runs out', () => {
    const s = advance(inDay(deal(R7)));
    expect(s.phase).toBe('vote');
  });

  it('has no talk timer when talk time is off', () => {
    const s = patch(inDay(deal(R7)), { talkMs: 0, deadline: null });
    expect(game.nextTimer!(s)).toBeNull();
  });

  it('counts the Mayor’s vote twice', () => {
    const M7: Role[] = ['mayor', 'mafia', 'mafia', 'angel', 'sheriff', 'civilian', 'civilian'];
    let s = inVote(deal(M7));
    s = voteAll(s, {
      wren: 'rook',
      rook: 'skip',
      magpie: 'robin',
      robin: 'finch',
      finch: 'heron',
      heron: 'swift',
      swift: 'wren',
    });
    expect(s.lastVote!.counts.rook).toBe(2);
    expect(s.lastVote!.double).toEqual(['wren']);
    expect(s.lastVote!.out).toBe('rook');
    expect(s.alive).not.toContain('rook');
  });

  it('puts nobody out on a tie', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, {
      wren: 'finch',
      rook: 'finch',
      magpie: 'heron',
      robin: 'heron',
      finch: 'robin',
      heron: 'swift',
      swift: 'wren',
    });
    expect(s.phase).toBe('dusk');
    expect(s.lastVote!.out).toBeNull();
    expect(s.alive).toHaveLength(7);
  });

  it('puts nobody out when skipping got as many votes as the top', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, {
      wren: 'finch',
      rook: 'finch',
      magpie: 'skip',
      robin: 'skip',
      finch: 'heron',
      heron: 'swift',
      swift: 'wren',
    });
    expect(s.lastVote!.counts).toMatchObject({ finch: 2, skip: 2 });
    expect(s.lastVote!.out).toBeNull();
  });

  it('puts nobody out when skipping beat the top', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, { wren: 'finch', rook: 'finch' });
    expect(s.lastVote!.counts.skip).toBe(5);
    expect(s.lastVote!.out).toBeNull();
  });

  it('puts the top vote out when skipping got fewer', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, { wren: 'finch', rook: 'finch', magpie: 'finch', robin: 'finch' });
    expect(s.lastVote!.out).toBe('finch');
    expect(s.deaths[0]).toMatchObject({ id: 'finch', cause: 'vote' });
  });

  it('refuses a vote for yourself, the dead, or a stranger', () => {
    const s = dead(inVote(deal(R7)), ['heron']);
    expect(() => act(s, 'wren', { type: 'vote', target: 'wren' })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'vote', target: 'heron' })).toThrow(GameError);
    expect(() => act(s, 'wren', { type: 'vote', target: 'nobody' })).toThrow(GameError);
    expect(() => act(s, 'heron', { type: 'vote', target: 'wren' })).toThrow(GameError);
    expect(() => act(s, 'stranger', { type: 'vote', target: 'wren' })).toThrow(GameError);
    expect(act(s, 'wren', { type: 'vote', target: 'skip' }).votes.wren).toBe('skip');
  });

  it('refuses a vote outside the vote', () => {
    expect(() => act(inDay(deal(R7)), 'wren', { type: 'vote', target: 'finch' })).toThrow(
      GameError,
    );
  });

  it('lets a voter change their vote until the last vote is in', () => {
    let s = inVote(deal(R7));
    s = act(s, 'wren', { type: 'vote', target: 'finch' });
    s = act(s, 'wren', { type: 'vote', target: 'heron' });
    expect(s.votes.wren).toBe('heron');
  });

  it('goes to dusk when every vote is in, then to the next night', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, { wren: 'finch' });
    expect(s.phase).toBe('dusk');
    expect(s.lastVote!.day).toBe(1);
    s = advance(s);
    expect(s.phase).toBe('night');
    expect(s.night).toBe(2);
  });

  it('counts the votes when the vote timer runs out', () => {
    let s = inVote(deal(R7));
    s = act(s, 'wren', { type: 'vote', target: 'finch' });
    s = act(s, 'rook', { type: 'vote', target: 'finch' });
    s = advance(s);
    expect(s.phase).toBe('dusk');
    expect(s.lastVote!.out).toBe('finch');
  });

  it('refuses actions after the game is over', () => {
    const s = patch(deal(R7), { phase: 'over', win: { team: 'town', line: '' } });
    expect(() => act(s, 'wren', { type: 'ready', on: true })).toThrow(GameError);
    expect(game.nextTimer!(s)).toBeNull();
  });

  it('makes the Jester the only winner when voted out', () => {
    const J7: Role[] = ['jester', 'mafia', 'mafia', 'angel', 'sheriff', 'civilian', 'civilian'];
    let s = inVote(deal(J7));
    s = voteAll(s, {
      rook: 'wren',
      magpie: 'wren',
      robin: 'wren',
      finch: 'wren',
      heron: 'wren',
      swift: 'wren',
    });
    expect(s.win!.team).toBe('jester');
    expect(game.getResult(s)).toBeNull();
    s = advance(s);
    expect(s.phase).toBe('over');
    const r = game.getResult(s)!;
    expect(r.winners).toEqual(['wren']);
    expect(r.standings!.find((x) => x.playerId === 'wren')).toMatchObject({
      team: 'Jester',
      role: 'Jester',
      outcome: 'win',
    });
    expect(r.standings!.filter((x) => x.outcome === 'loss')).toHaveLength(6);
  });
});

describe('winning', () => {
  it('has the town win when no pack is left', () => {
    let s = inVote(dead(deal(R7), ['rook']));
    s = voteAll(s, { magpie: 'wren', robin: 'wren', finch: 'wren', heron: 'wren', swift: 'wren' });
    expect(s.lastVote!.out).toBe('wren');
    s = advance(s);
    expect(s.phase).toBe('over');
    expect(s.win!.team).toBe('town');
    const r = game.getResult(s)!;
    expect(r.winners.sort()).toEqual(['finch', 'heron', 'magpie', 'robin', 'swift']);
    const standing = (id: string) => r.standings!.find((x) => x.playerId === id)!;
    expect(standing('wren')).toMatchObject({ team: 'Mafia', role: 'Mafia', outcome: 'loss' });
    expect(standing('rook')).toMatchObject({ team: 'Mafia', role: 'Mafia', outcome: 'loss' });
    expect(standing('magpie')).toMatchObject({ team: 'Town', role: 'Angel', outcome: 'win' });
    expect(standing('robin')).toMatchObject({ team: 'Town', role: 'Sheriff', outcome: 'win' });
    expect(standing('finch')).toMatchObject({ team: 'Town', role: 'Civilian', outcome: 'win' });
    expect(r.standings).toHaveLength(7);
    expect(r.summary).toMatch(/Mafia/);
  });

  it('has the town win by catching the last wolf, with Werewolf labels', () => {
    const list: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];
    let s = inVote(dead(deal(list, werewolf), ['rook']));
    s = voteAll(s, { magpie: 'wren', robin: 'wren', finch: 'wren', heron: 'wren' });
    s = advance(s);
    const r = game.getResult(s)!;
    expect(r.standings!.find((x) => x.playerId === 'wren')).toMatchObject({
      team: 'Werewolves',
      role: 'Werewolf',
    });
    expect(r.standings!.find((x) => x.playerId === 'magpie')).toMatchObject({
      team: 'Village',
      role: 'Seer',
    });
  });

  it('does not end the game while the pack is outnumbered', () => {
    let s = inVote(deal(R7));
    s = voteAll(s, { wren: 'finch', rook: 'finch', magpie: 'finch', robin: 'finch' });
    expect(s.alive).not.toContain('finch');
    s = advance(s);
    expect(s.phase).toBe('night');
  });

  it('has the pack win at parity', () => {
    // 2 Mafia and 3 others; one of the others is voted out, leaving 2 against 2.
    let s = inVote(dead(deal(R7), ['robin', 'heron']));
    s = voteAll(s, { wren: 'finch', rook: 'finch', magpie: 'finch', swift: 'finch' });
    expect(s.alive).toHaveLength(4);
    s = advance(s);
    expect(s.phase).toBe('over');
    expect(s.win!.team).toBe('pack');
    const r = game.getResult(s)!;
    expect(r.winners.sort()).toEqual(['rook', 'wren']);
    expect(r.standings!.find((x) => x.playerId === 'wren')).toMatchObject({
      team: 'Mafia',
      outcome: 'win',
    });
    expect(r.standings!.find((x) => x.playerId === 'finch')).toMatchObject({
      team: 'Town',
      outcome: 'loss',
    });
  });

  it('has the pack win when a night kill brings them level', () => {
    let s = dead(deal(R7), ['robin', 'heron']);
    s = advance(s); // deal timer: night 1
    s = runNight(s, { wren: 'finch', rook: 'finch' });
    s = advance(s); // dawn
    expect(s.phase).toBe('over');
    expect(s.win!.team).toBe('pack');
  });

  it('has the Serial Killer win as the last one standing', () => {
    let s = inVote(dead(deal(R8K), ['wren', 'rook', 'heron', 'swift', 'kite']));
    expect(s.alive).toEqual(['magpie', 'robin', 'finch']);
    s = voteAll(s, { magpie: 'robin', finch: 'robin' });
    s = advance(s);
    expect(s.phase).toBe('over');
    expect(s.win!.team).toBe('killer');
    const r = game.getResult(s)!;
    expect(r.winners).toEqual(['magpie']);
    expect(r.standings!.find((x) => x.playerId === 'magpie')).toMatchObject({
      team: 'Serial Killer',
      role: 'Serial Killer',
      outcome: 'win',
    });
  });

  it('does not give the town the win while the Serial Killer lives', () => {
    let s = inVote(dead(deal(R8K), ['wren', 'rook', 'swift']));
    s = voteAll(s, { magpie: 'kite', robin: 'kite', finch: 'kite', heron: 'kite' });
    expect(s.lastVote!.out).toBe('kite');
    s = advance(s);
    expect(s.phase).toBe('night');
  });

  it('does not give the pack the win while the Serial Killer lives', () => {
    let s = inVote(dead(deal(R8K), ['robin', 'finch', 'heron']));
    // wren, rook, magpie (killer), swift, kite alive: swift voted out leaves 2 Mafia, 2 others.
    s = voteAll(s, { wren: 'swift', rook: 'swift', magpie: 'swift' });
    s = advance(s);
    expect(s.phase).toBe('night');
  });

  it('draws for everyone when nobody is left', () => {
    const s = patch(deal(R7), { alive: [], phase: 'over', win: { team: 'town', line: 'x' } });
    const r = game.getResult(s)!;
    expect(r.winners).toEqual([]);
    expect(r.standings!.every((x) => x.outcome === 'draw')).toBe(true);
  });

  it('gives no result before the game is over', () => {
    expect(game.getResult(deal(R7))).toBeNull();
  });
});

describe('partial results', () => {
  it('is null before anyone has died', () => {
    expect(game.partialResult!(deal(R7))).toBeNull();
    expect(game.partialResult!(readyAll(deal(R7)))).toBeNull();
  });

  it('is a result once someone has died', () => {
    const s = runNight(readyAll(deal(R7)), { wren: 'finch', rook: 'finch' });
    const r = game.partialResult!(s)!;
    expect(r).not.toBeNull();
    expect(r.summary).toMatch(/^Ended early/);
    expect(r.standings).toHaveLength(7);
    // The Mafia lost nobody and the town lost one: the Mafia are ahead.
    expect(r.winners.sort()).toEqual(['rook', 'wren']);
  });

  it('favours the town when the Mafia have lost more', () => {
    const r = game.partialResult!(dead(deal(R7), ['rook']))!;
    expect(r.winners.sort()).toEqual(['finch', 'heron', 'magpie', 'robin', 'swift']);
  });

  it('is a draw when both sides have lost the same share', () => {
    const list: Role[] = ['mafia', 'mafia', 'angel', 'sheriff', 'civilian', 'civilian'];
    const r = game.partialResult!(dead(deal(list), ['rook', 'finch', 'heron']))!;
    expect(r.winners).toEqual([]);
    expect(r.standings!.every((x) => x.outcome === 'draw')).toBe(true);
  });

  it('is null once the game is over (the real result stands)', () => {
    const s = patch(dead(deal(R7), ['rook']), { phase: 'over', win: { team: 'town', line: 'x' } });
    expect(game.partialResult!(s)).toBeNull();
  });
});

describe('hidden information', () => {
  // The only things a table screen may carry.
  const TABLE_KEYS = [
    'alive',
    'cast',
    'dawn',
    'day',
    'deadline',
    'deaths',
    'hunter',
    'lastVote',
    'lovers',
    'mode',
    'night',
    'nightDone',
    'phase',
    'players',
    'readyNeed',
    'ready',
    'revealRoles',
    'since',
    'step',
    'talkTimed',
    'voted',
    'win',
  ].sort();

  /** Swaps two players' roles, night picks and checks (and the votes, when both have voted). */
  function swapLiving(s: MafiaState, a: string, b: string): MafiaState {
    const keys = <T>(m: Record<string, T>): Record<string, T> => {
      const o = { ...m };
      if (a in m && b in m) [o[a], o[b]] = [m[b]!, m[a]!];
      else if (a in m) {
        o[b] = m[a]!;
        delete o[a];
      } else if (b in m) {
        o[a] = m[b]!;
        delete o[b];
      }
      return o;
    };
    const votes = { ...s.votes };
    if (a in votes && b in votes) [votes[a], votes[b]] = [s.votes[b]!, s.votes[a]!];
    return {
      ...s,
      roles: keys(s.roles),
      picks: keys(s.picks),
      checks: keys(s.checks),
      votes,
    };
  }

  function mafiaScript(o: Partial<MafiaOptions>) {
    const snaps: MafiaState[] = [];
    let s = deal(R7, o);
    snaps.push(s);
    s = readyAll(s, snaps);
    s = runNight(
      s,
      { wren: 'finch', rook: 'heron' },
      { magpie: 'magpie', robin: 'wren' },
      '',
      snaps,
    );
    expect(s.phase).toBe('night');
    s = act(s, 'rook', { type: 'pick', target: 'finch' });
    snaps.push(s);
    s = advance(s);
    snaps.push(s); // day
    for (const id of ['wren', 'rook', 'magpie', 'robin']) {
      s = act(s, id, { type: 'ready', on: true });
      snaps.push(s);
    }
    expect(s.phase).toBe('vote');
    s = voteAll(
      s,
      { wren: 'robin', rook: 'robin', magpie: 'wren', robin: 'wren', heron: 'wren' },
      snaps,
    );
    s = advance(s);
    snaps.push(s); // night 2
    return snaps;
  }

  function werewolfScript() {
    const list: Role[] = [
      'wolf',
      'wolf',
      'seer',
      'witch',
      'hunter',
      'cupid',
      'villager',
      'villager',
    ];
    const snaps: MafiaState[] = [];
    let s = deal(list, { mode: 'Werewolf', reveal: 'Hidden' });
    snaps.push(s);
    s = readyAll(s, snaps);
    s = runNight(
      s,
      { wren: 'swift', rook: 'swift' },
      { magpie: 'wren', heron: 'kite' },
      'swift',
      snaps,
    );
    expect(s.phase).toBe('witch');
    s = act(s, 'robin', { type: 'potion', heal: true, poison: null });
    snaps.push(s);
    s = advance(s);
    snaps.push(s);
    for (const id of ['wren', 'rook', 'magpie', 'robin', 'finch']) {
      s = act(s, id, { type: 'ready', on: true });
      snaps.push(s);
    }
    s = voteAll(
      s,
      {
        wren: 'finch',
        rook: 'finch',
        magpie: 'finch',
        robin: 'finch',
        heron: 'finch',
        swift: 'finch',
        kite: 'finch',
      },
      snaps,
    );
    s = advance(s);
    snaps.push(s); // hunter
    expect(s.phase).toBe('hunter');
    s = act(s, 'finch', { type: 'shoot', target: 'wren' });
    snaps.push(s);
    return snaps;
  }

  const living = (s: MafiaState, not = '') => s.alive.filter((x) => x !== not);

  for (const [label, snaps] of [
    ['Mafia', () => mafiaScript({ reveal: 'Hidden' })],
    ['Werewolf', werewolfScript],
  ] as const) {
    it(`the table view carries only public fields at every step (${label})`, () => {
      const all = snaps();
      expect(all.length).toBeGreaterThan(15);
      for (const s of all) {
        const t = game.getTableView(s);
        expect(Object.keys(t).sort()).toEqual(TABLE_KEYS);
        if (s.phase !== 'over') for (const d of t.deaths) expect(d.role).toBeNull();
        expect(
          Object.keys(t.deaths.at(0) ?? { id: 1, cause: 1, night: 1, day: 1, role: 1 }).sort(),
        ).toEqual(['cause', 'day', 'id', 'night', 'role']);
      }
    });

    it(`the table view does not change if living players swap roles and picks (${label})`, () => {
      for (const s of snaps()) {
        const before = game.getTableView(s);
        const alive = living(s);
        for (let i = 0; i < alive.length; i++)
          for (let j = i + 1; j < alive.length; j++)
            expect(game.getTableView(swapLiving(s, alive[i]!, alive[j]!))).toEqual(before);
      }
    });

    it(`the table view ignores the night's victim, the potions and the checks (${label})`, () => {
      for (const s of snaps()) {
        const other = patch(s, {
          victim: s.victim ? null : s.alive[0]!,
          potions: { heal: !s.potions.heal, poison: !s.potions.poison },
          checks: {},
          second: null,
        });
        expect(game.getTableView(other)).toEqual(game.getTableView(s));
      }
    });
  }

  it('the table view never shows the cards of the living, even to a JSON search', () => {
    // Only the cast (counts, in the deck's order) may name a role; remove it and search the rest.
    for (const s of mafiaScript({ reveal: 'Hidden' })) {
      if (s.phase === 'over') continue;
      const { cast, ...rest } = game.getTableView(s);
      expect(cast.length).toBeGreaterThan(0);
      const text = JSON.stringify(rest);
      for (const r of ['mafia', 'angel', 'sheriff', 'civilian'])
        expect(text).not.toContain(`"${r}"`);
    }
  });

  it('the table view hides who voted for whom until the vote is counted', () => {
    let s = inVote(deal(R7));
    s = act(s, 'wren', { type: 'vote', target: 'finch' });
    const a = game.getTableView(s);
    const b = game.getTableView(act(inVote(deal(R7)), 'wren', { type: 'vote', target: 'heron' }));
    expect(a).toEqual(b);
    expect(a.voted).toEqual(['wren']);
    expect(a.lastVote).toBeNull();
    s = voteAll(s, { wren: 'finch', rook: 'finch' });
    const t = game.getTableView(s);
    expect(t.lastVote!.votes.wren).toBe('finch');
    expect(t.voted).toEqual([]);
  });

  it('the table view shows only how many have picked at night', () => {
    let s = readyAll(deal(R7));
    s = act(s, 'robin', { type: 'pick', target: 'wren' });
    s = act(s, 'wren', { type: 'pick', target: 'finch' });
    const t = game.getTableView(s);
    expect(t.nightDone).toBe(2);
    expect(JSON.stringify(t)).not.toContain('picks');
  });

  it('shows the cards of the dead only when the setting says so', () => {
    const shown = runNight(readyAll(deal(R7, { reveal: 'Shown' })), {
      wren: 'finch',
      rook: 'finch',
    });
    expect(game.getTableView(shown).deaths[0]).toMatchObject({ id: 'finch', role: 'civilian' });
    const hidden = runNight(readyAll(deal(R7, { reveal: 'Hidden' })), {
      wren: 'finch',
      rook: 'finch',
    });
    expect(game.getTableView(hidden).deaths[0]).toMatchObject({ id: 'finch', role: null });
    expect(game.getPlayerView(hidden, 'swift').deaths[0]!.role).toBeNull();
  });

  it('shows every card on the table once the game is over', () => {
    let s = inVote(dead(deal(R7, { reveal: 'Hidden' }), ['rook']));
    s = voteAll(s, { magpie: 'wren', robin: 'wren', finch: 'wren', heron: 'wren', swift: 'wren' });
    s = advance(s);
    expect(s.phase).toBe('over');
    const t = game.getTableView(s);
    expect(t.deaths.every((d) => d.role !== null)).toBe(true);
    expect(game.getPlayerView(s, 'swift').known).toEqual(s.roles);
  });

  it('a civilian only knows their own card', () => {
    const s = readyAll(deal(R7));
    const v = game.getPlayerView(s, 'swift');
    expect(v.role).toBe('civilian');
    expect(v.known).toEqual({ swift: 'civilian' });
    expect(v.packPicks).toBeNull();
    expect(v.witch).toBeNull();
    expect(game.getPlayerView(s, 'robin').known).toEqual({ robin: 'sheriff' });
    expect(game.getPlayerView(s, 'magpie').known).toEqual({ magpie: 'angel' });
  });

  it('a civilian’s view does not change if other living players swap cards and picks', () => {
    for (const s of mafiaScript({ reveal: 'Hidden' })) {
      if (s.phase === 'over' || !s.alive.includes('swift')) continue;
      const others = living(s, 'swift');
      const before = game.getPlayerView(s, 'swift');
      for (let i = 0; i < others.length; i++)
        for (let j = i + 1; j < others.length; j++)
          expect(game.getPlayerView(swapLiving(s, others[i]!, others[j]!), 'swift')).toEqual(
            before,
          );
    }
  });

  it('pack members know each other, and see only each other’s picks', () => {
    let s = readyAll(deal(R7));
    s = act(s, 'wren', { type: 'pick', target: 'finch' });
    s = act(s, 'robin', { type: 'pick', target: 'finch' });
    const wren = game.getPlayerView(s, 'wren');
    expect(wren.known).toEqual({ wren: 'mafia', rook: 'mafia' });
    expect(wren.packPicks).toEqual({ wren: 'finch' });
    const rook = game.getPlayerView(s, 'rook');
    expect(rook.known).toEqual({ wren: 'mafia', rook: 'mafia' });
    expect(rook.packPicks).toEqual({ wren: 'finch' });
    expect(game.getPlayerView(s, 'robin').packPicks).toBeNull();
  });

  it('the Serial Killer works alone and does not know the Mafia', () => {
    const s = readyAll(deal(R8K));
    expect(game.getPlayerView(s, 'magpie').known).toEqual({ magpie: 'killer' });
    expect(game.getPlayerView(s, 'wren').known).toEqual({ wren: 'mafia', rook: 'mafia' });
  });

  it('the dead know everyone', () => {
    let s = runNight(readyAll(deal(R7, { reveal: 'Hidden' })), { wren: 'finch', rook: 'finch' });
    s = advance(s);
    const v = game.getPlayerView(s, 'finch');
    expect(v.alive_).toBe(false);
    expect(v.known).toEqual(s.roles);
    expect(v.deaths[0]!.role).toBe('civilian');
  });

  it('a Seer learns only the cards they looked at', () => {
    const list: Role[] = ['wolf', 'wolf', 'seer', 'villager', 'villager', 'villager'];
    const s = runNight(
      readyAll(deal(list, { mode: 'Werewolf', reveal: 'Hidden' })),
      { wren: 'finch', rook: 'finch' },
      { magpie: 'heron' },
    );
    expect(game.getPlayerView(s, 'magpie').known).toEqual({ magpie: 'seer', heron: 'villager' });
    // A Villager's view of the same night shows no checks at all.
    expect(game.getPlayerView(s, 'heron').checks).toEqual([]);
  });

  it('the Witch’s view carries the victim only on her turn', () => {
    const W6: Role[] = ['wolf', 'wolf', 'seer', 'witch', 'villager', 'villager'];
    const s = runNight(readyAll(deal(W6, werewolf)), { wren: 'finch', rook: 'finch' });
    expect(game.getPlayerView(s, 'robin').witch).not.toBeNull();
    for (const id of ['wren', 'magpie', 'finch', 'heron'])
      expect(game.getPlayerView(s, id).witch).toBeNull();
    expect(game.getTableView(s)).not.toHaveProperty('victim');
  });

  it('keeps the lovers private until one dies of grief', () => {
    const CW: Role[] = ['wolf', 'wolf', 'cupid', 'villager', 'villager', 'villager', 'seer'];
    const s = runNight(
      readyAll(deal(CW, werewolf)),
      { wren: 'heron', rook: 'heron' },
      { magpie: 'wren' },
      'finch',
    );
    expect(game.getTableView(s).lovers).toBeNull();
    expect(game.getPlayerView(s, 'swift').lovers).toBeNull();
  });

  it('announces the dead without their cards when the setting hides them', () => {
    const snaps = mafiaScript({ reveal: 'Hidden' });
    const lines: string[] = [];
    for (let i = 1; i < snaps.length; i++) lines.push(...game.announce!(snaps[i - 1]!, snaps[i]!));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join(' ')).not.toMatch(/civilian|angel|sheriff/i);

    const shown = mafiaScript({ reveal: 'Shown' });
    const lines2: string[] = [];
    for (let i = 1; i < shown.length; i++) lines2.push(...game.announce!(shown[i - 1]!, shown[i]!));
    expect(lines2.join(' ')).toMatch(/Civilian/);
  });
});

describe('the recap', () => {
  /** R7 played out: finch dies night 1, wren is voted out day 1, rook is voted out day 2. */
  function played(o: Partial<MafiaOptions> = {}) {
    let s = readyAll(deal(R7, o));
    s = runNight(s, { wren: 'finch', rook: 'finch' }, { magpie: 'robin', robin: 'wren' });
    s = advance(s); // dawn -> day
    s = advance(s); // talk timer -> vote
    s = voteAll(s, { magpie: 'wren', robin: 'wren', heron: 'wren', swift: 'wren', wren: 'heron' });
    s = advance(s); // dusk -> night 2
    s = runNight(s, { rook: 'heron' }, { magpie: 'heron' });
    s = advance(s);
    s = advance(s);
    s = voteAll(s, { magpie: 'rook', robin: 'rook', swift: 'rook' });
    return advance(s);
  }

  it('keeps the night secrets in the recap, for the end', () => {
    const s = played();
    expect(s.phase).toBe('over');
    const r = game.getResult(s)!;
    const secrets = r.recap.map((e) => e.secret ?? '').join('\n');
    expect(secrets).toContain('{wren}, {rook} chose {finch}.');
    expect(secrets).toContain('{robin} (the Sheriff) checked {wren}: Mafia.');
    expect(r.recap.filter((e) => e.round).length).toBe(r.recap.length - 1);
    expect(r.roundName).toBe('Round');
    const tags = r.recap.map((e) => e.tag);
    expect(tags).toContain('Lynched 4–1');
    expect(tags).toContain('Town wins');
    expect(r.recap.filter((e) => e.key).length).toBeGreaterThanOrEqual(3);
    // The town won: its win is good, and the Mafia dying is good for it.
    expect(r.recap.find((e) => e.tag === 'Town wins')!.tone).toBe('good');
    expect(r.recap.find((e) => e.tag === 'Lynched 4–1')!.tone).toBe('good');
  });

  it('gives every player a stats row, the winners first', () => {
    const r = game.getResult(played())!;
    expect(r.stats!.columns).toEqual([
      'Votes cast',
      'Votes received',
      'Survived to',
      'Night actions',
    ]);
    expect(
      r
        .stats!.rows.map((x) => x.playerId)
        .slice(0, r.winners.length)
        .sort(),
    ).toEqual([...r.winners].sort());
    expect(r.stats!.rows).toHaveLength(7);
    for (const row of r.stats!.rows) expect(row.values).toHaveLength(r.stats!.columns.length);
    const row = (id: string) => r.stats!.rows.find((x) => x.playerId === id)!.values;
    expect(row('wren')[1]).toBe(4);
    expect(row('wren')[2]).toBe('Day 1');
    expect(row('finch')[2]).toBe('Night 1');
  });

  it('writes players only as braced ids', () => {
    const r = game.getResult(played())!;
    const dealt = game.setup({
      playerIds: ids(7),
      options: game.defaultOptions(7),
      rng: rng(),
      now: NOW,
    });
    for (const e of [...r.recap, ...dealt.recap])
      for (const text of [e.text, e.secret ?? '']) {
        let bare = text;
        for (const id of ids(7)) bare = bare.replaceAll(`{${id}}`, '');
        for (const id of ids(7)) expect(bare).not.toMatch(new RegExp(`\\b${id}\\b`));
      }
  });

  it('keeps cards out of the public text when the dead are hidden', () => {
    const r = game.getResult(played({ reveal: 'Hidden' }))!;
    // The first line is the cast list, which is public; the rest must not name anyone's card.
    const text = r.recap
      .slice(1)
      .map((e) => e.text)
      .join('\n');
    expect(text).not.toMatch(/Sheriff|Angel|Civilian/);
    expect(r.recap.some((e) => /was the Civilian/.test(e.secret ?? ''))).toBe(true);
  });

  it('shows nothing from the recap in the table view or a player view mid-game', () => {
    let s = readyAll(deal(R7));
    s = runNight(s, { wren: 'finch', rook: 'finch' }, { magpie: 'finch', robin: 'wren' });
    for (const v of [game.getTableView(s), game.getPlayerView(s, 'heron')]) {
      const json = JSON.stringify(v);
      expect(json).not.toContain('recap');
      expect(json).not.toContain('chose');
      expect(json).not.toContain('checked');
    }
    expect(s.recap.some((e) => e.secret?.includes('chose'))).toBe(true);
  });
});
