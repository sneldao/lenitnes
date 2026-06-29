/**
 * Centralized feature flags.
 * Reads directly from process.env to avoid a circular dependency with config.ts
 * (which itself requires these to be set at module load time).
 * Every optional external integration gates behind these flags, returning
 * 501 (Not Implemented) with a clear message when disabled — rather than
 * failing mid-execution with a cryptic error.
 */
export const FEATURES = {
  /** Hedera HCS proof chain (signal/heartbeat timestamping) */
  hederaProof: (process.env.PROOF_MODE ?? 'hedera') === 'hedera',

  /** Telegram bot notifications */
  telegram: (process.env.TELEGRAM_BOT_TOKEN ?? '') !== '',

  /** SMTP email relay */
  email: (process.env.SMTP_URL ?? '') !== '',

  /** TinyFish AI detection */
  tinyfish: (process.env.TINYFISH_API_KEY ?? '') !== '',

  /** GitHub API commit enrichment */
  githubApi: (process.env.GITHUB_TOKEN ?? '') !== '',

  /** Arbitrum DEX trading (requires treasury key + deployed TradeExecutor) */
  arbitrumTrading:
    (process.env.TREASURY_PRIVATE_KEY ?? '') !== '' &&
    (process.env.ARB_TRADE_EXECUTOR_ADDRESS ?? '') !== '',

  /** Robinhood Chain stock trading (requires treasury key + deployed TradeExecutor) */
  robinhoodChain:
    (process.env.TREASURY_PRIVATE_KEY ?? '') !== '' &&
    (process.env.RH_TRADE_EXECUTOR_ADDRESS ?? '') !== '',

  /** Arbitrum on-chain proof (requires deployed SignalRegistry) */
  evmProof: (process.env.ARB_SIGNAL_REGISTRY_ADDRESS ?? '') !== '',

  /** SoSoValue news feeds + market data (requires SOSO_VALUE_API_KEY) */
  sosovalue: (process.env.SOSO_VALUE_API_KEY ?? '') !== '',

  /** SoDEX orderbook trading on ValueChain L1 */
  sodex:
    (process.env.SODEX_API_KEY_NAME ?? '') !== '' &&
    (process.env.SODEX_API_KEY_PRIVATE ?? '') !== '',
} as const;

export type FeatureName = keyof typeof FEATURES;

/**
 * Check if a feature is enabled. Throws a descriptive 501 error if disabled.
 */
export function requireFeature(name: FeatureName): void {
  if (!FEATURES[name]) {
    throw new Error(`Feature "${name}" is not configured. Check your .env file.`);
  }
}
