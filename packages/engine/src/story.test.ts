import { describe, expect, it } from 'vitest';
import { buildStory, raceStory } from './story';

describe('raceStory', () => {
  it('finds the margin, lead changes, biggest lead and a comeback', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0, 10, 30, 20, 25] },
        { playerId: 'b', points: [0, 5, 0, 10, 40] },
        { playerId: 'c', points: [0, 8, 12, 25, 30] },
      ],
      winners: ['b'],
      step: 'hand',
      title: 'Chips',
      unit: ' chips',
    });
    const byLabel = Object.fromEntries(r.headlines.map((h) => [h.label, h]));
    expect(byLabel['Winning margin']?.value).toBe('10');
    expect(byLabel['Winning margin']?.detail).toBe('{b} over {c}');
    // a, a, c, b
    expect(byLabel['Lead changes']?.value).toBe('2');
    expect(byLabel['Biggest lead']).toMatchObject({ value: '18', playerId: 'a' });
    const comeback = r.facts.find((f) => f.label === 'Comeback');
    expect(comeback?.text).toBe('{b} was dead last after hand 2, 30 chips behind, and still won.');
    expect(r.facts.find((f) => f.label === 'Huge hand')?.text).toBe(
      '{b} gained 30 chips on hand 4.',
    );
    // The drops (10 and 5) are alike, so neither stands out as a rough hand.
    expect(r.facts.find((f) => f.label === 'Rough hand')).toBeUndefined();
  });

  it('needs an outright lead after every step for wire to wire', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0, 2, 2, 4, 6] },
        { playerId: 'b', points: [0, 2, 2, 3, 3] },
      ],
      winners: ['a'],
      step: 'round',
      title: 'Score',
    });
    expect(r.facts.map((f) => f.label)).not.toContain('Wire to wire');
  });

  it('calls a wire-to-wire win and a photo finish', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0, 5, 10, 15, 100] },
        { playerId: 'b', points: [0, 1, 2, 3, 99] },
      ],
      winners: ['a'],
      step: 'turn',
      title: 'Score',
    });
    expect(r.facts.map((f) => f.label)).toContain('Wire to wire');
    expect(r.facts.map((f) => f.label)).toContain('Photo finish');
    expect(r.headlines.find((h) => h.label === 'Lead changes')).toBeUndefined();
  });

  it('turns the order round when the low score wins', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0, 20, 30] },
        { playerId: 'b', points: [0, 5, 40] },
      ],
      winners: ['a'],
      step: 'round',
      title: 'Points',
      lowWins: true,
    });
    expect(r.headlines[0]).toMatchObject({ label: 'Winning margin', value: '10', playerId: 'a' });
    expect(r.facts.find((f) => f.label === 'Rough round')?.text).toBe('{b} took on 35 on round 2.');
  });

  it('says "1 point", not "1 points"', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0, 1, 2, 3, 21] },
        { playerId: 'b', points: [0, 0, 1, 2, 20] },
      ],
      winners: ['a'],
      step: 'round',
      title: 'Score',
      unit: ' points',
    });
    expect(r.facts.find((f) => f.label === 'Photo finish')?.text).toBe('{a} won by just 1 point.');
  });

  it('says nothing about a game with one step', () => {
    const r = raceStory({
      series: [
        { playerId: 'a', points: [0] },
        { playerId: 'b', points: [0] },
      ],
      winners: ['a'],
      step: 'round',
      title: 'Score',
    });
    expect(r.headlines).toEqual([]);
    expect(r.facts).toEqual([]);
  });
});

describe('buildStory', () => {
  it('keeps four headlines, drops empty parts, and is undefined when empty', () => {
    expect(buildStory({})).toBeUndefined();
    const s = buildStory({
      headlines: [1, 2, 3, 4, 5].map((n) => ({ label: `H${n}`, value: `${n}` })),
      bars: [{ title: 'Empty', rows: [] }],
      charts: [{ title: 'Flat', series: [{ playerId: 'a', points: [1] }] }],
    });
    expect(s?.headlines).toHaveLength(4);
    expect(s?.bars).toBeUndefined();
    expect(s?.charts).toBeUndefined();
  });
});
