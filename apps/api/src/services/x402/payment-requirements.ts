// ─────────────────────────────────────────────────────────────
// Builds the x402 PaymentRequirements for a protected resource.
//
// Each 402 challenge mints a fresh `paymentReference` (UUID v4) so
// the client must echo it as the HBAR transfer memo. That reference
// is the replay-protection key: a signed transaction whose memo
// matches an already-settled reference is rejected at settle time.
// ─────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { PaymentRequirements, PaymentRequired, ResourceInfo } from '@x402/core/types';
import {
  SCHEME,
  NETWORK,
  ASSET,
  HBAR_DECIMALS,
  X402_VERSION,
  hbarToTinybar,
  type ResourcePrice,
  type ExactHederaExtra,
  type ExactHederaRequirements,
} from './types.js';

export interface RequirementsConfig {
  /** Merchant (payee) account id, e.g. "0.0.9137770". */
  payTo: string;
  /** Max seconds the signed tx may stay valid. */
  maxTimeoutSeconds: number;
}

/**
 * Build a single PaymentRequirements object for a resource at a
 * given price. A fresh paymentReference is generated per call.
 */
export function buildRequirements(
  price: ResourcePrice,
  cfg: RequirementsConfig,
): ExactHederaRequirements {
  const paymentReference = randomUUID();
  const amount = hbarToTinybar(price.priceHbar).toString();
  const extra: ExactHederaExtra = {
    paymentReference,
    description: price.description,
    mimeType: price.mimeType,
    outputSchema: price.outputSchema,
    assetSymbol: ASSET,
    assetDecimals: HBAR_DECIMALS,
  };

  return {
    scheme: SCHEME,
    network: NETWORK,
    asset: ASSET,
    amount,
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra,
  } as ExactHederaRequirements;
}

/**
 * Build the full PaymentRequired (V2) response body that the
 * middleware encodes into the PAYMENT-REQUIRED header.
 */
export function buildPaymentRequired(
  price: ResourcePrice,
  cfg: RequirementsConfig,
  resourceUrl: string,
): PaymentRequired {
  const requirements = buildRequirements(price, cfg);
  const resource: ResourceInfo = {
    url: resourceUrl,
    description: price.description,
    mimeType: price.mimeType,
    serviceName: 'LENITNES',
    tags: ['hedera', 'x402', 'signals', 'autonomous-commerce'],
  };
  return {
    x402Version: X402_VERSION,
    resource,
    accepts: [requirements as PaymentRequirements],
  };
}

export type { PaymentRequirements };
