// ─────────────────────────────────────────────────────────────
// x402 merchant config + singleton facilitator.
//
// Bridges the app config (config.x402Merchant) to the Hedera
// facilitator + requirements builder. Lazy-init so the Hedera
// client is only created when the first paid request arrives.
// ─────────────────────────────────────────────────────────────

import { config } from '../../config.js';
import { isHederaConfigured } from './hedera-client.js';
import { createHederaFacilitator, type HederaFacilitator } from './hedera-facilitator.js';
import type { RequirementsConfig } from './payment-requirements.js';

let _facilitator: HederaFacilitator | null = null;

export function isX402MerchantEnabled(): boolean {
  return (
    config.x402Merchant.enabled &&
    isHederaConfigured({
      network: config.hedera.network,
      operatorId: config.hedera.operatorId,
      operatorKey: config.hedera.operatorKey,
      operatorKeyType: config.hedera.operatorKeyType,
    })
  );
}

/** The RequirementsConfig for buildRequirements (payTo + timeout). */
export function getX402RequirementsConfig(): RequirementsConfig {
  return {
    payTo: config.x402Merchant.payee,
    maxTimeoutSeconds: config.x402Merchant.timeoutSeconds,
  };
}

/** Lazily build + memoize the Hedera self-facilitator. */
export function getX402Facilitator(): HederaFacilitator {
  if (_facilitator) return _facilitator;
  _facilitator = createHederaFacilitator({
    network: config.hedera.network,
    operatorId: config.hedera.operatorId,
    operatorKey: config.hedera.operatorKey,
    operatorKeyType: config.hedera.operatorKeyType,
    topicId: config.x402Merchant.hcsTopicId,
  });
  return _facilitator;
}
