import { describe, expect, it } from 'vitest';
import { defaultOptions, enabledPowers, optionsSchema, validateOptions } from './options';
import type { MazeOptions } from './options';

const base = (over: Partial<MazeOptions> = {}): MazeOptions => ({
  ...defaultOptions(3),
  ...over,
});

describe('options', () => {
  it('defaults to Solo for one player and Shared for more', () => {
    expect(defaultOptions(1).mode).toBe('Solo');
    expect(defaultOptions(2).mode).toBe('Shared');
    expect(defaultOptions(8).mode).toBe('Shared');
  });

  it('has the documented defaults and passes its own schema', () => {
    const o = defaultOptions(4);
    expect(o).toMatchObject({
      mazes: 3,
      minutes: 3,
      powerUps: 'Mixed',
      look: 'Printed',
      hunt: true,
      dash: true,
      phase: true,
      magnet: true,
      jinx: true,
      freeze: true,
      steal: true,
      fog: true,
    });
    expect(optionsSchema.parse(o)).toEqual(o);
    expect(optionsSchema.safeParse({ ...o, mazes: 6 }).success).toBe(false);
    expect(optionsSchema.safeParse({ ...o, minutes: 1 }).success).toBe(false);
  });

  it('accepts the defaults for every player count', () => {
    for (let n = 1; n <= 8; n++) expect(validateOptions(defaultOptions(n), n)).toBeNull();
  });

  it('needs exactly one player for Solo', () => {
    expect(validateOptions(base({ mode: 'Solo' }), 2)).toBe('Solo is for exactly 1 player.');
    expect(validateOptions(base({ mode: 'Solo' }), 1)).toBeNull();
  });

  it('needs two or more players for Shared and Race', () => {
    expect(validateOptions(base({ mode: 'Shared' }), 1)).toBe(
      'Shared maze needs 2 or more players.',
    );
    expect(validateOptions(base({ mode: 'Race' }), 1)).toBe('Race needs 2 or more players.');
    expect(validateOptions(base({ mode: 'Race' }), 2)).toBeNull();
  });

  it('refuses Mixed with every power-up off', () => {
    const off = {
      hunt: false,
      dash: false,
      phase: false,
      magnet: false,
      jinx: false,
      freeze: false,
      steal: false,
      fog: false,
    };
    const msg = 'Turn on at least one power-up, or pick Classic.';
    expect(validateOptions(base(off), 3)).toBe(msg);
    expect(validateOptions(base({ ...off, powerUps: 'Classic' }), 3)).toBeNull();
    // Solo only uses the first four, so attack power-ups alone are not enough.
    expect(validateOptions(base({ ...off, mode: 'Solo', fog: true }), 1)).toBe(msg);
  });

  it('lists the enabled power-ups', () => {
    expect(enabledPowers(base({ powerUps: 'Classic' }))).toEqual(['hunt']);
    expect(enabledPowers(base({ mode: 'Solo', powerUps: 'Classic' }))).toEqual(['hunt']);
    expect(enabledPowers(base())).toEqual([
      'hunt',
      'dash',
      'phase',
      'magnet',
      'jinx',
      'freeze',
      'steal',
      'fog',
    ]);
    expect(enabledPowers(base({ dash: false, steal: false }))).toEqual([
      'hunt',
      'phase',
      'magnet',
      'jinx',
      'freeze',
      'fog',
    ]);
    expect(enabledPowers(base({ mode: 'Solo' }))).toEqual(['hunt', 'dash', 'phase', 'magnet']);
    expect(enabledPowers(base({ mode: 'Solo', hunt: false }))).toEqual(['dash', 'phase', 'magnet']);
  });
});
