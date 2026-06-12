/**
 * Cross-instance cache invalidation bus. When REDIS_CACHE_PUPSUB is enabled,
 * `publishInvalidation(pattern)` broadcasts a Redis pubsub message; the
 * subscriber drops the matching keys from its own local cache. This closes
 * the cross-replica consistency gap that the in-memory `cache` module
 * otherwise has.
 *
 * Failures are swallowed: the local invalidation in `cache.ts` is the
 * authoritative path; the pubsub layer is purely additive.
 */

import { config } from '../config.js';

const CHANNEL = 'lenitnes:cache:invalidate';

let _publisher: {
  publish: (ch: string, msg: string) => Promise<unknown>;
  quit: () => Promise<unknown>;
} | null = null;
let _subscriber: {
  subscribe: (ch: string, cb: (msg: string) => void) => Promise<unknown>;
  quit: () => Promise<unknown>;
} | null = null;
let _started = false;

function isEnabled(): boolean {
  return (process.env.REDIS_CACHE_PUPSUB ?? '').toLowerCase() === 'true';
}

async function getPublisher() {
  if (_publisher) return _publisher;
  // Lazy import so this module is cheap to load when the feature is off.
  const { createClient } = await import('redis');
  const client = createClient({ url: config.redis.url });
  client.on('error', () => {
    /* swallow — we never want logging here to take down a request */
  });
  await client.connect();
  _publisher = client;
  return client;
}

async function getSubscriber() {
  if (_subscriber) return _subscriber;
  const { createClient } = await import('redis');
  const client = createClient({ url: config.redis.url });
  client.on('error', () => {
    /* swallow */
  });
  await client.connect();
  _subscriber = client;
  return client;
}

/**
 * Broadcast a cache invalidation to all peer API instances. Best-effort;
 * throws are caught at the call site in `cache.ts`.
 */
export async function publishInvalidation(pattern: string): Promise<void> {
  if (!isEnabled()) return;
  try {
    const pub = await getPublisher();
    await pub.publish(CHANNEL, pattern);
  } catch {
    /* ignore — local invalidation already happened */
  }
}

/**
 * Subscribe to invalidation messages and drop matching keys from the local
 * cache. Idempotent. Should be called once at process startup.
 */
export async function startInvalidationSubscriber(
  onInvalidate: (pattern: string) => void,
): Promise<void> {
  if (_started || !isEnabled()) return;
  _started = true;
  try {
    const sub = await getSubscriber();
    await sub.subscribe(CHANNEL, (msg: string) => {
      try {
        onInvalidate(msg);
      } catch {
        /* ignore a single bad message */
      }
    });
  } catch {
    /* subscriber failed to start — local cache still works */
  }
}

/** Cleanly close the redis clients (for graceful shutdown). */
export async function stopInvalidationBus(): Promise<void> {
  try {
    await _publisher?.quit();
  } catch {
    /* ignore */
  }
  try {
    await _subscriber?.quit();
  } catch {
    /* ignore */
  }
  _publisher = null;
  _subscriber = null;
  _started = false;
}
