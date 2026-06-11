import crypto from 'node:crypto';
import { PublicKey } from '@hashgraph/sdk';

// HIP-820 / hedera-wallet-connect message prefix (mirrors Ethereum's personal_sign).
// Wallets like HashPack and Kabila sign `prefix + message`, not the raw message.
function prefixMessageToSign(message: string): Uint8Array {
  return Buffer.from('\x19Hedera Signed Message:\n' + message.length + message, 'utf8');
}

/**
 * Verify a wallet signature against a message, supporting:
 * - Ed25519 and ECDSA(secp256k1) public keys (via Hedera SDK)
 * - HIP-820 prefixed messages (HashPack, Kabila via WalletConnect) and raw messages
 */
export function verifyWalletSignature(
  message: string,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  let publicKey: PublicKey;
  try {
    publicKey = PublicKey.fromString(publicKeyHex);
  } catch {
    return false;
  }
  let signature: Uint8Array;
  try {
    signature = Buffer.from(signatureHex, 'hex');
  } catch {
    return false;
  }
  try {
    if (publicKey.verify(prefixMessageToSign(message), signature)) return true;
  } catch {
    // fall through to raw verification
  }
  try {
    return publicKey.verify(Buffer.from(message, 'utf8'), signature);
  } catch {
    return false;
  }
}

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
