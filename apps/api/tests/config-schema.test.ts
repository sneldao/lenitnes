// ─────────────────────────────────────────────────────────────
// Config-schema validation tests. Day 13.
// The api boots through validateEnv() at config-load time, so
// schema bugs surface as 'all tests fail at import'. These
// tests pin the contract independently of the api's runtime.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';
import { envSchema, validateEnv } from '../src/config-schema.js';

const BASE_VALID_ENV: NodeJS.ProcessEnv = {
  JWT_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: 'b'.repeat(32),
  WEBHOOK_SECRET: 'c'.repeat(32),
};

describe('envSchema — happy path', () => {
  it('accepts the bare minimum (3 secrets) and fills defaults for the rest', () => {
    const result = envSchema.parse(BASE_VALID_ENV);
    expect(result.NODE_ENV).toBe('development');
    expect(result.API_PORT).toBe(4000);
    expect(result.WEB_ORIGIN).toBe('http://localhost:3000');
    // Raised from 70 → 80 on 2026-06-26 after the first conviction
    // cohort showed 0% win rate at 70+. Re-evaluate after the
    // settling delay + threshold bump runs for a few weeks.
    expect(result.CONVICTION_THRESHOLD).toBe(80);
    expect(result.MIN_COMMIT_AGE_MINUTES).toBe(30);
    expect(result.DAILY_AGENT_BUDGET_USD).toBe(20);
    expect(result.TREASURY_MODE).toBe('paper');
    expect(result.TREASURY_DEFAULT_CHAIN).toBe('arbitrum');
    expect(result.X402_ENABLED).toBe(false);
    expect(result.TWAK_ENABLED).toBe(false);
    expect(result.MOCK_AGENT).toBe(false);
  });

  it('parses boolean flags from "true" / "1" / undefined', () => {
    // X402_ENABLED=true requires X402_PRIVATE_KEY (cross-field rule);
    // satisfy both to assert the boolean parse in isolation.
    expect(
      envSchema.parse({ ...BASE_VALID_ENV, X402_ENABLED: 'true', X402_PRIVATE_KEY: '0xabc' })
        .X402_ENABLED,
    ).toBe(true);
    expect(envSchema.parse({ ...BASE_VALID_ENV, TWAK_ENABLED: '1' }).TWAK_ENABLED).toBe(false);
    expect(
      envSchema.parse({ ...BASE_VALID_ENV, REDIS_CACHE_PUPSUB: 'true' }).REDIS_CACHE_PUPSUB,
    ).toBe(true);
  });

  it('parses numeric env vars (API_PORT, chain ids, slippage bps)', () => {
    const r = envSchema.parse({ ...BASE_VALID_ENV, API_PORT: '8742', BNB_CHAIN_ID: '97' });
    expect(r.API_PORT).toBe(8742);
    expect(r.BNB_CHAIN_ID).toBe(97);
  });

  it('rejects out-of-range integers (CONVICTION_THRESHOLD > 100, port 0)', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, CONVICTION_THRESHOLD: '150' })).toThrow();
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, API_PORT: '0' })).toThrow();
  });

  it('rejects malformed EVM addresses (ARB_SIGNAL_REGISTRY_ADDRESS)', () => {
    expect(() =>
      envSchema.parse({ ...BASE_VALID_ENV, ARB_SIGNAL_REGISTRY_ADDRESS: 'not-an-address' }),
    ).toThrow();
    // Empty string is allowed (signals 'not configured yet')
    expect(
      envSchema.parse({ ...BASE_VALID_ENV, ARB_SIGNAL_REGISTRY_ADDRESS: '' })
        .ARB_SIGNAL_REGISTRY_ADDRESS,
    ).toBe('');
    // Valid 0x address is allowed
    expect(
      envSchema.parse({
        ...BASE_VALID_ENV,
        ARB_SIGNAL_REGISTRY_ADDRESS: '0x05177fa11543cEB73cb18883DFb49B17dc23C862',
      }).ARB_SIGNAL_REGISTRY_ADDRESS,
    ).toBe('0x05177fa11543cEB73cb18883DFb49B17dc23C862');
  });
});

describe('envSchema — required secrets', () => {
  it('rejects missing JWT_SECRET', () => {
    const { JWT_SECRET, ...rest } = BASE_VALID_ENV;
    void JWT_SECRET;
    expect(() => envSchema.parse(rest)).toThrow(/JWT_SECRET/);
  });

  it('rejects too-short JWT_SECRET', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, JWT_SECRET: 'short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects empty WEBHOOK_SECRET', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, WEBHOOK_SECRET: '' })).toThrow();
  });
});

describe('envSchema — cross-field rules', () => {
  it('flags TWAK_ENABLED=true with no credentials', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, TWAK_ENABLED: 'true' })).toThrow(
      /TWAK_ACCESS_ID and TWAK_HMAC_SECRET/,
    );
  });

  it('accepts TWAK_ENABLED=true when both credentials are set', () => {
    expect(
      envSchema.parse({
        ...BASE_VALID_ENV,
        TWAK_ENABLED: 'true',
        TWAK_ACCESS_ID: 'abc',
        TWAK_HMAC_SECRET: 'def',
      }).TWAK_ENABLED,
    ).toBe(true);
  });

  it('flags X402_ENABLED=true with no private key', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, X402_ENABLED: 'true' })).toThrow(
      /X402_PRIVATE_KEY/,
    );
  });

  it('flags TREASURY_MODE=live without TREASURY_PRIVATE_KEY and not MOCK', () => {
    expect(() => envSchema.parse({ ...BASE_VALID_ENV, TREASURY_MODE: 'live' })).toThrow(
      /TREASURY_PRIVATE_KEY/,
    );
  });

  it('accepts TREASURY_MODE=live with MOCK_AGENT=1 (live trade blocked at runtime, but boot OK)', () => {
    expect(
      envSchema.parse({
        ...BASE_VALID_ENV,
        TREASURY_MODE: 'live',
        MOCK_AGENT: '1',
      }).TREASURY_MODE,
    ).toBe('live');
  });

  it('accepts TREASURY_MODE=live with TREASURY_PRIVATE_KEY set', () => {
    expect(
      envSchema.parse({
        ...BASE_VALID_ENV,
        TREASURY_MODE: 'live',
        TREASURY_PRIVATE_KEY: '0xabc',
      }).TREASURY_MODE,
    ).toBe('live');
  });
});

describe('validateEnv() — error formatting', () => {
  it('throws with all errors listed when multiple vars are missing', () => {
    expect(() => validateEnv({})).toThrow(/Environment validation failed \(3 issues\)/);
    expect(() => validateEnv({})).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({})).toThrow(/ENCRYPTION_KEY/);
    expect(() => validateEnv({})).toThrow(/WEBHOOK_SECRET/);
  });

  it('attaches the structured zod issues as .validationIssues on the error', () => {
    try {
      validateEnv({});
    } catch (err) {
      const issues = (err as Error & { validationIssues?: unknown[] }).validationIssues;
      expect(Array.isArray(issues)).toBe(true);
      expect((issues as unknown[]).length).toBe(3);
      return;
    }
    expect.fail('expected validateEnv({}) to throw');
  });
});
