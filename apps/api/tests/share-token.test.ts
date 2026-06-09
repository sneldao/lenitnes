import { describe, expect, it } from 'vitest';

process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';

const { createSignalShareToken, verifySignalShareToken } =
  await import('../src/services/share-token.js');

describe('signal share tokens', () => {
  it('verifies the token generated for a signal id', () => {
    const signalId = '11111111-1111-4111-8111-111111111111';
    const token = createSignalShareToken(signalId);

    expect(verifySignalShareToken(signalId, token)).toBe(true);
  });

  it('rejects missing, malformed, or wrong-signal tokens', () => {
    const signalId = '11111111-1111-4111-8111-111111111111';
    const token = createSignalShareToken(signalId);

    expect(verifySignalShareToken(signalId, undefined)).toBe(false);
    expect(verifySignalShareToken(signalId, 'not-a-hex-token')).toBe(false);
    expect(verifySignalShareToken('22222222-2222-4222-8222-222222222222', token)).toBe(false);
  });
});
