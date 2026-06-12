// Simple in-memory response cache with TTL + max size.
// For production with multiple replicas, enable REDIS_CACHE_PUBSUB so
// invalidations are broadcast to every instance (see `cacheBus` below).

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

/**
 * Drop local cache entries and (if REDIS_CACHE_PUPSUB is enabled) publish
 * the invalidation pattern to a Redis channel so peer API instances can
 * drop their copies too. The pubsub path is best-effort: if Redis is
 * unreachable, the local invalidation still happens.
 */
export function cacheInvalidate(pattern: string | RegExp): void {
  for (const key of store.keys()) {
    if (typeof pattern === 'string' ? key.startsWith(pattern) : pattern.test(key)) {
      store.delete(key);
    }
  }
  // Lazy-import the bus so this module stays free of a hard Redis dep
  // when the feature flag is off (single-instance deployments).
  void import('./cacheBus.js')
    .then((m) => m.publishInvalidation(patternToString(pattern)))
    .catch(() => {
      /* pubsub not configured or Redis down — local invalidation is enough */
    });
}

function patternToString(p: string | RegExp): string {
  return typeof p === 'string' ? p : p.source;
}
