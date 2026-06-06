// Simple in-memory response cache with TTL.
// For production, swap to Redis.

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet(key: string, data: unknown, ttlMs = 60_000): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(pattern: string | RegExp): void {
  for (const key of store.keys()) {
    if (typeof pattern === 'string' ? key.startsWith(pattern) : pattern.test(key)) {
      store.delete(key);
    }
  }
}
