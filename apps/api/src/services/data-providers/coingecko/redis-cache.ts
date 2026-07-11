import type { PricePoint } from '../types.js';
import { createRedisClient } from '../../../queue/connection.js';
import { logger } from '../../../logger.js';

const PRICE_SERIES_TTL_SEC = 7 * 24 * 60 * 60;

type RedisClient = Awaited<ReturnType<typeof createRedisClient>>;
let client: RedisClient | null = null;

async function getClient(): Promise<RedisClient> {
  if (!client) {
    client = await createRedisClient({
      socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
    });
    client.on('error', (err: Error) => {
      logger.debug({ err }, 'coingecko redis cache: client error');
    });
    await client.connect();
  }
  return client;
}

function seriesKey(coingeckoId: string, fromUnix: number, toUnix: number): string {
  return `cg:series:${coingeckoId}:${fromUnix}:${toUnix}`;
}

export async function getCachedPriceSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
): Promise<PricePoint[] | null> {
  try {
    const redis = await getClient();
    const raw = await redis.get(seriesKey(coingeckoId, fromUnix, toUnix));
    if (!raw) return null;
    return JSON.parse(raw) as PricePoint[];
  } catch (err) {
    logger.debug({ err, coingeckoId }, 'coingecko redis cache: get failed');
    return null;
  }
}

export async function setCachedPriceSeries(
  coingeckoId: string,
  fromUnix: number,
  toUnix: number,
  points: PricePoint[],
): Promise<void> {
  try {
    const redis = await getClient();
    await redis.setEx(
      seriesKey(coingeckoId, fromUnix, toUnix),
      PRICE_SERIES_TTL_SEC,
      JSON.stringify(points),
    );
  } catch (err) {
    logger.debug({ err, coingeckoId }, 'coingecko redis cache: set failed');
  }
}
