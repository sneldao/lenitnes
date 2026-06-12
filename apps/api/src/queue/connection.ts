import { config } from '../config.js';

export function getRedisConnectionOpts() {
  const url = new URL(config.redis.url);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
  };
}

export async function createRedisClient() {
  const { createClient } = await import('redis');
  return createClient({ url: config.redis.url });
}

export async function pingRedis(timeoutMs = 1500): Promise<boolean> {
  const client = await createRedisClient();
  client.on('error', () => {});
  try {
    await client.connect();
    const pong = await Promise.race([
      client.ping(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return pong === 'PONG';
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
