import { createConnection } from 'node:net';
import { config } from '../config.js';

export function getRedisUrl(): string {
  return config.redis.url;
}

export function getRedisConnectionOpts() {
  return {
    host: new URL(config.redis.url).hostname,
    port: Number(new URL(config.redis.url).port) || 6379,
  };
}

/**
 * Cheap reachability check for Redis — opens a TCP socket to the configured
 * host:port and immediately closes it. Used by /health/ready. A successful
 * socket open does not prove Redis is healthy, but it does prove the
 * process can talk to its broker.
 */
export async function checkRedisReachable(timeoutMs = 1500): Promise<boolean> {
  const url = new URL(config.redis.url);
  return new Promise((resolve) => {
    const sock = createConnection({
      host: url.hostname,
      port: Number(url.port) || 6379,
    });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    sock.once('connect', () => {
      clearTimeout(timer);
      done(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      done(false);
    });
  });
}
