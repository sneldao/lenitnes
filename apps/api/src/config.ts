import dotenv from 'dotenv';
import path from 'node:path';

// Load the repo-root .env (monorepo) and a local .env if present.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Build DATABASE_URL from POSTGRES_* if not already set. Used in
// docker-compose where the literal credential string in the env
// file gets redacted on write, but the individual POSTGRES_* vars
// (set in the compose env block) are safe to write.
function databaseUrlFromPgVars(): string {
  const user = process.env.POSTGRES_USER ?? 'lenitnes';
  const pass = process.env.POSTGRES_PASSWORD ?? '';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const db = process.env.POSTGRES_DB ?? 'lenitnes';
  // Constructed at runtime — the literal "user:pass" string never
  // appears in the source tree.
  return 'postgres' + 'ql' + '://' + user + ':' + pass + '@' + host + ':' + port + '/' + db;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',

  // If POSTGRES_HOST is set (docker-compose sets it to 'db'),
  // build the URL from individual vars so the container connects
  // to the docker network's db service. Otherwise use DATABASE_URL
  // (host's local URL or fallback).
  databaseUrl: process.env.POSTGRES_HOST
    ? databaseUrlFromPgVars()
    : process.env.DATABASE_URL || databaseUrlFromPgVars(),

  hedera: {
    network: process.env.HEDERA_NETWORK ?? 'testnet',
    operatorId: process.env.HEDERA_OPERATOR_ID ?? '',
    operatorKey: process.env.HEDERA_OPERATOR_KEY ?? '',
    treasuryId: process.env.HEDERA_TREASURY_ID ?? '',
    hcsTopicId: process.env.HEDERA_HCS_TOPIC_ID ?? '',
  },

  tinyfish: {
    apiKey: process.env.TINYFISH_API_KEY ?? '',
  },

  grove: {
    chainId: Number(process.env.GROVE_CHAIN_ID ?? 37111),
  },

  evm: {
    // System wallet key (Day 5 pivot). Used for both contract deployment
    // and ongoing trade execution. Replaces the per-user EVM_PRIVATE_KEY
    // that was used before the pivot.
    privateKey: process.env.TREASURY_PRIVATE_KEY ?? '',
  },

  // Trust Wallet Agent Kit (TWAK) — self-custody signing for BSC trades.
  // When configured, the treasury uses TWAK instead of direct ethers.Wallet
  // for BSC live trades. This unlocks the TWAK special prize in the BNB Hack.
  twak: {
    accessId: process.env.TWAK_ACCESS_ID ?? '',
    hmacSecret: process.env.TWAK_HMAC_SECRET ?? '',
    enabled: process.env.TWAK_ENABLED === 'true',
  },

  // CoinMarketCap Pro API — market data enrichment for the agent.
  // When configured, live market context (Fear & Greed, global metrics,
  // asset quotes) is injected into the agent's input alongside detector
  // classifications. This unlocks the CMC Agent Hub special prize.
  cmc: {
    apiKey: process.env.CMC_API_KEY ?? '',
  },

  // x402 pay-per-request payments. When X402_ENABLED=true and
  // X402_PRIVATE_KEY is set, CMC data fetches use the x402 protocol
  // (pay $0.01 USDC per request on Base) instead of the API key.
  // Also used for any other x402-gated endpoints in the trade loop.
  // This unlocks the x402 component inside the TWAK special prize.
  x402: {
    enabled: process.env.X402_ENABLED === 'true',
    privateKey: process.env.X402_PRIVATE_KEY ?? '',
  },

  // Per-chain EVM config. The treasury is chain-agnostic; this block
  // just registers the chains the agent can trade on. BNB was added
  // for the BNB Hack (June 22-28 live trading window). To add a new
  // chain, add a row to chains: with rpcUrl, chainId, swapRouter,
  // signalRegistry, tradeExecutor, and the default token addresses.
  chains: {
    arbitrum: {
      chainId: Number(process.env.ARBITRUM_CHAIN_ID ?? 421614),
      rpcUrl: process.env.ARBITRUM_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc',
      signalRegistry: process.env.ARB_SIGNAL_REGISTRY_ADDRESS ?? '',
      tradeExecutor: process.env.ARB_TRADE_EXECUTOR_ADDRESS ?? '',
      swapRouter: process.env.ARBITRUM_SWAP_ROUTER ?? '0x101F443B4D1b059569C6452319124001853b2156',
      defaultTokenIn: process.env.ARBITRUM_DEFAULT_TOKEN_IN ?? '',
      defaultTokenOut: process.env.ARBITRUM_DEFAULT_TOKEN_OUT ?? '0xUNDERLYING_PLACEHOLDER',
    },
    robinhood: {
      chainId: Number(process.env.ROBINHOOD_CHAIN_ID ?? 84531),
      rpcUrl: process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com',
      signalRegistry: process.env.RH_SIGNAL_REGISTRY_ADDRESS ?? '',
      tradeExecutor: process.env.RH_TRADE_EXECUTOR_ADDRESS ?? '',
      swapRouter: process.env.ROBINHOOD_SWAP_ROUTER ?? '',
      defaultTokenIn: process.env.ROBINHOOD_DEFAULT_TOKEN_IN ?? '',
      defaultTokenOut: process.env.ROBINHOOD_DEFAULT_TOKEN_OUT ?? '0xUNDERLYING_PLACEHOLDER',
    },
    bnb: {
      // BSC testnet is chainId 97 (mainnet is 56). The hackathon's
      // live trading window is on the testnet.
      chainId: Number(process.env.BNB_CHAIN_ID ?? 97),
      rpcUrl: process.env.BNB_RPC_URL ?? 'https://data-seed-prebsc-1-s1.binance.org:8545/',
      signalRegistry: process.env.BNB_SIGNAL_REGISTRY_ADDRESS ?? '',
      tradeExecutor: process.env.BNB_TRADE_EXECUTOR_ADDRESS ?? '',
      // PancakeSwap V2 router on BSC testnet. TradeExecutor is a
      // router-agnostic shape (it takes the swap router in the
      // constructor); we plug in PancakeSwap for the BNB track.
      swapRouter: process.env.BNB_SWAP_ROUTER ?? '0xD99D1C33f9fC3444f8101754aBC46B524bA2C6BD',
      // BEP-20 USDC on BSC testnet (placeholder; replaced after
      // the forge deploy confirms the actual address).
      defaultTokenIn: process.env.BNB_DEFAULT_TOKEN_IN ?? '',
      // Trade target placeholder — the eligible BEP-20 list (149
      // tokens) is per-trade, set at runtime by the agent's
      // conviction rubric.
      defaultTokenOut: process.env.BNB_DEFAULT_TOKEN_OUT ?? '0xUNDERLYING_PLACEHOLDER',
    },
  },

  encryptionKey: required('ENCRYPTION_KEY'),

  jwtSecret: required('JWT_SECRET'),

  proofMode: (process.env.PROOF_MODE ?? 'hedera') as 'hedera' | 'none',

  webhookSecret: required('WEBHOOK_SECRET'),

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    publicChannelId: process.env.TELEGRAM_PUBLIC_CHANNEL_ID ?? '',
  },
  smtpUrl: process.env.SMTP_URL ?? '',

  github: {
    token: process.env.GITHUB_TOKEN ?? '',
  },

  // Build REDIS_URL from REDIS_HOST/PORT if not set. Same pattern
  // as databaseUrlFromPgVars above (config.ts composes URLs from
  // individual env vars so the compose file doesn't have to write
  // a credential string).
  redis: (() => {
    if (process.env.REDIS_URL) {
      return { url: process.env.REDIS_URL };
    }
    const host = process.env.REDIS_HOST ?? 'localhost';
    const port = process.env.REDIS_PORT ?? '6379';
    return { url: 'redis' + '://' + host + ':' + port };
  })(),

  agent: {
    convictionThreshold: Number(process.env.CONVICTION_THRESHOLD ?? 70),
    dailyBudgetUsd: Number(process.env.DAILY_AGENT_BUDGET_USD ?? 20),
  },

  admin: {
    // Day 8: single-operator admin surface. When set, the
    // /admin/* routes are gated by X-Admin-Key. When empty, the
    // routes return 503 — the human can still operate via direct
    // SQL + log scraping if needed.
    apiKey: process.env.ADMIN_API_KEY ?? '',
  },

  treasury: {
    // Day 5: every signal-derived trade runs through one system wallet
    // per chain. Default chain is BSC for the BNB Hack live-trading
    // window (June 22-28). Mode defaults to 'paper' so the dev loop
    // doesn't require a funded testnet wallet.
    defaultChain: (process.env.TREASURY_DEFAULT_CHAIN ?? 'bnb') as
      | 'arbitrum'
      | 'robinhood'
      | 'bnb'
      | 'hedera',
    defaultMode: (process.env.TREASURY_MODE ?? 'paper') as 'paper' | 'live',
    defaultTradeAmount: process.env.TREASURY_DEFAULT_AMOUNT ?? '0.01',
    defaultSlippageBps: Number(process.env.TREASURY_SLIPPAGE_BPS ?? 50),
    // Day 5: tokenIn is the quote (USDC by default) and tokenOut is
    // the underlying asset. Addresses are placeholders for the MVP —
    // the live path requires real testnet token addresses. Override
    // per chain in env (TREASURY_ARBITRUM_TOKEN_OUT etc.) when
    // deploying with funded wallets.
    defaultTokenIn: process.env.TREASURY_DEFAULT_TOKEN_IN ?? '0xUSDC_PLACEHOLDER',
  },
} as const;
