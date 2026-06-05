import dotenv from "dotenv";
import path from "node:path";

// Load the repo-root .env (monorepo) and a local .env if present.
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.API_PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",

  databaseUrl: required("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/lenitnes"),

  hedera: {
    network: process.env.HEDERA_NETWORK ?? "testnet",
    operatorId: process.env.HEDERA_OPERATOR_ID ?? "",
    operatorKey: process.env.HEDERA_OPERATOR_KEY ?? "",
    treasuryId: process.env.HEDERA_TREASURY_ID ?? "",
    hcsTopicId: process.env.HEDERA_HCS_TOPIC_ID ?? "",
    defaultCostPerCheck: Number(process.env.DEFAULT_COST_PER_CHECK_HBAR ?? 0.5),
  },

  tinyfish: {
    apiKey: process.env.TINYFISH_API_KEY ?? "",
  },

  ipfs: {
    provider: process.env.IPFS_PROVIDER ?? "web3storage",
    web3StorageToken: process.env.WEB3_STORAGE_TOKEN ?? "",
    pinataJwt: process.env.PINATA_JWT ?? "",
  },

  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-insecure-key-change-me-please",

  telegram: { botToken: process.env.TELEGRAM_BOT_TOKEN ?? "" },
  smtpUrl: process.env.SMTP_URL ?? "",
} as const;
