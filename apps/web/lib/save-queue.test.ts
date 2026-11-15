import { describe, expect, it } from 'vitest';
import { createSaveQueue } from './save-queue';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createSaveQueue', () => {
  it('sends one save at a time and folds changes made meanwhile into the latest copy', async () => {
    const sent: unknown[] = [];
    const resolvers: (() => void)[] = [];
    const covered: number[] = [];
    const push0 = createSaveQueue((n) => covered.push(n));
    const send = (o: unknown) => {
      sent.push(o);
      return new Promise<void>((r) => resolvers.push(r));
    };
    const push = (o: Record<string, unknown>) => push0(o, send);
    push({ mode: 'Race' });
    push({ mode: 'Race', look: 'Neon' });
    push({ mode: 'Race', look: 'Classic' });
    await tick();
    // Only the first is out; the others wait for it.
    expect(sent).toEqual([{ mode: 'Race' }]);
    resolvers[0]!();
    await tick();
    expect(sent).toEqual([{ mode: 'Race' }, { mode: 'Race', look: 'Classic' }]);
    resolvers[1]!();
    await tick();
    expect(covered).toEqual([1, 2]);
  });

  it('keeps going after a failed save', async () => {
    const sent: unknown[] = [];
    let n = 0;
    const covered: number[] = [];
    const push0 = createSaveQueue((c) => covered.push(c));
    const send = (o: unknown) => {
      sent.push(o);
      if (n++ === 0) return Promise.reject(new Error('offline'));
      return undefined;
    };
    const push = (o: Record<string, unknown>) => push0(o, send);
    push({ a: 1 });
    push({ a: 2 });
    await tick();
    await tick();
    expect(sent).toEqual([{ a: 1 }, { a: 2 }]);
    expect(covered).toEqual([1, 1]);
  });
});
