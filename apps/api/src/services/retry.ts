// Simple retry with exponential backoff for idempotent external calls.

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8_000 } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}
