import { describe, expect, it } from 'vitest';
import type { OptionGroup } from './game-ui';
import { arrangeOptions, toggleKey } from './option-groups';

const keys = ['mode', 'hunt', 'dash', 'look', 'fog'];
const bools = new Set(['hunt', 'dash', 'fog']);
const group: OptionGroup = { label: 'Power-ups', keys: ['hunt', 'dash', 'fog'], layout: 'grid' };
const shape = (items: ReturnType<typeof arrangeOptions>) =>
  items.map((i) => (i.type === 'field' ? i.key : 'GRID'));

describe('arrangeOptions', () => {
  it('draws every option as a row without groups', () => {
    expect(shape(arrangeOptions(keys, bools, undefined))).toEqual(keys);
    expect(shape(arrangeOptions(keys, bools, []))).toEqual(keys);
  });
  it('draws grouped keys as one grid at the first key', () => {
    const items = arrangeOptions(keys, bools, [group]);
    expect(shape(items)).toEqual(['mode', 'GRID', 'look']);
    const g = items[1]!;
    expect(g.type === 'group' && g.keys).toEqual(['hunt', 'dash', 'fog']);
  });
  it('leaves non yes/no keys and unknown keys alone', () => {
    const items = arrangeOptions(keys, bools, [{ ...group, keys: ['look', 'nope', 'dash'] }]);
    expect(shape(items)).toEqual(['mode', 'hunt', 'GRID', 'look', 'fog']);
  });
});

describe('toggleKey', () => {
  it('changes only that key', () => {
    const o = { hunt: true, dash: true, look: 'Neon' };
    expect(toggleKey(o, 'dash')).toEqual({ hunt: true, dash: false, look: 'Neon' });
    expect(o.dash).toBe(true);
  });
});
