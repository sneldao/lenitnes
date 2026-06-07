import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyEd25519, isRecentAuthMessage } from '../src/services/signature.js';

function generateEd25519Pair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  // Strip SPKI prefix (48 bytes) to get raw 32-byte public key.
  return { publicKey: publicKey.slice(12).toString('hex'), privateKey: privateKey.toString('hex') };
}

function signEd25519(message: string, privateKeyHex: string): string {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  return crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex');
}

describe('verifyEd25519', () => {
  it('verifies a valid signature', () => {
    const pair = generateEd25519Pair();
    const message = 'lenitnes:auth:1717700000000';
    const sig = signEd25519(message, pair.privateKey);
    expect(verifyEd25519(message, sig, pair.publicKey)).toBe(true);
  });

  it('rejects a tampered message', () => {
    const pair = generateEd25519Pair();
    const message = 'lenitnes:auth:1717700000000';
    const sig = signEd25519(message, pair.privateKey);
    expect(verifyEd25519(message + 'x', sig, pair.publicKey)).toBe(false);
  });

  it('rejects a wrong public key', () => {
    const pair = generateEd25519Pair();
    const other = generateEd25519Pair();
    const message = 'lenitnes:auth:1717700000000';
    const sig = signEd25519(message, pair.privateKey);
    expect(verifyEd25519(message, sig, other.publicKey)).toBe(false);
  });

  it('returns false on malformed hex', () => {
    expect(verifyEd25519('msg', 'not-hex', 'also-not-hex')).toBe(false);
  });
});

describe('isRecentAuthMessage', () => {
  it('accepts a recent timestamp', () => {
    const ts = Date.now() - 30_000;
    expect(isRecentAuthMessage(`lenitnes:auth:${ts}`)).toBe(true);
  });

  it('rejects an old timestamp', () => {
    const ts = Date.now() - 10 * 60 * 1000;
    expect(isRecentAuthMessage(`lenitnes:auth:${ts}`)).toBe(false);
  });

  it('rejects a future timestamp beyond tolerance', () => {
    const ts = Date.now() + 10_000;
    expect(isRecentAuthMessage(`lenitnes:auth:${ts}`)).toBe(false);
  });

  it('rejects non-matching format', () => {
    expect(isRecentAuthMessage('hello')).toBe(false);
    expect(isRecentAuthMessage('lenitnes:login:123')).toBe(false);
  });
});
