import { config } from '../config.js';
import type { RedisClientOptions } from 'redis';

export function getRedisConnectionOpts() {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
}

export async function createRedisClient(options?: Partial<RedisClientOptions>) {
  const { createClient } = await import('redis');
  return createClient({ url: config.redis.url, ...options });
}

export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  // Disable reconnection and bound the connect: a dead/unreachable/unauthed
  // broker must fail fast instead of retrying in the background, which would
  // hang the health probe. The timeout race also covers connect(), not just
  // ping(), so a stalled handshake can't exceed timeoutMs.
  const client = await createRedisClient({
    socket: { reconnectStrategy: false, connectTimeout: timeoutMs },
  });
  client.on('error', () => {});
  try {
    const result = await Promise.race([
      (async () => {
        await client.connect();
        return client.ping();
      })(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result === 'PONG';
  } catch {
    return false;
  } finally {
    try {
      await client.quit();
    } catch {
      /* ignore cleanup failure */
    }
  }
}
