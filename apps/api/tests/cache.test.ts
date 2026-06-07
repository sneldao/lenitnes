import { describe, it, expect, vi } from 'vitest';
import { cacheGet, cacheSet, cacheInvalidate } from '../src/middleware/cache.js';

describe('In-memory cache', () => {
  it('stores and retrieves a value', () => {
    cacheSet('key', { foo: 'bar' }, 1_000);
    expect(cacheGet('key')).toEqual({ foo: 'bar' });
  });

  it('returns undefined for missing key', () => {
    expect(cacheGet('missing')).toBeUndefined();
  });

  it('expires entries after TTL', () => {
    vi.useFakeTimers();
    cacheSet('ttl-key', 'value', 100);
    expect(cacheGet('ttl-key')).toBe('value');
    vi.advanceTimersByTime(101);
    expect(cacheGet('ttl-key')).toBeUndefined();
    vi.useRealTimers();
  });

  it('invalidates by pattern', () => {
    cacheSet('monitors:u1:0:50', [{ id: '1' }], 1_000);
    cacheSet('monitors:u1:50:50', [{ id: '2' }], 1_000);
    cacheSet('orders:u1:50:0', [{ id: '3' }], 1_000);

    cacheInvalidate('monitors:u1:');

    expect(cacheGet('monitors:u1:0:50')).toBeUndefined();
    expect(cacheGet('monitors:u1:50:50')).toBeUndefined();
    expect(cacheGet('orders:u1:50:0')).toEqual([{ id: '3' }]);
  });
});
