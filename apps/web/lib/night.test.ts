import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '@jackdaw/engine';
import { duration, nightSummary } from './night';

const MIN = 60_000;
let clock = 0;

/** One finished game. Pass the winners; everyone else in `players` lost. */
function game(gameId: string, players: string[], winners: string[]): HistoryEntry {
  const startedAt = clock;
  clock += 10 * MIN;
  return {
    gameId,
    startedAt,
    endedAt: clock,
    summary: `${winners.join(' and ')} won`,
    winners,
    players,
    names: Object.fromEntries(players.map((p) => [p, p.toUpperCase()])),
    standings: players.map((playerId) => ({
      playerId,
      outcome: winners.includes(playerId) ? 'win' : 'loss',
    })),
  };
}

/** Played oldest first, returned newest first as the lobby stores history. */
const night = (...games: HistoryEntry[]) => games.reverse();

describe('nightSummary', () => {
  it('is empty before any game', () => {
    expect(nightSummary([], {}, {})).toEqual({
      games: 0,
      table: [],
      streak: null,
      favourite: null,
      minutes: 0,
      awards: [],
    });
  });

  it('ranks the score tally by wins, then fewer losses, and shares ranks when level', () => {
    const s = nightSummary(
      [],
      {
        a: { wins: 2, losses: 1, played: 3 },
        b: { wins: 3, losses: 0, played: 3 },
        c: { wins: 2, losses: 1, played: 3 },
        d: { wins: 2, losses: 0, played: 2 },
        idle: { wins: 0, losses: 0, played: 0 },
      },
      { a: 'Ana', b: 'Bran', c: 'Cerys', d: 'Dafydd', idle: 'Idle' },
    );
    expect(s.table.map((r) => [r.name, r.rank])).toEqual([
      ['Bran', 1],
      ['Dafydd', 2],
      ['Ana', 3],
      ['Cerys', 3],
    ]);
  });

  it('names people who left by the name they last played under', () => {
    const h = night(game('rps', ['a', 'gone'], ['gone']));
    const s = nightSummary(h, { gone: { wins: 1, losses: 0, played: 1 } }, { a: 'Ana' });
    expect(s.table[0]!.name).toBe('GONE');
  });

  it('finds the longest run of wins, counting only games each player was in', () => {
    clock = 0;
    const h = night(
      game('rps', ['a', 'b'], ['a']),
      game('rps', ['b', 'c'], ['c']), // a sits out: their run carries on
      game('rps', ['a', 'b'], ['a']),
      game('rps', ['a', 'b'], ['b']),
      game('rps', ['a', 'b'], ['a']),
    );
    const s = nightSummary(h, {}, { a: 'Ana' });
    expect(s.streak).toEqual({ length: 2, holders: [{ playerId: 'a', name: 'Ana' }] });
  });

  it('lists everyone tied on the longest streak and skips streaks of one', () => {
    const tied = night(
      game('rps', ['a', 'b'], ['a']),
      game('rps', ['a', 'b'], ['a']),
      game('rps', ['a', 'b'], ['b']),
      game('rps', ['a', 'b'], ['b']),
    );
    expect(nightSummary(tied, {}, {}).streak?.holders.map((h) => h.playerId)).toEqual(['a', 'b']);
    const none = night(game('rps', ['a', 'b'], ['a']), game('rps', ['a', 'b'], ['b']));
    expect(nightSummary(none, {}, {}).streak).toBeNull();
    const draw = night(game('rps', ['a', 'b'], ['a', 'b']), game('rps', ['a', 'b'], []));
    expect(nightSummary(draw, {}, {}).streak).toBeNull();
  });

  it('names the favourite game once it has been played twice, and times the night', () => {
    clock = 0;
    const one = night(game('rps', ['a', 'b'], ['a']));
    expect(nightSummary(one, {}, {}).favourite).toBeNull();
    clock = 0;
    const h = night(
      game('avalon', ['a', 'b'], ['a']),
      game('rps', ['a', 'b'], ['a']),
      game('rps', ['a', 'b'], ['b']),
    );
    const s = nightSummary(h, {}, {});
    expect(s.favourite).toEqual({ gameId: 'rps', played: 2 });
    expect(s.games).toBe(3);
    expect(s.minutes).toBe(30);
  });

  it('gives each award to the best of its kind, keeping it on a tie', () => {
    const word = (id: string, text: string, value: number) => ({
      ...game('wordhoard', ['a', 'b'], [id]),
      highlights: [{ award: 'Best word', playerIds: [id], text, value }],
    });
    const pot = {
      ...game('poker', ['a', 'b'], ['b']),
      highlights: [{ award: 'Biggest pot', playerIds: ['b'], text: '900 chips', value: 900 }],
    };
    const s = nightSummary(
      night(
        word('a', 'HOARD for 24', 24),
        pot,
        word('b', 'JACKDAW for 98', 98),
        word('a', 'ZAX for 98', 98),
      ),
      {},
      { a: 'Ana' },
    );
    expect(s.awards).toEqual([
      {
        award: 'Best word',
        gameId: 'wordhoard',
        text: 'JACKDAW for 98',
        holders: [{ playerId: 'b', name: 'B' }],
      },
      {
        award: 'Biggest pot',
        gameId: 'poker',
        text: '900 chips',
        holders: [{ playerId: 'b', name: 'B' }],
      },
    ]);
  });
});

describe('duration', () => {
  it('reads like a person would say it', () => {
    expect(duration(0)).toBe('1 minute');
    expect(duration(45)).toBe('45 minutes');
    expect(duration(60)).toBe('1 hour');
    expect(duration(130)).toBe('2 hours 10 minutes');
    expect(duration(61)).toBe('1 hour 1 minute');
  });
});
