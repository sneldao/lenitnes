/**
 * Vitest setup — runs before every test file.
 * Ensures required env vars are present so modules that read config at
 * import time (config.ts, pool.ts, etc.) don't crash before the test body
 * executes. Day 13: placeholders match the zod schema in config-schema.ts
 * (64-hex-char for the 32-byte secrets).
 */
process.env.ENCRYPTION_KEY ??= 'a'.repeat(64);
process.env.JWT_SECRET ??= 'b'.repeat(64);
process.env.WEBHOOK_SECRET ??= 'c'.repeat(64);
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/lenitnes-test';
process.env.NODE_ENV ??= 'test';
