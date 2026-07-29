// ─────────────────────────────────────────────────────────────
// x402 payer setup — generates a fresh ECDSA Hedera testnet
// account and funds it from the configured operator (merchant).
//
// The merchant (payee) is HEDERA_OPERATOR_ID. This script creates
// a SECOND, distinct account that acts as the autonomous payer
// agent — so the x402 demo is a real machine-to-machine transfer
// between two different on-chain identities.
//
// Idempotent: if .x402-payer.json already exists, it just prints
// the existing credentials + HashScan link.
//
// Run from the api workspace:
//   npx tsx scripts/x402-setup-payer.ts
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Client, PrivateKey, AccountCreateTransaction, Hbar, AccountId } from '@hashgraph/sdk';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '../../.x402-payer.json');
const FUND_HBAR = Number(process.env.X402_PAYER_FUND_HBAR ?? 20);

function parseOperatorKey(raw: string): PrivateKey {
  const type = (process.env.HEDERA_OPERATOR_KEY_TYPE ?? 'ecdsa').toLowerCase();
  if (type === 'ed25519') return PrivateKey.fromStringED25519(raw);
  if (type === 'ecdsa') return PrivateKey.fromStringECDSA(raw);
  return PrivateKey.fromString(raw);
}

async function main() {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyRaw = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK ?? 'testnet';
  if (!operatorId || !operatorKeyRaw) {
    console.error('FAIL: HEDERA_OPERATOR_ID / HEDERA_OPERATOR_KEY not set in .env');
    process.exit(1);
  }

  // Idempotent — reuse an already-created payer.
  if (fs.existsSync(OUT_FILE)) {
    const existing = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    console.log('x402 payer already provisioned:\n');
    console.log(`  accountId   = ${existing.accountId}`);
    console.log(`  evmAddress  = ${existing.evmAddress}`);
    console.log(`  privateKey  = ${existing.privateKey}`);
    console.log(`  fundedHbar  = ${existing.fundedHbar}`);
    console.log(`  createdAt   = ${existing.createdAt}`);
    console.log('\nHashScan:');
    console.log(`  https://hashscan.io/${network}/account/${existing.accountId}`);
    console.log(`\n(reuse this payer — delete ${OUT_FILE} to regenerate)`);
    process.exit(0);
  }

  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  const operatorKey = parseOperatorKey(operatorKeyRaw);
  client.setOperator(AccountId.fromString(operatorId), operatorKey);

  console.log('Generating fresh ECDSA keypair for the x402 payer agent...');
  const payerKey = PrivateKey.generateECDSA();
  const payerEvm = payerKey.publicKey.toEvmAddress();

  console.log(`Funding new account with ${FUND_HBAR} HBAR from operator ${operatorId}...`);
  const start = Date.now();
  const createTx = await new AccountCreateTransaction()
    .setKey(payerKey.publicKey)
    .setInitialBalance(Hbar.from(FUND_HBAR))
    .setAccountMemo('LENITNES x402 payer agent')
    .execute(client);
  const receipt = await createTx.getReceipt(client);
  const payerAccountId = receipt.accountId;
  if (!payerAccountId) {
    console.error('FAIL: account creation returned no accountId');
    process.exit(1);
  }

  const ms = Date.now() - start;
  const record = {
    accountId: payerAccountId.toString(),
    evmAddress: payerEvm,
    privateKey: payerKey.toString(),
    fundedHbar: FUND_HBAR,
    createdAt: new Date().toISOString(),
    network,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(record, null, 2) + '\n', {
    mode: 0o600,
  });

  console.log(`\nOK in ${ms}ms`);
  console.log(`  accountId   = ${record.accountId}`);
  console.log(`  evmAddress  = ${record.evmAddress}`);
  console.log(`  privateKey  = ${record.privateKey}`);
  console.log(`  fundedHbar  = ${record.fundedHbar}`);
  console.log(`\nSaved (gitignored) → ${OUT_FILE}`);
  console.log('\nHashScan (fund verification):');
  console.log(`  https://hashscan.io/${network}/account/${record.accountId}`);
  console.log(`  https://hashscan.io/${network}/transaction/${createTx.transactionId.toString()}`);

  client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('x402-setup-payer: fatal', err);
  process.exit(1);
});
