/**
 * Centralized feature flags.
 * Reads directly from process.env to avoid a circular dependency with config.ts
 * (which itself requires these to be set at module load time).
 * Every optional external integration gates behind these flags, returning
 * 501 (Not Implemented) with a clear message when disabled — rather than
 * failing mid-execution with a cryptic error.
 */
export const FEATURES = {
  /** x402 micropayment on-demand execution */
  x402: (process.env.X402_PAY_TO ?? process.env.HEDERA_TREASURY_ID ?? '') !== '',

  /** Hedera HCS proof chain (signal/heartbeat timestamping) */
  hederaProof: (process.env.PROOF_MODE ?? 'hedera') === 'hedera',

  /** Telegram bot notifications */
  telegram: (process.env.TELEGRAM_BOT_TOKEN ?? '') !== '',

  /** SMTP email relay */
  email: (process.env.SMTP_URL ?? '') !== '',

  /** TinyFish AI detection */
  tinyfish: (process.env.TINYFISH_API_KEY ?? '') !== '',

  /** Kraken trade execution */
  krakenTrading: true,

  /** Public proof sharing */
  publicProofs: true,

  /** GitHub API commit enrichment */
  githubApi: (process.env.GITHUB_TOKEN ?? '') !== '',

  /** Arbitrum DEX trading (requires EVM key + deployed TradeExecutor) */
  arbitrumTrading:
    (process.env.EVM_PRIVATE_KEY ?? '') !== '' &&
    (process.env.ARB_TRADE_EXECUTOR_ADDRESS ?? '') !== '',

  /** Robinhood Chain stock trading (requires EVM key + deployed TradeExecutor) */
  robinhoodChain:
    (process.env.EVM_PRIVATE_KEY ?? '') !== '' &&
    (process.env.RH_TRADE_EXECUTOR_ADDRESS ?? '') !== '',

  /** Arbitrum on-chain proof (requires deployed SignalRegistry) */
  evmProof: (process.env.ARB_SIGNAL_REGISTRY_ADDRESS ?? '') !== '',
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
