import { describe, it, expect } from 'vitest';

// Set encryption key before importing the module so config picks it up.
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encrypt, decrypt } = await import('../src/services/crypto.js');

describe('AES-256-GCM encryption', () => {
  it('round-trips plaintext', () => {
    const plain = 'kraken-api-secret-123';
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(decrypt(enc)).toBe(plain);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plain = 'same';
    const a = encrypt(plain);
    const b = encrypt(plain);
    expect(a).not.toBe(b);
  });

  it('fails with tampered ciphertext', () => {
    const enc = encrypt('secret');
    const tampered = enc.slice(0, -3) + 'xxx';
    expect(() => decrypt(tampered)).toThrow();
  });

  it('handles unicode', () => {
    const plain = 'hbar-🔒-日本語';
    const enc = encrypt(plain);
    expect(decrypt(enc)).toBe(plain);
  });
});
