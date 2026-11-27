import { describe, expect, it } from 'vitest';
import { signBody, signPass, verifyBody, verifyPass, type LivePass } from './pass';

const SECRET = 'a-test-secret-that-is-long-enough';
const pass: LivePass = {
  code: 'QGYR',
  session: 'sess-1',
  who: 'wren',
  exp: 2_000_000,
  setup: {
    round: 1,
    seed: 42,
    layouts: [0, { gen: 7, size: 'Medium' }],
    powers: ['hunt', 'steal'],
    mixed: true,
    startAt: 1_000_000,
    endAt: 1_120_000,
    seats: [
      { id: 'wren', name: 'Wren' },
      { id: 'rook', name: 'Bot Rook', bot: true },
    ],
  },
};

describe('live passes', () => {
  it('round-trip, and expire', async () => {
    const token = await signPass(pass, SECRET);
    expect(await verifyPass(token, SECRET, 1_500_000)).toEqual(pass);
    expect(await verifyPass(token, SECRET, 2_000_001)).toBeNull();
  });

  it('refuse another secret or a changed pass', async () => {
    const token = await signPass(pass, SECRET);
    expect(await verifyPass(token, 'another-secret-entirely-xxxx', 1_500_000)).toBeNull();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...pass, who: 'rook' })).toString('base64url');
    expect(await verifyPass(`${forged}.${sig}`, SECRET, 1_500_000)).toBeNull();
    expect(await verifyPass(`${body}`, SECRET, 1_500_000)).toBeNull();
    expect(await verifyPass('not a pass', SECRET, 1_500_000)).toBeNull();
  });

  it('sign result bodies', async () => {
    const body = JSON.stringify({ sessionId: 'sess-1', result: { seq: 1 } });
    const sig = await signBody(body, SECRET);
    expect(await verifyBody(body, sig, SECRET)).toBe(true);
    expect(await verifyBody(body + ' ', sig, SECRET)).toBe(false);
    expect(await verifyBody(body, sig, 'another-secret-entirely-xxxx')).toBe(false);
  });
});
