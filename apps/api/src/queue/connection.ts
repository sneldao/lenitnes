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
