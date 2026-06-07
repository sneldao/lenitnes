import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/services/retry.js';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const res = await withRetry(fn);
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries up to max and then throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, { retries: 2 })).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('succeeds on retry', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('ok');
    const res = await withRetry(fn, { retries: 2 });
    expect(res).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses exponential backoff', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { retries: 2, baseDelayMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    const res = await promise;

    expect(res).toBe('ok');
    vi.useRealTimers();
  });
});
