// ─────────────────────────────────────────────────────────────
// Upstream API spend guard — the "no more surprise invoices" layer.
//
// Every paid/rate-limited provider call routes through tryConsume()
// BEFORE the HTTP request fires. Counters are per UTC day and live in
// Redis so the api + worker containers share one budget (memory
// fallback when Redis is down — per-process, still better than none).
//
// Design rules:
//   • Fail CLOSED for paid providers: no budget left → the call throws
//     SpendGuardError before a single request leaves the box.
//   • A budget of 0 means "provider disabled" — this is how TinyFish is
//     retired without deleting the integration code.
//   • Exhaustion logs once per provider per day (not per call), at
//     error level so the dead-man's switch / operator sees it.
// ─────────────────────────────────────────────────────────────

import { getSharedRedis } from './redis-client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export type SpendProvider = 'coingecko' | 'cmc' | 'tinyfish';

export class SpendGuardError extends Error {
  constructor(
    public readonly provider: SpendProvider,
    message: string,
  ) {
    super(message);
    this.name = 'SpendGuardError';
  }
}

const COUNTER_TTL_SEC = 60 * 60 * 48; // daily key, keep 2 days for debugging

function dayKey(provider: SpendProvider): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `spend:${provider}:${day}`;
}

function dailyCap(provider: SpendProvider): number {
  switch (provider) {
    case 'coingecko':
      return config.apiBudget.coingeckoPerDay;
    case 'cmc':
      return config.apiBudget.cmcPerDay;
    case 'tinyfish':
      return config.apiBudget.tinyfishPerDay;
  }
}

type RedisClient = NonNullable<Awaited<ReturnType<typeof getSharedRedis>>>;

async function getClient(): Promise<RedisClient | null> {
  return getSharedRedis('spend-guard');
}

// Per-process memory fallback. Intentionally simple: Redis being down
// means BullMQ is down too, so the worker can't run anyway.
const memoryCounters = new Map<string, number>();

function memoryConsume(key: string): number {
  const next = (memoryCounters.get(key) ?? 0) + 1;
  memoryCounters.set(key, next);
  return next;
}

// Log-once-per-provider-per-day so exhaustion is one loud line, not a flood.
const exhaustedLogged = new Set<string>();

/**
 * Consume one unit of the provider's daily budget. Throws
 * SpendGuardError when the budget is exhausted or disabled (cap 0).
 */
export async function tryConsume(provider: SpendProvider): Promise<void> {
  const cap = dailyCap(provider);
  const key = dayKey(provider);

  let todayCount: number;
  if (cap <= 0) {
    todayCount = Number.POSITIVE_INFINITY;
  } else {
    const redis = await getClient().catch(() => null);
    if (redis) {
      try {
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, COUNTER_TTL_SEC);
        todayCount = n;
      } catch {
        todayCount = memoryConsume(key);
      }
    } else {
      todayCount = memoryConsume(key);
    }
  }

  if (cap <= 0 || todayCount === Number.POSITIVE_INFINITY || todayCount > cap) {
    if (!exhaustedLogged.has(key)) {
      exhaustedLogged.add(key);
      logger.error(
        { provider, cap },
        cap <= 0
          ? `spend guard: ${provider} is DISABLED (daily budget 0) — refusing call`
          : `spend guard: ${provider} daily budget exhausted (${cap}/day) — failing closed`,
      );
    }
    throw new SpendGuardError(
      provider,
      cap <= 0
        ? `${provider} disabled by spend guard (daily budget 0)`
        : `${provider} daily budget exhausted (${cap}/day)`,
    );
  }
}

/** For ops dashboards / tests: calls used today (UTC) per provider. */
export async function spendUsedToday(provider: SpendProvider): Promise<number> {
  const key = dayKey(provider);
  const redis = await getClient().catch(() => null);
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? Number(raw) : 0;
    } catch {
      /* fall through to memory */
    }
  }
  return memoryCounters.get(key) ?? 0;
}

/** Test hook: reset all counters (shared Redis is reset separately). */
export async function resetSpendGuardForTests(): Promise<void> {
  memoryCounters.clear();
  exhaustedLogged.clear();
}
