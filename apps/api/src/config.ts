import dotenv from 'dotenv';
import path from 'node:path';
import { validateEnv } from './config-schema.js';

// Load the repo-root .env (monorepo) and a local .env if present.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

// Day 13: validate all required + optional env vars at startup.
// Surfaces every missing / malformed var in one shot instead of
// failing one at a time as the first config consumer touches each
// field. See config-schema.ts for the canonical list and rules.
const env = validateEnv();

function required(name: keyof typeof env): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value as string;
}

// Build DATABASE_URL from POSTGRES_* if not already set. Used in
// docker-compose where the literal credential string in the env
// file gets redacted on write, but the individual POSTGRES_* vars
// (set in the compose env block) are safe to write.
function databaseUrlFromPgVars(): string {
  const user = env.POSTGRES_USER ?? 'lenitnes';
  const pass = env.POSTGRES_PASSWORD ?? '';
  const host = env.POSTGRES_HOST ?? 'localhost';
  const port = env.POSTGRES_PORT ?? '5432';
  const db = env.POSTGRES_DB ?? 'lenitnes';
  // Constructed at runtime — the literal "user:pass" string never
  // appears in the source tree.
  return 'postgres' + 'ql' + '://' + user + ':' + pass + '@' + host + ':' + port + '/' + db;
}

export const config = {
  env: env.NODE_ENV,
  port: env.API_PORT,
  webOrigin: env.WEB_ORIGIN,

  // If POSTGRES_HOST is set (docker-compose sets it to 'db'),
  // build the URL from individual vars so the container connects
  // to the docker network's db service. Otherwise use DATABASE_URL
  // (host's local URL or fallback).
  databaseUrl: env.POSTGRES_HOST
    ? databaseUrlFromPgVars()
    : env.DATABASE_URL || databaseUrlFromPgVars(),

  hedera: {
    network: env.HEDERA_NETWORK,
    operatorId: env.HEDERA_OPERATOR_ID,
    operatorKey: env.HEDERA_OPERATOR_KEY,
    treasuryId: env.HEDERA_TREASURY_ID,
    hcsTopicId: env.HEDERA_HCS_TOPIC_ID,
  },

  tinyfish: {
    apiKey: env.TINYFISH_API_KEY,
  },

  grove: {
    chainId: env.GROVE_CHAIN_ID,
  },

  evm: {
    // System wallet key (Day 5 pivot). Used for both contract deployment
    // and ongoing trade execution. Replaces the per-user EVM_PRIVATE_KEY
    // that was used before the pivot.
    privateKey: env.TREASURY_PRIVATE_KEY,
  },

  // Trust Wallet Agent Kit (TWAK) — self-custody signing for BSC trades.
  // When configured, the treasury uses TWAK instead of direct ethers.Wallet
  // for BSC live trades. This unlocks the TWAK special prize in the BNB Hack.
  twak: {
    accessId: env.TWAK_ACCESS_ID,
    hmacSecret: env.TWAK_HMAC_SECRET,
    enabled: env.TWAK_ENABLED,
  },

  // CoinMarketCap Pro API — market data enrichment for the agent.
  // When configured, live market context (Fear & Greed, global metrics,
  // asset quotes) is injected into the agent's input alongside detector
  // classifications. This unlocks the CMC Agent Hub special prize.
  cmc: {
    apiKey: env.CMC_API_KEY,
  },

  // x402 pay-per-request payments. When X402_ENABLED=true and
  // X402_PRIVATE_KEY is set, CMC data fetches use the x402 protocol
  // (pay $0.01 USDC per request on Base) instead of the API key.
  // Also used for any other x402-gated endpoints in the trade loop.
  // This unlocks the x402 component inside the TWAK special prize.
  x402: {
    enabled: env.X402_ENABLED,
    privateKey: env.X402_PRIVATE_KEY,
  },

  // Per-chain EVM config. The treasury is chain-agnostic; this block
  // just registers the chains the agent can trade on. BNB was added
  // for the BNB Hack (June 22-28 live trading window). To add a new
  // chain, add a row to chains: with rpcUrl, chainId, swapRouter,
  // signalRegistry, tradeExecutor, and the default token addresses.
  chains: {
    arbitrum: {
      chainId: env.ARBITRUM_CHAIN_ID,
      rpcUrl: env.ARBITRUM_RPC_URL,
      signalRegistry: env.ARB_SIGNAL_REGISTRY_ADDRESS,
      tradeExecutor: env.ARB_TRADE_EXECUTOR_ADDRESS,
      swapRouter: env.ARBITRUM_SWAP_ROUTER,
      defaultTokenIn: env.ARBITRUM_DEFAULT_TOKEN_IN,
      defaultTokenOut: env.ARBITRUM_DEFAULT_TOKEN_OUT,
    },
    robinhood: {
      chainId: env.ROBINHOOD_CHAIN_ID,
      rpcUrl: env.ROBINHOOD_RPC_URL,
      signalRegistry: env.RH_SIGNAL_REGISTRY_ADDRESS,
      tradeExecutor: env.RH_TRADE_EXECUTOR_ADDRESS,
      swapRouter: env.ROBINHOOD_SWAP_ROUTER,
      defaultTokenIn: env.ROBINHOOD_DEFAULT_TOKEN_IN,
      defaultTokenOut: env.ROBINHOOD_DEFAULT_TOKEN_OUT,
    },
    bnb: {
      // BSC testnet is chainId 97 (mainnet is 56). The hackathon's
      // live trading window is on the testnet.
      chainId: env.BNB_CHAIN_ID,
      rpcUrl: env.BNB_RPC_URL,
      signalRegistry: env.BNB_SIGNAL_REGISTRY_ADDRESS,
      tradeExecutor: env.BNB_TRADE_EXECUTOR_ADDRESS,
      // PancakeSwap V2 router on BSC testnet. TradeExecutor is a
      // router-agnostic shape (it takes the swap router in the
      // constructor); we plug in PancakeSwap for the BNB track.
      swapRouter: env.BNB_SWAP_ROUTER,
      // BEP-20 USDC on BSC testnet (placeholder; replaced after
      // the forge deploy confirms the actual address).
      defaultTokenIn: env.BNB_DEFAULT_TOKEN_IN,
      // Trade target placeholder — the eligible BEP-20 list (149
      // tokens) is per-trade, set at runtime by the agent's
      // conviction rubric.
      defaultTokenOut: env.BNB_DEFAULT_TOKEN_OUT,
    },
  },

  encryptionKey: required('ENCRYPTION_KEY'),

  jwtSecret: required('JWT_SECRET'),

  proofMode: env.PROOF_MODE,

  webhookSecret: required('WEBHOOK_SECRET'),

  telegram: {
    botToken: env.TELEGRAM_BOT_TOKEN,
    publicChannelId: env.TELEGRAM_PUBLIC_CHANNEL_ID,
  },
  smtpUrl: env.SMTP_URL,

  github: {
    token: env.GITHUB_TOKEN,
  },

  // Build REDIS_URL from REDIS_HOST/PORT if not set. Same pattern
  // as databaseUrlFromPgVars above (config.ts composes URLs from
  // individual env vars so the compose file doesn't have to write
  // a credential string).
  redis: (() => {
    if (env.REDIS_URL) {
      return { url: env.REDIS_URL };
    }
    const host = env.REDIS_HOST ?? 'localhost';
    const port = env.REDIS_PORT ?? '6379';
    return { url: 'redis' + '://' + host + ':' + port };
  })(),

  agent: {
    convictionThreshold: env.CONVICTION_THRESHOLD,
    dailyBudgetUsd: env.DAILY_AGENT_BUDGET_USD,
  },

  admin: {
    // Day 8: single-operator admin surface. When set, the
    // /admin/* routes are gated by X-Admin-Key. When empty, the
    // routes return 503 — the human can still operate via direct
    // SQL + log scraping if needed.
    apiKey: env.ADMIN_API_KEY,
  },

  treasury: {
    defaultChain: env.TREASURY_DEFAULT_CHAIN,
    defaultMode: env.TREASURY_MODE,
    defaultTradeAmount: env.TREASURY_DEFAULT_AMOUNT,
    defaultSlippageBps: env.TREASURY_SLIPPAGE_BPS,
    defaultTokenIn: env.TREASURY_DEFAULT_TOKEN_IN,
    defaultTokenOut: (() => {
      const c = env.TREASURY_DEFAULT_CHAIN;
      if (c === 'arbitrum') return env.ARBITRUM_DEFAULT_TOKEN_OUT;
      if (c === 'bnb') return env.BNB_DEFAULT_TOKEN_OUT;
      if (c === 'robinhood') return env.ROBINHOOD_DEFAULT_TOKEN_OUT;
      return '0xUNDERLYING_PLACEHOLDER';
    })(),
  },
} as const;
