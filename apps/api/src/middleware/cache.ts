// Simple in-memory response cache with TTL + max size.
// For production, swap to Redis.

const MAX_SIZE = 500;

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

function evictStale(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

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
  if (store.size >= MAX_SIZE) {
    evictStale();
    if (store.size >= MAX_SIZE) {
      const oldest = store.keys().next().value;
      if (oldest) store.delete(oldest);
    }
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(pattern: string | RegExp): void {
  for (const key of store.keys()) {
    if (typeof pattern === 'string' ? key.startsWith(pattern) : pattern.test(key)) {
      store.delete(key);
    }
  }
}
