// ─────────────────────────────────────────────────────────────
// Env-var schema — validated at boot. Day 13.
// Surfaces ALL missing / malformed vars at startup instead of
// failing one at a time as the first config consumer touches
// each field. Uses zod (already a dependency of the api).
// ─────────────────────────────────────────────────────────────

import { z } from 'zod';

// Min 32 chars (matches the .env.example contract:
// 'JWT_SECRET, ENCRYPTION_KEY, WEBHOOK_SECRET (32-byte hex each)').
// The api treats these as opaque strings; the 32-char floor is
// the HS256 / AES-256 minimum and is enough to catch the common
// 'copied the wrong value from .env.example' mistake.
const secret32 = z.string().min(32, 'must be at least 32 characters');

// "0x" + 40 hex chars for an EVM address. Empty string is allowed
// (signals "not configured yet") so partially-bootstrapped envs
// (compose file before forge deploy) don't fail validation.
const evmAddress = z.string().refine((v) => v === '' || /^0x[0-9a-fA-F]{40}$/.test(v), {
  message: 'must be empty or 0x-prefixed 40-hex-char EVM address',
});

const chainEnum = z.enum(['hedera', 'arbitrum', 'robinhood', 'bnb']);
const treasuryModeEnum = z.enum(['paper', 'live']);
const proofModeEnum = z.enum(['hedera', 'none']);

// Integer-from-string helper. z.coerce.number() accepts floats;
// port numbers, chain IDs, and thresholds must be ints.
const intFromString = (min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().int().min(min).max(max));

// Float-from-string helper for $ amounts.
const floatFromString = (min = 0) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v)))
    .pipe(z.number().min(min));

export const envSchema = z
  .object({
    // ── App ──
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    API_PORT: intFromString(1, 65535).default(4000),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

    // ── Required secrets ──
    JWT_SECRET: secret32,
    ENCRYPTION_KEY: secret32,
    WEBHOOK_SECRET: z.string().min(1, 'must not be empty'),

    // ── Database ──
    DATABASE_URL: z.string().optional(),
    POSTGRES_USER: z.string().optional(),
    POSTGRES_PASSWORD: z.string().optional(),
    POSTGRES_HOST: z.string().optional(),
    POSTGRES_PORT: z.string().optional(),
    POSTGRES_DB: z.string().optional(),

    // ── Redis ──
    REDIS_URL: z.string().optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.string().optional(),
    REDIS_CACHE_PUPSUB: z
      .string()
      .optional()
      .transform((v) => v === 'true'),

    // ── Agent ──
    MOCK_AGENT: z
      .string()
      .optional()
      .transform((v) => v === '1'),
    VIRTUALS_API_KEY: z.string().optional().default(''),
    VIRTUALS_BASE_URL: z.string().url().default('https://compute.virtuals.io/v1'),
    AGENT_MODEL: z.string().default('moonshotai/kimi-k2-0905'),
    AGENT_INPUT_COST_PER_1M_USD: floatFromString().default(0.6),
    AGENT_OUTPUT_COST_PER_1M_USD: floatFromString().default(2.5),
    // Raised from 70 → 80 on 2026-06-26 after the first conviction
    // cohort (5 trades, 0% win rate, avg t1h −0.5%). Higher floor =
    // fewer trades but each one carries more agent confidence.
    // Re-evaluate after a 4-week paper-trade run shows what the
    // calibration curve looks like.
    CONVICTION_THRESHOLD: intFromString(0, 100).default(80),
    DAILY_AGENT_BUDGET_USD: floatFromString().default(20),
    // Minimum age in minutes for a commit to be considered. Many
    // signals fire on commits that are already priced in within
    // 30-60 minutes; a settling window filters those out.
    MIN_COMMIT_AGE_MINUTES: intFromString(0, 24 * 60).default(30),

    // ── Admin ──
    ADMIN_API_KEY: z.string().optional().default(''),

    // ── Treasury ──
    TREASURY_PRIVATE_KEY: z.string().optional().default(''),
    TREASURY_DEFAULT_CHAIN: chainEnum.default('arbitrum'),
    TREASURY_MODE: treasuryModeEnum.default('paper'),
    TREASURY_DEFAULT_AMOUNT: z.string().default('0.01'),
    TREASURY_SLIPPAGE_BPS: intFromString(0, 10_000).default(50),
    TREASURY_DEFAULT_TOKEN_IN: z.string().default('0xUSDC_PLACEHOLDER'),
    GAS_WARNING_THRESHOLD: z.string().default('0.02'),
    // Master kill switch. TREASURY_MODE=live alone is NOT enough —
    // the operator must also flip this to true. Lets us deploy
    // safety code first and turn on live trading only when the
    // safety story is fully verified.
    TRADING_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    MAX_CONCURRENT_POSITIONS: intFromString(1, 1_000).default(5),
    MAX_PER_ASSET_POSITIONS: intFromString(1, 100).default(1),
    // TP/SL defaults applied at open. Conviction-adjusted at the
    // call site (see treasury/risk.ts:computeTpSlLevels).
    POSITION_TAKE_PROFIT_BPS: intFromString(0, 10_000).default(1500),
    POSITION_STOP_LOSS_BPS: intFromString(0, 10_000).default(700),

    // ── Notification / webhook ──
    TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
    TELEGRAM_PUBLIC_CHANNEL_ID: z.string().optional().default(''),
    SMTP_URL: z.string().optional().default(''),

    // ── Hedera (legacy surface; kept for parity with the pre-pivot
    //    schema even though the live trade loop no longer hits HCS
    //    for the BNB-Hack window) ──
    HEDERA_NETWORK: z.string().default('testnet'),
    HEDERA_OPERATOR_ID: z.string().optional().default(''),
    HEDERA_OPERATOR_KEY: z.string().optional().default(''),
    HEDERA_TREASURY_ID: z.string().optional().default(''),
    HEDERA_HCS_TOPIC_ID: z.string().optional().default(''),
    // Algorithm for HEDERA_OPERATOR_KEY. 'ecdsa' (secp256k1) or 'ed25519'.
    // Default 'ecdsa' matches the production operator account
    // (0.0.9137770 on testnet, ECDSA_SECP256K1). The Hedera SDK's
    // fromString auto-detect gets this wrong for 32-byte raw keys
    // (treats the 0x prefix as a DER signal), so we parse explicitly.
    HEDERA_OPERATOR_KEY_TYPE: z.enum(['ecdsa', 'ed25519']).default('ecdsa'),
    PROOF_MODE: proofModeEnum.default('hedera'),

    // ── Detection integrations ──
    TINYFISH_API_KEY: z.string().optional().default(''),
    GITHUB_TOKEN: z.string().optional().default(''),

    // ── TWAK (BSC self-custody signing) ──
    TWAK_ACCESS_ID: z.string().optional().default(''),
    TWAK_HMAC_SECRET: z.string().optional().default(''),
    TWAK_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === 'true'),

    // ── CoinMarketCap ──
    CMC_API_KEY: z.string().optional().default(''),

    // ── SoSoValue ──
    SOSO_VALUE_API_KEY: z.string().optional().default(''),

    // ── SoDEX (ValueChain orderbook execution) ──
    SODEX_API_KEY_NAME: z.string().optional().default(''),
    SODEX_API_KEY_PRIVATE: z.string().optional().default(''),
    SODEX_ACCOUNT_ID: z.string().optional().default(''),
    SODEX_SYMBOL_ID: z.string().optional().default('1'),
    SODEX_SYMBOL: z.string().optional().default('vBTC_vUSDC'),
    SODEX_NETWORK: z.enum(['mainnet', 'testnet']).optional().default('testnet'),

    // ── x402 pay-per-request ──
    X402_ENABLED: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    X402_PRIVATE_KEY: z.string().optional().default(''),

    // ── EVM / per-chain ──
    ARBITRUM_CHAIN_ID: intFromString().default(421614),
    ARBITRUM_RPC_URL: z.string().url().default('https://sepolia-rollup.arbitrum.io/rpc'),
    ARBITRUM_SWAP_ROUTER: z.string().default('0x101F443B4D1b059569C6452319124001853b2156'),
    ARB_SIGNAL_REGISTRY_ADDRESS: evmAddress.default(''),
    ARB_TRADE_EXECUTOR_ADDRESS: evmAddress.default(''),
    ARBITRUM_DEFAULT_TOKEN_IN: z.string().default(''),
    ARBITRUM_DEFAULT_TOKEN_OUT: z.string().default('0xUNDERLYING_PLACEHOLDER'),

    ROBINHOOD_CHAIN_ID: intFromString().default(84531),
    ROBINHOOD_RPC_URL: z.string().url().default('https://rpc.testnet.chain.robinhood.com'),
    ROBINHOOD_SWAP_ROUTER: z.string().default(''),
    RH_SIGNAL_REGISTRY_ADDRESS: evmAddress.default(''),
    RH_TRADE_EXECUTOR_ADDRESS: evmAddress.default(''),
    ROBINHOOD_DEFAULT_TOKEN_IN: z.string().default(''),
    ROBINHOOD_DEFAULT_TOKEN_OUT: z.string().default('0xUNDERLYING_PLACEHOLDER'),

    BNB_CHAIN_ID: intFromString().default(97),
    BNB_RPC_URL: z.string().url().default('https://data-seed-prebsc-1-s1.binance.org:8545/'),
    BNB_SWAP_ROUTER: z.string().default('0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD'),
    BNB_SIGNAL_REGISTRY_ADDRESS: evmAddress.default(''),
    BNB_TRADE_EXECUTOR_ADDRESS: evmAddress.default(''),
    BNB_DEFAULT_TOKEN_IN: z.string().default(''),
    BNB_DEFAULT_TOKEN_OUT: z.string().default('0xUNDERLYING_PLACEHOLDER'),

    // ── Misc ──
    GROVE_CHAIN_ID: intFromString().default(37111),
  })
  .superRefine((data, ctx) => {
    // Cross-field rules — only what zod can't express declaratively.

    // TWAK enabled ⇒ credentials must be set
    if (data.TWAK_ENABLED && (!data.TWAK_ACCESS_ID || !data.TWAK_HMAC_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TWAK_ACCESS_ID'],
        message: 'TWAK_ENABLED=true requires both TWAK_ACCESS_ID and TWAK_HMAC_SECRET to be set',
      });
    }

    // x402 enabled ⇒ private key must be set
    if (data.X402_ENABLED && !data.X402_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['X402_PRIVATE_KEY'],
        message: 'X402_ENABLED=true requires X402_PRIVATE_KEY to be set',
      });
    }

    // Live mode + non-MOCK agent ⇒ treasury key required
    if (data.TREASURY_MODE === 'live' && !data.TREASURY_PRIVATE_KEY && !data.MOCK_AGENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TREASURY_PRIVATE_KEY'],
        message: 'TREASURY_MODE=live requires TREASURY_PRIVATE_KEY (or set MOCK_AGENT=1 to bypass)',
      });
    }
  });

export type ValidatedEnv = z.infer<typeof envSchema>;

/**
 * Validate process.env against envSchema. Returns the parsed env
 * on success, or throws with a formatted, all-at-once error on
 * failure (so the operator sees every missing / malformed var in
 * one shot instead of fixing them one at a time across restarts).
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const result = envSchema.safeParse(env);
  if (result.success) return result.data;

  const issues = result.error.issues.map((iss) => {
    const path = iss.path.length ? iss.path.join('.') : '<root>';
    return `  • ${path}: ${iss.message}`;
  });
  const err = new Error(
    `Environment validation failed (${result.error.issues.length} issue${result.error.issues.length === 1 ? '' : 's'}):\n${issues.join('\n')}\n\n` +
      `See apps/api/src/config-schema.ts for the canonical list of required\n` +
      `and optional env vars. .env.example is the source of truth.`,
  );
  (err as Error & { validationIssues?: unknown }).validationIssues = result.error.issues;
  throw err;
}
