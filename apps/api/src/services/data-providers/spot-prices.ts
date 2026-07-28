// ─────────────────────────────────────────────────────────────
// Spot price hub — the single source for "current USD price" data.
//
// Why this exists: every consumer (TP/SL loop, portfolio P&L, Propr
// sizing, entry-price writes) used to call CoinGecko's per-asset
// market_chart/range endpoint for "price right now". With a 5-minute
// TP/SL tick across 5 open positions that is thousands of range calls
// per day against a free/demo-tier key — which is exactly how the
// system got itself permanently 429'd and every live trade declined
// with "no mark price".
//
// The hub instead batches ALL assets into ONE CoinMarketCap
// quotes/latest call per refresh cycle (1 credit for the whole
// watchlist), stores results in Redis (shared across api + worker
// containers) with 3× the refresh interval as TTL, and serves every
// consumer from cache. CoinGecko remains the historical-series
// oracle for "price at <past timestamp>" lookups.
//
// Failure semantics: hub answers return null when unavailable. All
// consumers already treat a null price as "defer / decline to paper"
// — this file never throws.
// ─────────────────────────────────────────────────────────────

import { query } from '../../db/pool.js';
import { getSharedRedis } from '../redis-client.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { cmcProvider } from './cmc/index.js';
import { toCmcSymbol } from './asset-map.js';

type RedisClient = NonNullable<Awaited<ReturnType<typeof getSharedRedis>>>;

async function getClient(): Promise<RedisClient | null> {
  return getSharedRedis('spot-prices');
}

function redisKey(coingeckoId: string): string {
  return `spot:usd:${coingeckoId.toLowerCase()}`;
}
const LOCK_KEY = 'spot:refresh-lock';
const LOCK_TTL_SEC = 45;
/** Meta row so ops can see when the hub last refreshed. */
const META_KEY = 'spot:usd:__meta__';

// L1: same-process memory cache. TTL = refresh interval + 60s of slop
// so a slightly-late refresh doesn't cause thundering herd on CMC.
const memoryCache = new Map<string, { price: number; expiresAt: number }>();

function memoryTtlMs(): number {
  return config.pricing.spotRefreshSeconds * 1000 + 60_000;
}

function redisTtlSec(): number {
  return config.pricing.spotRefreshSeconds * 3;
}

/**
 * Batch-refresh the hub from CMC for a set of coingecko ids. Single
 * flight (module-level) + cross-process NX lock: at most one CMC call
 * in flight across all containers.
 */
let inflight: Promise<Map<string, number>> | null = null;

export async function refreshSpotPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
  const unique = Array.from(new Set(coingeckoIds.map((s) => s.toLowerCase()).filter(Boolean)));
  if (unique.length === 0) return new Map();
  if (inflight) return inflight;

  inflight = (async () => {
    const redis = await getClient().catch(() => null);
    if (redis) {
      try {
        const locked = await redis.set(LOCK_KEY, String(Date.now()), {
          NX: true,
          EX: LOCK_TTL_SEC,
        });
        if (locked !== 'OK') {
          logger.debug('spot hub: another process is refreshing — skipping');
          return new Map();
        }
      } catch {
        /* lock best-effort */
      }
    }

    const prices = new Map<string, number>();
    try {
      const symbols = unique.map(toCmcSymbol);
      // cmcProvider.getQuotes is spend-guarded: when the CMC budget is
      // exhausted this throws SpendGuardError and we just keep stale data.
      const quotes = await cmcProvider.getQuotes(symbols);
      const bySymbol = new Map(quotes.map((q) => [q.symbol, q.quote?.USD?.price]));
      for (let i = 0; i < unique.length; i++) {
        const price = bySymbol.get(symbols[i]!);
        if (typeof price === 'number' && price > 0) prices.set(unique[i]!, price);
      }

      if (redis && prices.size > 0) {
        try {
          const ttl = redisTtlSec();
          const tx = redis.multi();
          const nowIso = new Date().toISOString();
          for (const [id, price] of prices) {
            tx.set(redisKey(id), String(price), { EX: ttl });
          }
          tx.set(META_KEY, JSON.stringify({ updatedAt: nowIso, assets: prices.size }), {
            EX: ttl,
          });
          await tx.exec();
        } catch (err) {
          logger.warn({ err }, 'spot hub: redis write failed (memory-only this cycle)');
        }
      }

      const now = Date.now();
      for (const [id, price] of prices) {
        memoryCache.set(id, { price, expiresAt: now + memoryTtlMs() });
      }

      const missing = unique.filter((id) => !prices.has(id));
      logger.info(
        { assets: prices.size, missing: missing.length > 0 ? missing : undefined },
        'spot hub: refresh complete',
      );
      return prices;
    } catch (err) {
      logger.warn({ err }, 'spot hub: refresh failed — consumers serve stale or null');
      return prices; // possibly partial/empty — never throw
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Latest USD price for a coingecko id. Order: L1 memory → Redis →
 * targeted single-asset CMC fetch. Returns null when nothing knows
 * (callers treat null as defer/decline — never throws).
 */
export async function getLatestUsdPrice(coingeckoId: string): Promise<number | null> {
  const id = coingeckoId.toLowerCase();

  const mem = memoryCache.get(id);
  if (mem && mem.expiresAt > Date.now()) return mem.price;

  const redis = await getClient().catch(() => null);
  if (redis) {
    try {
      const raw = await redis.get(redisKey(id));
      if (raw != null) {
        const price = Number(raw);
        if (Number.isFinite(price) && price > 0) {
          memoryCache.set(id, { price, expiresAt: Date.now() + memoryTtlMs() });
          return price;
        }
      }
    } catch {
      /* fall through to targeted refresh */
    }
  }

  // Lazy path: hub never warmed for this asset (fresh boot, new asset).
  const refreshed = await refreshSpotPrices([id]);
  return refreshed.get(id) ?? null;
}

/** Read-only meta for ops (when did the hub last refresh). */
export async function spotHubMeta(): Promise<{ updatedAt: string; assets: number } | null> {
  const redis = await getClient().catch(() => null);
  if (!redis) return null;
  try {
    const raw = await redis.get(META_KEY);
    return raw ? (JSON.parse(raw) as { updatedAt: string; assets: number }) : null;
  } catch {
    return null;
  }
}

/**
 * Refresh the hub for every asset the system currently cares about:
 * distinct coingeckoIds from monitor asset mappings ∪ open positions.
 * This is the scheduler entrypoint.
 */
export async function refreshSpotPricesFromDb(): Promise<number> {
  try {
    const { rows } = await query<{ id: string }>(
      `SELECT DISTINCT asset_mapping->>'coingeckoId' AS id
         FROM monitors
        WHERE status IN ('active', 'triggered')
          AND asset_mapping->>'coingeckoId' IS NOT NULL
        UNION
       SELECT DISTINCT asset AS id FROM positions WHERE status = 'open'`,
    );
    const ids = rows.map((r) => r.id).filter((x): x is string => !!x);
    if (ids.length === 0) return 0;
    await refreshSpotPrices(ids);
    return ids.length;
  } catch (err) {
    logger.warn({ err }, 'spot hub: db-driven refresh failed');
    return 0;
  }
}

/** Test hook: clear L1 cache + reset the single-flight handle. */
export function resetSpotHubForTests(): void {
  memoryCache.clear();
  inflight = null;
}
