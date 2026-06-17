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

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',

  databaseUrl: required('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/lenitnes'),

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
    privateKey: process.env.EVM_PRIVATE_KEY ?? '',
    arbitrumRpcUrl: process.env.ARBITRUM_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc',
    robinhoodRpcUrl: process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com',
    arbSignalRegistry: process.env.ARB_SIGNAL_REGISTRY_ADDRESS ?? '',
    arbTradeExecutor: process.env.ARB_TRADE_EXECUTOR_ADDRESS ?? '',
    rhSignalRegistry: process.env.RH_SIGNAL_REGISTRY_ADDRESS ?? '',
    rhTradeExecutor: process.env.RH_TRADE_EXECUTOR_ADDRESS ?? '',
    robinhoodSwapRouter: process.env.ROBINHOOD_SWAP_ROUTER ?? '',
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

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  agent: {
    convictionThreshold: Number(process.env.CONVICTION_THRESHOLD ?? 70),
    dailyBudgetUsd: Number(process.env.DAILY_AGENT_BUDGET_USD ?? 20),
  },
} as const;
