/**
 * Vitest setup — runs before every test file.
 * Ensures required env vars are present so modules that read config at
 * import time (config.ts, pool.ts, etc.) don't crash before the test body
 * executes.
 */
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-long-enough-for-hs256';
process.env.WEBHOOK_SECRET ??= 'test-webhook-secret';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/lenitnes-test';
