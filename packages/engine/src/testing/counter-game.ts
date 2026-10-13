import { z } from 'zod';
import type { GameModule } from '../contract';
import { GameError } from '../errors';

/**
 * A tiny game for engine tests: players take turns adding 1; whoever reaches `target` wins.
 * Each player also holds a secret number nobody else may see.
 */
export interface CounterState {
  players: string[];
  turn: number;
  count: number;
  target: number;
  secrets: Record<string, number>;
  log: string[];
}

export const counterGame: GameModule<
  CounterState,
  { type: 'add' },
  { secret: number; count: number; myTurn: boolean },
  { count: number; turn: string },
  { target: number }
> = {
  meta: {
    id: 'counter',
    name: 'Counter',
    tagline: 'Count to the target.',
    minPlayers: 2,
    maxPlayers: 4,
    category: 'board',
    minutes: [1, 2],
    complexity: 1,
  },
  optionsSchema: z.object({ target: z.number().int().min(1).max(20) }),
  actionSchema: z.object({ type: z.literal('add') }),
  defaultOptions: () => ({ target: 3 }),
  validateOptions: (o, n) => (o.target < n ? 'Target must be at least the player count.' : null),
  setup: ({ playerIds, options, rng }) => ({
    players: playerIds,
    turn: 0,
    count: 0,
    target: options.target,
    secrets: Object.fromEntries(playerIds.map((id) => [id, rng.int(1000)])),
    log: [],
  }),
  getPlayerView: (s, id) => ({
    secret: s.secrets[id]!,
    count: s.count,
    myTurn: s.players[s.turn] === id,
  }),
  getTableView: (s) => ({ count: s.count, turn: s.players[s.turn]! }),
  applyAction(s, id) {
    if (s.players[s.turn] !== id) throw new GameError('NOT_YOUR_TURN', "It's not your turn.");
    return { ...s, count: s.count + 1, turn: (s.turn + 1) % s.players.length, log: [...s.log, id] };
  },
  // Public facts only: everyone in the lobby reads these.
  announce: (prev, next) =>
    prev === null
      ? [`{${next.players[0]!}} goes first.`]
      : next.count > prev.count
        ? [`{${next.log[next.log.length - 1]!}} added 1.`]
        : [],
  getResult: (s) =>
    s.count >= s.target
      ? {
          winners: [s.log[s.log.length - 1]!],
          summary: `Reached ${s.target}`,
          reveal: { secrets: s.secrets },
          recap: s.log.map((actor, i) => ({ round: i + 1, actor, text: `${actor} added 1` })),
        }
      : null,
};
