// ─────────────────────────────────────────────────────────────
// x402 consumer agent — pays per query for LENITNES signals.
//
// Reference architecture #1: "an agent that pays per query." This
// script demonstrates the full x402-over-Hedera loop:
//   1. GET a paid resource → 402 + PAYMENT-REQUIRED header
//   2. Decode the exact-hedera requirements (amount, payTo, ref)
//   3. Sign an HBAR TransferTransaction (payer→merchant, memo=ref)
//   4. Retry with PAYMENT-SIGNATURE header → 200 + PAYMENT-RESPONSE
//   5. Print both HashScan links (HBAR transfer + HCS notarization)
//
// Run from the api workspace:
//   npx tsx scripts/x402-agent-payer.ts [resource-path]
// Defaults to /paid/feed. Payer wallet from .x402-payer.json.
// ─────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import axios from 'axios';
import {
  Client,
  PrivateKey,
  AccountId,
  TransferTransaction,
  TransactionId,
  Hbar,
} from '@hashgraph/sdk';
import {
  encodePaymentSignatureHeader,
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
} from '@x402/core/http';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAYER_FILE = path.resolve(__dirname, '../../.x402-payer.json');
const API_BASE = process.env.X402_API_BASE ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
const RESOURCE = process.argv[2] ?? '/paid/feed';

interface PayerWallet {
  accountId: string;
  evmAddress: string;
  privateKey: string;
  network: string;
}

function loadPayer(): PayerWallet {
  if (!fs.existsSync(PAYER_FILE)) {
    console.error(`No payer wallet at ${PAYER_FILE}. Run: npx tsx scripts/x402-setup-payer.ts`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(PAYER_FILE, 'utf8'));
}

async function main() {
  const payer = loadPayer();
  const url = `${API_BASE}${RESOURCE}`;
  console.log('════════════════════════════════════════════════════════════');
  console.log(' x402 consumer agent — paying per query on Hedera');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  resource   = ${url}`);
  console.log(`  payer      = ${payer.accountId}`);
  console.log(`  network    = ${payer.network}`);
  console.log('');

  // ── 1. Challenge: GET without payment → expect 402 ──────────
  console.log('▶ Step 1: requesting resource (no payment)...');
  const challenge = await axios.get(url, { validateStatus: () => true, maxRedirects: 0 });

  if (challenge.status !== 402) {
    console.error(
      `✗ Expected 402, got ${challenge.status}. Is X402_MERCHANT_ENABLED=true and the API running?`,
    );
    process.exit(1);
  }

  const requiredHeader = challenge.headers['payment-required'] as string | undefined;
  if (!requiredHeader) {
    console.error('✗ 402 response missing PAYMENT-REQUIRED header');
    process.exit(1);
  }

  const paymentRequired = decodePaymentRequiredHeader(requiredHeader) as PaymentRequired;
  const req = paymentRequired.accepts[0];
  const ref = req.extra?.paymentReference as string;
  const amountTinybar = BigInt(req.amount);
  const hbar = (Number(amountTinybar) / 1e8).toFixed(8);

  console.log(`✓ 402 Payment Required — scheme: ${req.scheme}, network: ${req.network}`);
  console.log(`  asset: ${req.asset}, amount: ${hbar} HBAR (${amountTinybar} tinybar)`);
  console.log(`  payTo: ${req.payTo}, paymentReference: ${ref}`);
  console.log('');

  // ── 2. Sign the HBAR transfer ───────────────────────────────
  console.log('▶ Step 2: signing HBAR TransferTransaction...');
  const payerKey = PrivateKey.fromString(payer.privateKey);
  const payerId = AccountId.fromString(payer.accountId);
  const merchantId = AccountId.fromString(req.payTo);

  const client = payer.network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(payerId, payerKey);

  const tx = new TransferTransaction()
    .setTransactionId(TransactionId.generate(payerId))
    .addHbarTransfer(payerId, Hbar.fromTinybars(Number(-amountTinybar)))
    .addHbarTransfer(merchantId, Hbar.fromTinybars(Number(amountTinybar)))
    .setTransactionMemo(ref);

  await tx.freezeWith(client);
  await tx.sign(payerKey);
  const signedBytes = await tx.toBytesAsync();
  const signedHex = Buffer.from(signedBytes).toString('hex');
  const txId = tx.transactionId?.toString() ?? '';

  console.log(`✓ signed: ${signedHex.length / 2} bytes, txId: ${txId}`);
  console.log('');

  // ── 3. Retry with PAYMENT-SIGNATURE header ──────────────────
  console.log('▶ Step 3: retrying with PAYMENT-SIGNATURE header...');
  const payload: PaymentPayload = {
    x402Version: 2,
    accepted: req,
    payload: { signedTransaction: signedHex, transactionId: txId, payer: payerId.toString() },
  };

  const paid = await axios.get(url, {
    validateStatus: () => true,
    maxRedirects: 0,
    headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) },
  });

  if (paid.status !== 200) {
    console.error(`✗ Payment failed: HTTP ${paid.status}`);
    console.error(JSON.stringify(paid.data, null, 2));
    process.exit(1);
  }

  const respHeader = paid.headers['payment-response'] as string | undefined;
  const settlement = respHeader ? decodePaymentResponseHeader(respHeader) : undefined;
  const hbarTxId = settlement?.transaction ?? txId;
  const hcsTxId = settlement?.extra?.hcsTxId as string | undefined;
  const net = 'testnet';

  console.log('════════════════════════════════════════════════════════════');
  console.log(' ✓ PAYMENT SETTLED — 200 OK');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  payer      = ${settlement?.payer ?? payer.accountId}`);
  console.log(`  amount     = ${settlement?.amount ?? req.amount} tinybar`);
  console.log('');
  console.log('🔗 HashScan — HBAR transfer (payment):');
  console.log(`  https://hashscan.io/${net}/transaction/${hbarTxId}`);
  if (hcsTxId) {
    console.log('🔗 HashScan — HCS receipt notarization:');
    console.log(`  https://hashscan.io/${net}/transaction/${hcsTxId}`);
  }
  console.log('');

  const summary = JSON.stringify(paid.data).slice(0, 200);
  console.log('📦 Resource delivered (first 200 chars):');
  console.log(`  ${summary}`);

  // ── Collect links for the submission doc ────────────────────
  const linksFile = path.resolve(__dirname, '../../../docs/x402-demo-links.md');
  const stamp = new Date().toISOString();
  const entry = [
    `### ${stamp}`,
    `- Resource: \`${RESOURCE}\``,
    `- Payer: \`${payer.accountId}\` → Merchant: \`${req.payTo}\``,
    `- Amount: ${hbar} HBAR (${amountTinybar} tinybar)`,
    `- HBAR transfer: https://hashscan.io/${net}/transaction/${hbarTxId}`,
    hcsTxId ? `- HCS notarization: https://hashscan.io/${net}/transaction/${hcsTxId}` : '',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const existing = fs.existsSync(linksFile)
    ? fs.readFileSync(linksFile, 'utf8')
    : '# x402 demo — on-chain payment links\n\n';
  fs.writeFileSync(linksFile, existing + entry + '\n');
  console.log(`\n📝 Links appended → docs/x402-demo-links.md`);

  client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('x402-agent-payer: fatal', err);
  process.exit(1);
});
