// ─────────────────────────────────────────────────────────────
// x402-over-Hedera shared constants & wire types.
//
// We implement a custom x402 scheme `exact-hedera` that settles in
// HBAR on the Hedera network (CAIP-2 `hedera:testnet`). It reuses
// the @x402/core V2 wire types (PaymentRequirements, PaymentPayload,
// SettleResponse) and the standard V2 base64 headers, but the
// verify/settle logic is self-facilitated against @hashgraph/sdk —
// the spec explicitly blesses self-facilitation inside the resource
// server.
// ─────────────────────────────────────────────────────────────

import type { PaymentRequirements, PaymentPayload } from '@x402/core/types';

/** The x402 scheme identifier we register. */
export const SCHEME = 'exact-hedera' as const;

/** CAIP-2 network identifier. */
export const NETWORK = 'hedera:testnet' as const;

/** CAIP family pattern for the facilitator signer grouping. */
export const CAIP_FAMILY = 'hedera:*' as const;

/** x402 protocol version (V2). */
export const X402_VERSION = 2 as const;

/** Settlement asset. */
export const ASSET = 'HBAR' as const;

/** HBAR decimals (1 HBAR = 100_000_000 tinybar). */
export const HBAR_DECIMALS = 8;

/**
 * Shape of the scheme-specific payload the client puts inside
 * `PaymentPayload.payload`. The signedTransaction is the hex-encoded
 * bytes of a fully-signed Hedera TransferTransaction.
 */
export interface ExactHederaPayload {
  /** Hex-encoded signed TransferTransaction bytes. */
  signedTransaction: string;
  /** The Hedera transaction id (0.0.x@seconds.nanos). */
  transactionId: string;
  /** The payer account id (0.0.x). */
  payer: string;
}

/**
 * Extra metadata we attach to every PaymentRequirements. The
 * `paymentReference` is a fresh UUID per 402 challenge and MUST be
 * used as the HBAR transfer memo — it is the replay-protection key.
 */
export interface ExactHederaExtra {
  paymentReference: string;
  description: string;
  mimeType: string;
  outputSchema: Record<string, unknown>;
  assetSymbol: string;
  assetDecimals: number;
}

/** A PaymentRequirements typed for our scheme. */
export type ExactHederaRequirements = PaymentRequirements & {
  scheme: typeof SCHEME;
  network: typeof NETWORK;
  asset: typeof ASSET;
  extra: ExactHederaExtra;
};

/** A PaymentPayload typed for our scheme. */
export type ExactHederaPayloadWire = PaymentPayload & {
  payload: ExactHederaPayload;
};

/** Per-resource price configuration. */
export interface ResourcePrice {
  resource: string;
  description: string;
  mimeType: string;
  /** Price in HBAR (decimal, e.g. 0.5). */
  priceHbar: number;
  outputSchema: Record<string, unknown>;
}

/** Convert HBAR (decimal) → tinybar (atomic units) integer. */
export function hbarToTinybar(hbar: number): bigint {
  return BigInt(Math.round(hbar * 1e8));
}

/** Build a HashScan transaction URL for a network. */
export function hashscanTxUrl(network: string, txId: string): string {
  const net = network.includes('mainnet') ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/transaction/${txId}`;
}

/** Build a HashScan account URL for a network. */
export function hashscanAccountUrl(network: string, accountId: string): string {
  const net = network.includes('mainnet') ? 'mainnet' : 'testnet';
  return `https://hashscan.io/${net}/account/${accountId}`;
}
