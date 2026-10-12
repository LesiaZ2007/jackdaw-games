/**
 * RoomStorage: the only door between the room runtime and wherever lobbies are kept.
 *
 * Today that's Upstash Redis over its REST API (works on Vercel, and on Cloudflare Workers since
 * it's plain `fetch`), or an in-memory map for local dev and tests. A Durable Object storage
 * adapter can implement the same interface later without touching lobby or game code.
 */
export interface RoomStorage {
  readonly kind: 'memory' | 'upstash';
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Set only if the key doesn't exist. Returns true when this call created it. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Delete only if the key still holds `value` (used to release locks safely). */
  delIfEquals(key: string, value: string): Promise<void>;
  hset(key: string, field: string, value: string, ttlSeconds: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}

type Entry = { value: string; expiresAt: number };
type HashEntry = { fields: Map<string, string>; expiresAt: number };

export class MemoryStorage implements RoomStorage {
  readonly kind = 'memory' as const;
  private strings = new Map<string, Entry>();
  private hashes = new Map<string, HashEntry>();
  constructor(private now: () => number = Date.now) {}

  private live<T extends { expiresAt: number }>(map: Map<string, T>, key: string): T | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      map.delete(key);
      return undefined;
    }
    return entry;
  }

  async get(key: string) {
    return this.live(this.strings, key)?.value ?? null;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.strings.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }
  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.live(this.strings, key)) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }
  async del(key: string) {
    this.strings.delete(key);
    this.hashes.delete(key);
  }
  async delIfEquals(key: string, value: string) {
    if (this.live(this.strings, key)?.value === value) this.strings.delete(key);
  }
  async hset(key: string, field: string, value: string, ttlSeconds: number) {
    const entry = this.live(this.hashes, key) ?? { fields: new Map(), expiresAt: 0 };
    entry.fields.set(field, value);
    entry.expiresAt = this.now() + ttlSeconds * 1000;
    this.hashes.set(key, entry);
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.live(this.hashes, key)?.fields ?? []);
  }
}

/** Upstash Redis REST client. Each call is one HTTP request; Upstash bills per command. */
export class UpstashStorage implements RoomStorage {
  readonly kind = 'upstash' as const;
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async command<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    const body = (await res.json()) as { result?: T; error?: string };
    if (!res.ok || body.error)
      throw new Error(`Upstash ${args[0]} failed: ${body.error ?? res.status}`);
    return body.result as T;
  }

  private async pipeline(commands: (string | number)[][]): Promise<void> {
    const res = await fetch(`${this.url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`);
  }

  get(key: string) {
    return this.command<string | null>(['GET', key]);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.command(['SET', key, value, 'EX', ttlSeconds]);
  }
  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return (
      (await this.command<string | null>(['SET', key, value, 'EX', ttlSeconds, 'NX'])) === 'OK'
    );
  }
  async del(key: string) {
    await this.command(['DEL', key]);
  }
  async delIfEquals(key: string, value: string) {
    await this.command([
      'EVAL',
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      key,
      value,
    ]);
  }
  async hset(key: string, field: string, value: string, ttlSeconds: number) {
    await this.pipeline([
      ['HSET', key, field, value],
      ['EXPIRE', key, ttlSeconds],
    ]);
  }
  async hgetall(key: string) {
    const flat = (await this.command<string[] | null>(['HGETALL', key])) ?? [];
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]!] = flat[i + 1]!;
    return out;
  }
}

export type StorageEnv = Record<string, string | undefined>;

/**
 * Pick a storage backend from environment variables. Accepts the names Vercel's Upstash
 * integration creates (KV_REST_API_*) or Upstash's own (UPSTASH_REDIS_REST_*).
 * Falls back to memory, which only works on a single long-lived process (local dev, tests).
 */
export function storageFromEnv(env: StorageEnv): RoomStorage {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashStorage(url, token);
  if (env.VERCEL === '1') {
    throw new Error(
      'No room storage configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN).',
    );
  }
  return new MemoryStorage();
}
