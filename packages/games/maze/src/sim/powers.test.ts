import { describe, expect, it } from 'vitest';
import { ATTACK_POWERS, POINTS, POWER_KINDS, POWER_MS, powerMs, speeds } from './powers';

describe('powers', () => {
  it('lists the eight kinds, the last four being attacks', () => {
    expect(POWER_KINDS).toHaveLength(8);
    expect(ATTACK_POWERS).toEqual(['jinx', 'freeze', 'steal', 'fog']);
    expect(POINTS.ghost).toEqual([200, 400, 800, 1600]);
  });

  it('shortens power-ups by 600 ms a level, with a floor', () => {
    expect(powerMs('hunt', 1)).toBe(POWER_MS.hunt);
    expect(powerMs('hunt', 2)).toBe(6400);
    expect(powerMs('hunt', 5)).toBe(4600);
    expect(powerMs('hunt', 50)).toBeGreaterThan(0);
    expect(powerMs('steal', 3)).toBe(0);
    for (let l = 1; l <= 10; l++) expect(powerMs('freeze', l)).toBeGreaterThan(0);
  });

  it('speeds ghosts up each level', () => {
    expect(speeds(1).ghost).toBeCloseTo(6.8);
    expect(speeds(3).ghost).toBeCloseTo(7.9);
    expect(speeds(2)).toMatchObject({ chomper: 7.8, dash: 11.5, frightened: 4.4, eyes: 16 });
  });
});
