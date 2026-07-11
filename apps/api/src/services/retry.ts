// Simple retry with exponential backoff for idempotent external calls.

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Optional predicate — return false to stop retrying immediately. */
  retryIf?: (err: unknown) => boolean;
  /** Override delay for a given attempt (0-based). */
  delayForAttempt?: (attempt: number, err: unknown) => number;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8_000, retryIf, delayForAttempt } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (retryIf && !retryIf(err)) break;
      if (attempt === retries) break;
      const delay = delayForAttempt
        ? delayForAttempt(attempt, err)
        : Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}
