import { describe, expect, it } from 'vitest';
import { describeRoles, EVIL_COUNT, lineup, QUEST_SIZES, type Mode } from './lineup';

// Generated from the live app's lib/rules.js lineup() (2026-10-13): mode, players, good, evil,
// dropped. The custom rows use the app's default custom picks.
const APP: [Mode, number, string, string, string][] = [
  ['classic', 5, 'merlin servant servant', 'assassin minion', ''],
  ['classic', 6, 'merlin servant servant servant', 'assassin minion', ''],
  ['classic', 7, 'merlin servant servant servant', 'assassin minion minion', ''],
  ['classic', 8, 'merlin servant servant servant servant', 'assassin minion minion', ''],
  ['classic', 9, 'merlin servant servant servant servant servant', 'assassin minion minion', ''],
  [
    'classic',
    10,
    'merlin servant servant servant servant servant',
    'assassin minion minion minion',
    '',
  ],
  [
    'classic',
    11,
    'merlin servant servant servant servant servant servant',
    'assassin minion minion minion',
    '',
  ],
  [
    'classic',
    12,
    'merlin servant servant servant servant servant servant',
    'assassin minion minion minion minion',
    '',
  ],
  [
    'classic',
    13,
    'merlin servant servant servant servant servant servant servant',
    'assassin minion minion minion minion',
    '',
  ],
  [
    'classic',
    14,
    'merlin servant servant servant servant servant servant servant servant',
    'assassin minion minion minion minion',
    '',
  ],
  [
    'classic',
    15,
    'merlin servant servant servant servant servant servant servant servant',
    'assassin minion minion minion minion minion',
    '',
  ],
  ['full', 5, 'merlin percival servant', 'assassin morgana', 'mordred oberon'],
  ['full', 6, 'merlin percival servant servant', 'assassin morgana', 'mordred oberon'],
  ['full', 7, 'merlin percival servant servant', 'assassin morgana mordred', 'oberon'],
  ['full', 8, 'merlin percival servant servant servant', 'assassin morgana mordred', 'oberon'],
  [
    'full',
    9,
    'merlin percival servant servant servant servant',
    'assassin morgana mordred',
    'oberon',
  ],
  [
    'full',
    10,
    'merlin percival servant servant servant servant',
    'assassin morgana mordred oberon',
    '',
  ],
  [
    'full',
    11,
    'merlin percival servant servant servant servant servant',
    'assassin morgana mordred oberon',
    '',
  ],
  [
    'full',
    12,
    'merlin percival servant servant servant servant servant',
    'assassin morgana mordred oberon minion',
    '',
  ],
  [
    'full',
    13,
    'merlin percival servant servant servant servant servant servant',
    'assassin morgana mordred oberon minion',
    '',
  ],
  [
    'full',
    14,
    'merlin percival servant servant servant servant servant servant servant',
    'assassin morgana mordred oberon minion',
    '',
  ],
  [
    'full',
    15,
    'merlin percival servant servant servant servant servant servant servant',
    'assassin morgana mordred oberon minion minion',
    '',
  ],
  ['custom', 5, 'merlin percival servant', 'assassin morgana', ''],
  ['custom', 6, 'merlin percival servant servant', 'assassin morgana', ''],
  ['custom', 7, 'merlin percival servant servant', 'assassin morgana minion', ''],
  ['custom', 8, 'merlin percival servant servant servant', 'assassin morgana minion', ''],
  ['custom', 9, 'merlin percival servant servant servant servant', 'assassin morgana minion', ''],
  [
    'custom',
    10,
    'merlin percival servant servant servant servant',
    'assassin morgana minion minion',
    '',
  ],
  [
    'custom',
    11,
    'merlin percival servant servant servant servant servant',
    'assassin morgana minion minion',
    '',
  ],
  [
    'custom',
    12,
    'merlin percival servant servant servant servant servant',
    'assassin morgana minion minion minion',
    '',
  ],
  [
    'custom',
    13,
    'merlin percival servant servant servant servant servant servant',
    'assassin morgana minion minion minion',
    '',
  ],
  [
    'custom',
    14,
    'merlin percival servant servant servant servant servant servant servant',
    'assassin morgana minion minion minion',
    '',
  ],
  [
    'custom',
    15,
    'merlin percival servant servant servant servant servant servant servant',
    'assassin morgana minion minion minion minion',
    '',
  ],
  ['plain', 5, 'servant servant servant', 'minion minion', ''],
  ['plain', 6, 'servant servant servant servant', 'minion minion', ''],
  ['plain', 7, 'servant servant servant servant', 'minion minion minion', ''],
  ['plain', 8, 'servant servant servant servant servant', 'minion minion minion', ''],
  ['plain', 9, 'servant servant servant servant servant servant', 'minion minion minion', ''],
  [
    'plain',
    10,
    'servant servant servant servant servant servant',
    'minion minion minion minion',
    '',
  ],
  [
    'plain',
    11,
    'servant servant servant servant servant servant servant',
    'minion minion minion minion',
    '',
  ],
  [
    'plain',
    12,
    'servant servant servant servant servant servant servant',
    'minion minion minion minion minion',
    '',
  ],
  [
    'plain',
    13,
    'servant servant servant servant servant servant servant servant',
    'minion minion minion minion minion',
    '',
  ],
  [
    'plain',
    14,
    'servant servant servant servant servant servant servant servant servant',
    'minion minion minion minion minion',
    '',
  ],
  [
    'plain',
    15,
    'servant servant servant servant servant servant servant servant servant',
    'minion minion minion minion minion minion',
    '',
  ],
];

const custom = { merlin: true, percival: true, morgana: true, mordred: false, oberon: false };

describe('lineup (ported from the Avalon app)', () => {
  it.each(APP)('%s with %i players deals what the app deals', (mode, n, good, evil, dropped) => {
    const l = lineup({ mode, custom }, n);
    expect(l.good.join(' ')).toBe(good);
    expect(l.evil.join(' ')).toBe(evil);
    expect(l.dropped.join(' ')).toBe(dropped);
    expect(l.good.length + l.evil.length).toBe(n);
    expect(l.evil.length).toBe(EVIL_COUNT[n]);
  });

  it('drops roles whose partner is missing, as the app does', () => {
    const l = lineup(
      {
        mode: 'custom',
        custom: { merlin: false, percival: true, morgana: true, mordred: true, oberon: true },
      },
      7,
    );
    expect(l.good).toEqual(['servant', 'servant', 'servant', 'servant']);
    expect(l.evil).toEqual(['oberon', 'minion', 'minion']);
  });

  it('has five quests for every table size', () => {
    for (let n = 5; n <= 15; n++) expect(QUEST_SIZES[n]).toHaveLength(5);
  });

  it('describes a deal the way the lobby lists it', () => {
    expect(describeRoles(['merlin', 'servant', 'servant'])).toEqual(['Merlin', '2 Loyal Servants']);
  });
});
