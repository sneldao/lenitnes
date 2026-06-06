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
    defaultCostPerCheck: Number(process.env.DEFAULT_COST_PER_CHECK_HBAR ?? 0.5),
  },

  tinyfish: {
    apiKey: process.env.TINYFISH_API_KEY ?? '',
  },

  ipfs: {
    provider: process.env.IPFS_PROVIDER ?? 'web3storage',
    web3StorageToken: process.env.WEB3_STORAGE_TOKEN ?? '',
    pinataJwt: process.env.PINATA_JWT ?? '',
  },

  encryptionKey: required('ENCRYPTION_KEY'),

  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-jwt-secret-change-me'),

  telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN ?? '' },
  smtpUrl: process.env.SMTP_URL ?? '',

  x402: {
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? 'https://blocky402.com',
    network: (process.env.X402_HEDERA_NETWORK ?? 'hedera:testnet') as `${string}:${string}`,
    payTo: process.env.X402_PAY_TO ?? process.env.HEDERA_TREASURY_ID ?? '',
    priceHbar: Number(process.env.X402_PRICE_HBAR ?? 0.5),
  },
} as const;
