import { describe, expect, it } from 'vitest';
import { awardMoment, robberyMoment } from './moments';
import type { CatanTableView } from './rules';

const tv = (over: Partial<CatanTableView>) => over as CatanTableView;

describe('moments', () => {
  it('a robbery: the victim loses, the thief wins, the TV sees it, others see nothing', () => {
    const v = tv({ robbery: { seq: 4, thief: 'a', victim: 'b', took: true } });
    expect(robberyMoment(v, 'b')).toMatchObject({
      key: 4,
      outcome: 'loss',
      kind: 'robbery',
      who: 'a',
      other: 'b',
    });
    expect(robberyMoment(v, 'a')).toMatchObject({ outcome: 'win' });
    expect(robberyMoment(v, null)).toMatchObject({ outcome: 'reveal' });
    expect(robberyMoment(v, 'c')).toBe(null);
  });

  it('no moment when nobody was robbed or nothing was taken', () => {
    expect(
      robberyMoment(tv({ robbery: { seq: 2, thief: 'a', victim: null, took: false } }), 'a'),
    ).toBe(null);
    expect(
      robberyMoment(tv({ robbery: { seq: 2, thief: 'a', victim: 'b', took: false } }), 'b'),
    ).toBe(null);
    expect(robberyMoment(tv({ robbery: null }), 'a')).toBe(null);
  });

  it('awards: the new holder wins, the old one loses', () => {
    const v = tv({ award: { seq: 7, kind: 'road', from: 'a', to: 'b' } });
    expect(awardMoment(v, 'b')).toMatchObject({ key: 7, outcome: 'win', kind: 'road' });
    expect(awardMoment(v, 'a')).toMatchObject({ outcome: 'loss', kind: 'road' });
    expect(awardMoment(v, null)).toMatchObject({ outcome: 'reveal' });
    expect(awardMoment(v, 'c')).toBe(null);
    expect(awardMoment(tv({ award: { seq: 8, kind: 'road', from: 'a', to: null } }), null)).toBe(
      null,
    );
  });
});
