import { describe, expect, it } from 'vitest';
import { resultFrom } from './link';

const players = [
  { id: 'wren', side: 'good' as const, role: 'merlin', won: false },
  { id: 'rook', side: 'evil' as const, role: 'assassin', won: true },
  { id: 'kite', side: 'good' as const, role: 'servant', won: false },
];

describe("the Avalon link's recap", () => {
  it('tells the story quest by quest when Avalon sends it', () => {
    const r = resultFrom({
      over: true,
      winner: 'evil',
      reason: 'The Assassin named Wren, who was Merlin.',
      players,
      quests: [
        { result: 'fail', fails: 1, failsNeeded: 1 },
        { result: null, fails: null, failsNeeded: 1 },
      ],
      proposals: [
        {
          quest: 0,
          leader: 'kite',
          team: ['kite', 'wren'],
          approve: ['kite'],
          reject: ['wren', 'rook'],
          approved: false,
        },
        {
          quest: 0,
          leader: 'rook',
          team: ['rook', 'wren'],
          approve: ['rook', 'wren'],
          reject: ['kite'],
          approved: true,
        },
      ],
      lady: [{ holder: 'kite', target: 'rook', evil: true, quest: 0 }],
      assassin: { by: 'rook', target: 'wren' },
    });
    expect(r.roundName).toBe('Quest');
    const tags = r.recap.map((e) => e.tag);
    expect(tags).toEqual(
      expect.arrayContaining([
        'Rejected 1–2',
        'Approved 2–1',
        'Failed, 1 Fail card',
        'Merlin found',
      ]),
    );
    const sent = r.recap.find((e) => e.tag === 'Approved 2–1')!;
    expect(sent.secret).toBe('Evil on this team: {rook}.');
    expect(r.recap.find((e) => e.tag === 'Failed, 1 Fail card')).toMatchObject({
      tone: 'good',
      key: true,
    });
    expect(r.recap.find((e) => e.text.includes('Lady'))?.secret).toBe('{rook} was Evil.');
    // Winners first in the numbers.
    expect(r.stats?.rows[0]).toEqual({ playerId: 'rook', values: [1, 1, '1/2'] });
    // No bare ids: every player reference in the text is braced.
    for (const e of r.recap)
      expect(e.text.replace(/\{\w+\}/g, '')).not.toMatch(/\b(wren|rook|kite)\b/);
  });

  it('still works with an older Avalon that sends only sides and roles', () => {
    const r = resultFrom({
      over: true,
      winner: 'good',
      reason: 'Three quests succeeded.',
      players,
    });
    expect(r.recap).toHaveLength(2);
    expect(r.stats).toBeUndefined();
  });
});
