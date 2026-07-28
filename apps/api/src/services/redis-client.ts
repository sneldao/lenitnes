// ─────────────────────────────────────────────────────────────
// Shared best-effort Redis client for caches + spend counters.
//
// Requirements that shaped this:
//   • Fast-fail: when Redis is unreachable, resolve to null within
//     ~1s — NEVER stall a signal check, a price fetch, or a test run
//     on a connect retry loop.
//   • Self-heal: a transient Redis outage (compose restart) must not
//     permanently disable the shared caches — re-attempt the connect
//     after a cooldown instead of latching `broken` forever.
//   • One client per consumer module: callers namespace their own
//     keys; the client itself is shared per module name.
// ─────────────────────────────────────────────────────────────

import { createRedisClient } from '../queue/connection.js';

export type MaybeRedisClient = Awaited<ReturnType<typeof createRedisClient>> | null;

const CONNECT_TIMEOUT_MS = 1_000;
const RETRY_COOLDOWN_MS = 60_000;

interface Entry {
  client: MaybeRedisClient;
  brokenUntilMs: number;
}

const entries = new Map<string, Entry>();

/**
 * Get the shared Redis client for a consumer namespace. Returns null
 * when Redis is currently unreachable. Re-attempts at most once per
 * RETRY_COOLDOWN_MS after a failure.
 */
export async function getSharedRedis(namespace: string): Promise<MaybeRedisClient> {
  const entry = entries.get(namespace) ?? { client: null, brokenUntilMs: 0 };
  if (entry.client) return entry.client;
  if (Date.now() < entry.brokenUntilMs) return null;

  try {
    const client = await createRedisClient({
      socket: {
        reconnectStrategy: (retries) => (retries > 1 ? false : 200),
        connectTimeout: CONNECT_TIMEOUT_MS,
      },
    });
    client.on('error', () => {});
    await client.connect();
    entry.client = client;
    entry.brokenUntilMs = 0;
    entries.set(namespace, entry);
    return client;
  } catch {
    entry.client = null;
    entry.brokenUntilMs = Date.now() + RETRY_COOLDOWN_MS;
    entries.set(namespace, entry);
    return null;
  }
}

/** Test hook: forget all clients and mark them broken (no Redis in tests). */
export async function resetSharedRedisForTests(): Promise<void> {
  for (const entry of entries.values()) {
    if (entry.client) {
      try {
        await entry.client.quit();
      } catch {
        /* best effort */
      }
    }
    entry.client = null;
    entry.brokenUntilMs = Number.POSITIVE_INFINITY;
  }
}
