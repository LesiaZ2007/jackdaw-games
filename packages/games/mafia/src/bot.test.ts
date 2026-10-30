import { createRng } from '@jackdaw/engine';
import { describe, expect, it } from 'vitest';
import { mafiaBot } from './bot';
import { mafia as game, type MafiaOptions, type MafiaState } from './rules';

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

/** A whole game with a bot in every seat, timers fired as the platform would. */
function playOut(n: number, o: Partial<MafiaOptions>, seed: number) {
  let now = 1_000;
  const options = { ...game.defaultOptions(n), ...o };
  let s: MafiaState = game.setup({ playerIds: ids(n), options, rng: createRng(seed), now });
  let moves = 0;
  while (s.phase !== 'over') {
    if (++moves > 3000) throw new Error(`no finish after 3000 moves (seed ${seed})`);
    now += 2_500;
    let acted = false;
    for (const id of s.players) {
      const action = mafiaBot({
        playerId: id,
        playerIds: s.players,
        view: game.getPlayerView(s, id),
        tableView: game.getTableView(s),
        rng: createRng(seed * 7919 + moves),
        now,
        level: 'normal',
      });
      if (!action) continue;
      const next = game.applyAction(s, id, action, createRng(moves), now);
      expect(next, `${s.phase} ${id} ${JSON.stringify(action)}`).not.toBe(s);
      s = next;
      acted = true;
      break;
    }
    if (acted) continue;
    const timer = game.nextTimer!(s);
    if (!timer) continue; // a day without a timer: the bots get ready as time passes
    if (timer.at > now) continue;
    const next = game.onTimer!(s, timer.id, createRng(moves), now);
    if (next === s) throw new Error(`timer did nothing in ${s.phase}`);
    s = next;
  }
  return s;
}

describe('Mafia bots', () => {
  const tables: [number, Partial<MafiaOptions>, string][] = [
    [5, {}, 'Mafia, smallest'],
    [8, { extras: ['jester', 'mayor', 'killer'] }, 'Mafia, every extra'],
    [15, { extras: ['killer'], talk: 'Off' }, 'Mafia, 15, no talk timer'],
    [6, { mode: 'Werewolf' }, 'Werewolf'],
    [10, { mode: 'Werewolf', extras: ['witch', 'hunter', 'cupid'] }, 'Werewolf, every extra'],
    [
      15,
      { mode: 'Werewolf', extras: ['witch', 'hunter', 'cupid'], reveal: 'Hidden' },
      'Werewolf, 15',
    ],
  ];
  for (const [n, o, label] of tables) {
    it(`an all-bot table finishes: ${n} players, ${label}`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const s = playOut(n, o, seed);
        const r = game.getResult(s)!;
        expect(r.standings).toHaveLength(n);
        expect(r.summary.length).toBeGreaterThan(0);
      }
    });
  }
});
