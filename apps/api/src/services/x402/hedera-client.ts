// ─────────────────────────────────────────────────────────────
// Hedera client for the x402 self-facilitator.
//
// Distinct from proof-hedera.ts (which notarizes signals to HCS via
// hedera-agent-kit tools) — this is a thin, direct @hashgraph/sdk
// client used to (a) verify signed TransferTransactions and
// (b) settle them on testnet. Both share the same operator account
// (the merchant/payee = HEDERA_OPERATOR_ID).
// ─────────────────────────────────────────────────────────────

import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { logger } from '../../logger.js';

let _client: Client | null = null;

function parseOperatorKey(raw: string, keyType: string): PrivateKey {
  const t = (keyType ?? 'ecdsa').toLowerCase();
  if (t === 'ed25519') return PrivateKey.fromStringED25519(raw);
  if (t === 'ecdsa') return PrivateKey.fromStringECDSA(raw);
  return PrivateKey.fromString(raw);
}

export interface HederaClientConfig {
  network: string;
  operatorId: string;
  operatorKey: string;
  operatorKeyType: string;
}

/**
 * Lazily build (and memoize) a Hedera Client for the facilitator.
 * Throws if operator credentials are missing — callers should gate
 * on isHederaConfigured() first.
 */
export function getHederaClient(cfg: HederaClientConfig): Client {
  if (_client) return _client;
  const client = cfg.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorKey = parseOperatorKey(cfg.operatorKey, cfg.operatorKeyType);
  client.setOperator(AccountId.fromString(cfg.operatorId), operatorKey);
  logger.info(
    { operatorId: cfg.operatorId, network: cfg.network },
    'x402 hedera facilitator client ready',
  );
  _client = client;
  return client;
}

export function isHederaConfigured(cfg: HederaClientConfig): boolean {
  return Boolean(cfg.operatorId && cfg.operatorKey);
}

/** Close the memoized client (tests). */
export function closeHederaClient(): void {
  if (_client) {
    _client.close();
    _client = null;
  }
}
