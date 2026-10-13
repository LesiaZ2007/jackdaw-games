import { describe, expect, it } from 'vitest';
import { describeRound, listNames, roundOutcome, roundWinners } from './outcome';
import { scoreRound, type Pick, type RoundResult } from './rules';

const round = (picks: Record<string, Pick>): RoundResult => ({
  round: 1,
  picks,
  points: scoreRound(picks),
});
const NAMES: Record<string, string> = { a: 'Ash', b: 'Bran', c: 'Cerys', d: 'Dai' };
const name = (id: string) => NAMES[id] ?? id;

describe('round outcomes', () => {
  it('names the single top scorer as the winner and everyone else as losing', () => {
    const r = round({ a: 'rock', b: 'scissors', c: 'scissors' });
    expect(roundWinners(r)).toEqual(['a']);
    expect(roundOutcome(r, 'a')).toEqual({
      winners: ['a'],
      outcome: 'win',
      beat: ['b', 'c'],
      lostTo: [],
    });
    expect(roundOutcome(r, 'b').outcome).toBe('loss');
    expect(roundOutcome(r, 'b').lostTo).toEqual(['a']);
  });

  it('shares the round between tied top scorers', () => {
    const r = round({ a: 'paper', b: 'paper', c: 'rock' });
    expect(roundWinners(r)).toEqual(['a', 'b']);
    expect(roundOutcome(r, 'b').outcome).toBe('win');
    expect(roundOutcome(r, 'c').outcome).toBe('loss');
  });

  it('calls it a draw when everyone scores the same', () => {
    expect(roundWinners(round({ a: 'rock', b: 'rock' }))).toEqual([]);
    const cycle = round({ a: 'rock', b: 'paper', c: 'scissors' });
    expect(roundWinners(cycle)).toEqual([]);
    expect(roundOutcome(cycle, 'a').outcome).toBe('draw');
  });

  it('can win the round while still losing to someone', () => {
    // a beats b and d (2 points) but loses to c, whose paper beats only a (1 point).
    const r = round({ a: 'rock', b: 'scissors', c: 'paper', d: 'scissors' });
    expect(roundOutcome(r, 'a')).toMatchObject({
      outcome: 'win',
      beat: ['b', 'd'],
      lostTo: ['c'],
    });
  });
});

describe('round descriptions', () => {
  it('says who you beat, or who beat you', () => {
    const r = round({ a: 'rock', b: 'scissors', c: 'scissors' });
    expect(describeRound(r, 'a', name)).toBe('Your rock beat Bran and Cerys. +2 points.');
    expect(describeRound(r, 'b', name)).toBe('Ash beat your scissors with rock.');
  });

  it('mentions who you lost to even in a round you took', () => {
    const r = round({ a: 'rock', b: 'scissors', c: 'paper', d: 'scissors' });
    expect(describeRound(r, 'a', name)).toBe(
      'Your rock beat Bran and Dai but lost to Cerys. +2 points.',
    );
  });

  it('explains a stand-off', () => {
    expect(describeRound(round({ a: 'rock', b: 'rock' }), 'a', name)).toBe('Everyone threw rock.');
    expect(describeRound(round({ a: 'rock', b: 'paper', c: 'scissors' }), 'a', name)).toMatch(
      /all came out/,
    );
  });

  it('shortens long lists of names', () => {
    expect(listNames(['a', 'b', 'c', 'd'], name)).toBe('Ash, Bran and 2 others');
    expect(listNames(['a', 'b', 'c'], name)).toBe('Ash, Bran and 1 other');
    expect(listNames(['a'], name)).toBe('Ash');
  });
});
