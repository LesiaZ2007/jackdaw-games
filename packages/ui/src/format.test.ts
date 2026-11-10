import { describe, expect, it } from 'vitest';
import { clockMs, clockSeconds, plural } from './format';

describe('clock', () => {
  it('reads like a stopwatch', () => {
    expect(clockMs(41_000)).toBe('0:41');
    expect(clockMs(725_000)).toBe('12:05');
    expect(clockMs(3_729_000)).toBe('1:02:09');
    expect(clockMs(-5)).toBe('0:00');
  });
  it('takes whole seconds too', () => {
    expect(clockSeconds(65)).toBe('1:05');
    expect(clockSeconds(0)).toBe('0:00');
  });
});

describe('plural', () => {
  it('adds an s except for one', () => {
    expect(plural(1, 'card')).toBe('1 card');
    expect(plural(0, 'card')).toBe('0 cards');
    expect(plural(3, 'hint')).toBe('3 hints');
  });
});
