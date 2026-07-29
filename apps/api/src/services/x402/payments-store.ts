// ─────────────────────────────────────────────────────────────
// x402_payments ledger — persistence + replay protection.
//
// Every settled micropayment is recorded here. The payment_reference
// (UUID carried in the HBAR transfer memo) has a UNIQUE constraint,
// so a second settle attempt for the same reference is rejected at
// the DB layer even if the in-memory check is raced.
// ─────────────────────────────────────────────────────────────

import { ulid } from 'ulid';
import { query } from '../../db/pool.js';
import { hashscanTxUrl } from './types.js';

export interface PaymentRow {
  id: string;
  payment_reference: string;
  resource: string;
  scheme: string;
  network: string;
  asset: string;
  amount_tinybar: string;
  payer: string;
  payee: string;
  hedera_tx_id: string;
  hcs_tx_id: string | null;
  hashscan_url: string;
  hcs_hashscan_url: string | null;
  settlement_status: string;
  error_reason: string | null;
  created_at: string;
}

export interface RecordPaymentInput {
  paymentReference: string;
  resource: string;
  network: string;
  amountTinybar: string;
  payer: string;
  payee: string;
  hederaTxId: string;
  hcsTxId: string | null;
  settlementStatus: 'settled' | 'failed';
  errorReason?: string | null;
}

/** Has this paymentReference already been settled? (replay guard) */
export async function isReferenceSettled(paymentReference: string): Promise<boolean> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM x402_payments
      WHERE payment_reference = $1 AND settlement_status = 'settled'`,
    [paymentReference],
  );
  return Number(rows[0]?.count ?? 0) > 0;
}

/** Persist a settled (or failed) payment. */
export async function recordPayment(input: RecordPaymentInput): Promise<PaymentRow> {
  const id = ulid();
  const { rows } = await query<PaymentRow>(
    `INSERT INTO x402_payments
       (id, payment_reference, resource, scheme, network, asset,
        amount_tinybar, payer, payee, hedera_tx_id, hcs_tx_id,
        hashscan_url, hcs_hashscan_url, settlement_status, error_reason)
     VALUES ($1,$2,$3,'exact-hedera',$4,'HBAR',$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      id,
      input.paymentReference,
      input.resource,
      input.network,
      input.amountTinybar,
      input.payer,
      input.payee,
      input.hederaTxId,
      input.hcsTxId,
      hashscanTxUrl(input.network, input.hederaTxId),
      input.hcsTxId ? hashscanTxUrl(input.network, input.hcsTxId) : null,
      input.settlementStatus,
      input.errorReason ?? null,
    ],
  );
  return rows[0];
}

/** Backfill the HCS notarization tx id after a best-effort write. */
export async function markHcsNotarized(paymentReference: string, hcsTxId: string): Promise<void> {
  await query(
    `UPDATE x402_payments
        SET hcs_tx_id = $1,
            hcs_hashscan_url = $2
      WHERE payment_reference = $3`,
    [hcsTxId, hashscanTxUrl('hedera:testnet', hcsTxId), paymentReference],
  );
}

/** Public feed: most-recent settled payments. */
export async function listRecentPayments(limit = 50): Promise<PaymentRow[]> {
  const { rows } = await query<PaymentRow>(
    `SELECT * FROM x402_payments
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(limit, 200)],
  );
  return rows;
}

/** Aggregate stats for the public payments feed header. */
export async function paymentStats(): Promise<{
  total: number;
  totalHbar: string;
  settled: number;
}> {
  const { rows } = await query<{ total: string; total_tinybar: string; settled: string }>(
    `SELECT COUNT(*)::text AS total,
            COALESCE(SUM(amount_tinybar), 0)::text AS total_tinybar,
            COUNT(*) FILTER (WHERE settlement_status = 'settled')::text AS settled
       FROM x402_payments`,
  );
  const tinybar = BigInt(rows[0]?.total_tinybar ?? '0');
  return {
    total: Number(rows[0]?.total ?? 0),
    settled: Number(rows[0]?.settled ?? 0),
    totalHbar: (Number(tinybar) / 1e8).toFixed(8),
  };
}
