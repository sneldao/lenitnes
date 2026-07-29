// ─────────────────────────────────────────────────────────────
// exact-hedera self-facilitator — verify + settle HBAR payments.
//
// This is the Hedera rail. A client signs a TransferTransaction
// (payer → merchant, memo = paymentReference) and ships the signed
// bytes inside the x402 PaymentPayload. We:
//
//   verify() — decode the signed bytes, confirm it is an HBAR
//     transfer that credits the merchant (payTo) with exactly the
//     required amount, carries the right memo (paymentReference),
//     has no token transfers, and is not a replay.
//
//   settle() — submit the signed transaction to Hedera testnet,
//     confirm SUCCESS, notarize the receipt to HCS, and persist
//     the payment to the x402_payments ledger.
//
// Both the on-chain HBAR transfer and the HCS notarization produce
// their own HashScan link — two auditable on-chain artifacts per
// paid query.
// ─────────────────────────────────────────────────────────────

import {
  Transaction,
  TransferTransaction,
  TopicMessageSubmitTransaction,
  Status,
  type Client,
} from '@hashgraph/sdk';
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from '@x402/core/types';
import { logger } from '../../logger.js';
import { getHederaClient, type HederaClientConfig } from './hedera-client.js';
import { SCHEME, CAIP_FAMILY, NETWORK } from './types.js';
import { isReferenceSettled, recordPayment, markHcsNotarized } from './payments-store.js';

export interface FacilitatorConfig extends HederaClientConfig {
  /** HCS topic id for receipt notarization (0.0.x). */
  topicId: string;
}

/** Decode + validate a signed Hedera TransferTransaction. */
export function decodeSignedTransfer(
  payload: PaymentPayload,
): { tx: TransferTransaction; payer: string } | { error: string; reason: string } {
  const signedHex = payload.payload?.signedTransaction;
  if (!signedHex || typeof signedHex !== 'string') {
    return { error: 'missing_payment', reason: 'signedTransaction not present in payload' };
  }

  let tx: Transaction;
  try {
    const bytes = Buffer.from(signedHex, 'hex');
    tx = Transaction.fromBytes(new Uint8Array(bytes));
  } catch {
    return { error: 'invalid_transaction', reason: 'cannot decode signed transaction bytes' };
  }

  if (!(tx instanceof TransferTransaction)) {
    return { error: 'wrong_transaction_type', reason: 'expected an HBAR TransferTransaction' };
  }

  const transferTx = tx as TransferTransaction;
  const txId = transferTx.transactionId;
  const payer = txId?.accountId?.toString();
  if (!payer) {
    return { error: 'missing_payer', reason: 'transaction has no payer account id' };
  }

  return { tx: transferTx, payer };
}

/** Sum the HBAR credited to a given account across all transfers. */
function creditTo(transferTx: TransferTransaction, accountId: string): bigint {
  let credit = 0n;
  for (const t of transferTx.hbarTransfersList) {
    if (t.accountId.toString() === accountId) {
      credit += BigInt(t.amount.toTinybars().toString());
    }
  }
  return credit;
}

/** True if the transfer carries any token (non-HBAR) movements. */
function hasTokenTransfers(transferTx: TransferTransaction): boolean {
  const tokens = transferTx.tokenTransfers as unknown as Map<unknown, unknown>;
  const nfts = transferTx.nftTransfers as unknown as Map<unknown, unknown>;
  return (tokens?.size ?? 0) > 0 || (nfts?.size ?? 0) > 0;
}

export class HederaFacilitator {
  readonly scheme = SCHEME;
  readonly caipFamily = CAIP_FAMILY;
  private readonly cfg: FacilitatorConfig;

  constructor(cfg: FacilitatorConfig) {
    this.cfg = cfg;
  }

  getExtra(): Record<string, unknown> | undefined {
    return undefined;
  }

  getSigners(): string[] {
    return [this.cfg.operatorId];
  }

  /**
   * Verify a payment without settling. Confirms the signed
   * TransferTransaction credits the merchant with the exact required
   * amount, carries the paymentReference as its memo, is HBAR-only,
   * and has not already been settled (replay guard).
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const ref = requirements.extra?.paymentReference;
    if (!ref || typeof ref !== 'string') {
      return {
        isValid: false,
        invalidReason: 'missing_reference',
        invalidMessage: 'no paymentReference in requirements',
      };
    }

    const decoded = decodeSignedTransfer(payload);
    if ('error' in decoded) {
      return { isValid: false, invalidReason: decoded.error, invalidMessage: decoded.reason };
    }
    const { tx, payer } = decoded;

    if (tx.transactionMemo !== ref) {
      return {
        isValid: false,
        invalidReason: 'memo_mismatch',
        invalidMessage: 'transfer memo does not match paymentReference',
      };
    }

    const required = BigInt(requirements.amount);
    const merchantCredit = creditTo(tx, requirements.payTo);
    if (merchantCredit < required) {
      return {
        isValid: false,
        invalidReason: 'insufficient_amount',
        invalidMessage: `merchant credit ${merchantCredit} tinybar < required ${required} tinybar`,
      };
    }

    if (payer === requirements.payTo) {
      return {
        isValid: false,
        invalidReason: 'self_payment',
        invalidMessage: 'payer equals payee',
      };
    }

    if (hasTokenTransfers(tx)) {
      return {
        isValid: false,
        invalidReason: 'non_hbar_asset',
        invalidMessage: 'transfer contains token transfers; only HBAR is accepted',
      };
    }

    if (await isReferenceSettled(ref)) {
      return {
        isValid: false,
        invalidReason: 'replay',
        invalidMessage: 'paymentReference already settled',
      };
    }

    return { isValid: true, payer };
  }

  /**
   * Settle: submit the signed transaction to Hedera testnet, confirm
   * SUCCESS, notarize the receipt to HCS, persist to the ledger.
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const ref = (requirements.extra?.paymentReference as string) ?? '';
    const resource = (requirements.extra?.description as string) ?? 'unknown';
    const client = getHederaClient(this.cfg);

    const decoded = decodeSignedTransfer(payload);
    if ('error' in decoded) {
      return {
        success: false,
        errorReason: decoded.error,
        errorMessage: decoded.reason,
        transaction: '',
        network: NETWORK,
      };
    }
    const { tx, payer } = decoded;

    if (await isReferenceSettled(ref)) {
      return {
        success: false,
        errorReason: 'replay',
        errorMessage: 'paymentReference already settled',
        transaction: '',
        network: NETWORK,
        payer,
      };
    }

    const txId = tx.transactionId?.toString() ?? '';
    logger.info({ txId, payer, ref, resource }, 'x402 settling HBAR payment on Hedera');

    // ── 1. submit the signed HBAR transfer ────────────────────
    let receipt;
    try {
      const resp = await tx.execute(client);
      receipt = await resp.getReceipt(client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, txId, ref }, 'x402 HBAR settlement failed');
      await recordPayment({
        paymentReference: ref,
        resource,
        network: NETWORK,
        amountTinybar: requirements.amount,
        payer,
        payee: requirements.payTo,
        hederaTxId: txId,
        hcsTxId: null,
        settlementStatus: 'failed',
        errorReason: msg,
      }).catch(() => undefined);
      return {
        success: false,
        errorReason: 'settlement_failed',
        errorMessage: msg,
        transaction: txId,
        network: NETWORK,
        payer,
      };
    }

    if (receipt.status !== Status.Success) {
      const reason = `transaction status ${receipt.status.toString()}`;
      await recordPayment({
        paymentReference: ref,
        resource,
        network: NETWORK,
        amountTinybar: requirements.amount,
        payer,
        payee: requirements.payTo,
        hederaTxId: txId,
        hcsTxId: null,
        settlementStatus: 'failed',
        errorReason: reason,
      }).catch(() => undefined);
      return {
        success: false,
        errorReason: 'non_success_status',
        errorMessage: reason,
        transaction: txId,
        network: NETWORK,
        payer,
      };
    }

    logger.info({ txId, ref }, 'x402 HBAR transfer settled — notarizing to HCS');

    // ── 2. notarize the receipt to HCS (best-effort) ──────────
    let hcsTxId: string | null = null;
    try {
      hcsTxId = await this.notarizeToHcs(client, {
        paymentReference: ref,
        resource,
        payer,
        payee: requirements.payTo,
        amountTinybar: requirements.amount,
        hederaTxId: txId,
      });
    } catch (err) {
      logger.warn({ err, txId, ref }, 'x402 HCS notarization failed (payment still settled)');
    }

    // ── 3. persist to the ledger ──────────────────────────────
    await recordPayment({
      paymentReference: ref,
      resource,
      network: NETWORK,
      amountTinybar: requirements.amount,
      payer,
      payee: requirements.payTo,
      hederaTxId: txId,
      hcsTxId,
      settlementStatus: 'settled',
    });

    return {
      success: true,
      transaction: txId,
      network: NETWORK,
      payer,
      amount: requirements.amount,
      extra: { hcsTxId, hashscan: `https://hashscan.io/testnet/transaction/${txId}` },
    };
  }

  /** Submit a receipt-notarization message to the HCS topic. */
  private async notarizeToHcs(
    client: Client,
    data: {
      paymentReference: string;
      resource: string;
      payer: string;
      payee: string;
      amountTinybar: string;
      hederaTxId: string;
    },
  ): Promise<string | null> {
    const message = JSON.stringify({
      kind: 'x402-payment',
      scheme: SCHEME,
      network: NETWORK,
      ...data,
      timestamp: new Date().toISOString(),
    });
    const resp = await new TopicMessageSubmitTransaction()
      .setTopicId(this.cfg.topicId)
      .setMessage(message)
      .setTransactionMemo(`LENITNES x402 receipt ${data.paymentReference.slice(0, 8)}`)
      .execute(client);
    const receipt = await resp.getReceipt(client);
    const hcsTxId = resp.transactionId.toString();
    if (receipt.status === Status.Success) {
      await markHcsNotarized(data.paymentReference, hcsTxId).catch(() => undefined);
      logger.info({ hcsTxId, ref: data.paymentReference }, 'x402 receipt notarized to HCS');
      return hcsTxId;
    }
    return null;
  }
}

/** Build the facilitator from operator config. */
export function createHederaFacilitator(cfg: FacilitatorConfig): HederaFacilitator {
  return new HederaFacilitator(cfg);
}
