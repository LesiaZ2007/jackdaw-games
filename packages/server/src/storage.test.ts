import { describe, expect, it } from 'vitest';
import { MemoryStorage, storageFromEnv } from './storage';

describe('MemoryStorage', () => {
  it('expires keys after their TTL', async () => {
    let now = 0;
    const s = new MemoryStorage(() => now);
    await s.set('a', '1', 10);
    expect(await s.get('a')).toBe('1');
    now = 10_000;
    expect(await s.get('a')).toBeNull();
  });

  it('setIfAbsent only creates once', async () => {
    const s = new MemoryStorage();
    expect(await s.setIfAbsent('lock', 'x', 5)).toBe(true);
    expect(await s.setIfAbsent('lock', 'y', 5)).toBe(false);
    await s.delIfEquals('lock', 'y');
    expect(await s.get('lock')).toBe('x');
    await s.delIfEquals('lock', 'x');
    expect(await s.get('lock')).toBeNull();
  });

  it('stores hash fields', async () => {
    const s = new MemoryStorage();
    await s.hset('seen', 'p1', '100', 60);
    await s.hset('seen', 'p2', '200', 60);
    expect(await s.hgetall('seen')).toEqual({ p1: '100', p2: '200' });
  });
});

describe('storageFromEnv', () => {
  it('uses memory locally and refuses to run on Vercel without Redis', () => {
    expect(storageFromEnv({}).kind).toBe('memory');
    expect(() => storageFromEnv({ VERCEL: '1' })).toThrow(/KV_REST_API_URL/);
    expect(storageFromEnv({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }).kind).toBe(
      'upstash',
    );
  });
});
