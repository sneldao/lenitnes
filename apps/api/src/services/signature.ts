import crypto from 'node:crypto';

// SPKI DER prefix for Ed25519: SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING { 0 unused bits } }
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function createEd25519PublicKey(publicKeyHex: string): crypto.KeyObject {
  const keyBytes = Buffer.from(publicKeyHex, 'hex');
  if (keyBytes.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length: ${keyBytes.length} (expected 32)`);
  }
  const spki = Buffer.concat([ED25519_SPKI_PREFIX, keyBytes]);
  return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
}

/** Verify an Ed25519 signature (hex) against a message. */
export function verifyEd25519(
  message: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    const publicKey = createEd25519PublicKey(publicKeyHex);
    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, signature);
  } catch {
    return false;
  }
}

/** Parse a LENITNES auth message and verify it is recent. */
export function isRecentAuthMessage(message: string, maxAgeMs = 5 * 60 * 1000): boolean {
  const match = message.match(/^lenitnes:auth:(\d+)$/);
  if (!match) return false;
  const ts = Number(match[1]);
  const now = Date.now();
  return !Number.isNaN(ts) && ts > now - maxAgeMs && ts <= now + 5000; // 5s clock skew tolerance
}
