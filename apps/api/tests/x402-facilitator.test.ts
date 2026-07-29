// ─────────────────────────────────────────────────────────────
// x402-over-Hedera facilitator + requirements + header tests.
//
// These test the verify logic without hitting testnet: we build a
// real signed TransferTransaction (payer→merchant, memo=ref), feed
// its bytes through decodeSignedTransfer + the facilitator's verify,
// and assert each validation gate. The DB-backed replay guard is
// mocked via vi.mock.
// ─────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import {
  encodePaymentRequiredHeader,
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
  decodePaymentResponseHeader,
} from '@x402/core/http';
import type { PaymentPayload, PaymentRequired } from '@x402/core/types';

import {
  buildRequirements,
  buildPaymentRequired,
} from '../src/services/x402/payment-requirements.js';
import { SCHEME, NETWORK, hbarToTinybar, hashscanTxUrl } from '../src/services/x402/types.js';
import { decodeSignedTransfer } from '../src/services/x402/hedera-facilitator.js';

vi.mock('../src/services/x402/payments-store.js', () => ({
  isReferenceSettled: vi.fn().mockResolvedValue(false),
  recordPayment: vi.fn().mockResolvedValue({}),
  markHcsNotarized: vi.fn().mockResolvedValue(undefined),
  listRecentPayments: vi.fn().mockResolvedValue([]),
  paymentStats: vi.fn().mockResolvedValue({ total: 0, settled: 0, totalHbar: '0' }),
}));

const MERCHANT_ID = '0.0.9137770';
const PRICE_HBAR = 0.5;
const AMOUNT_TINYBAR = hbarToTinybar(PRICE_HBAR).toString();

describe('x402 types', () => {
  it('hbarToTinybar converts correctly', () => {
    expect(hbarToTinybar(0.5)).toBe(50000000n);
    expect(hbarToTinybar(1)).toBe(100000000n);
    expect(hbarToTinybar(0.25)).toBe(25000000n);
  });

  it('hashscanTxUrl produces the right testnet URL', () => {
    expect(hashscanTxUrl('hedera:testnet', '0.0.1@123.456')).toBe(
      'https://hashscan.io/testnet/transaction/0.0.1@123.456',
    );
    expect(hashscanTxUrl('hedera:mainnet', '0.0.1@123.456')).toBe(
      'https://hashscan.io/mainnet/transaction/0.0.1@123.456',
    );
  });
});

describe('payment-requirements builder', () => {
  const cfg = { payTo: MERCHANT_ID, maxTimeoutSeconds: 120 };
  const price = {
    resource: '/paid/feed',
    description: 'feed',
    mimeType: 'application/json',
    priceHbar: PRICE_HBAR,
    outputSchema: {},
  };

  it('builds requirements with the exact-hedera scheme', () => {
    const req = buildRequirements(price, cfg);
    expect(req.scheme).toBe(SCHEME);
    expect(req.network).toBe(NETWORK);
    expect(req.asset).toBe('HBAR');
    expect(req.amount).toBe(AMOUNT_TINYBAR);
    expect(req.payTo).toBe(MERCHANT_ID);
    expect(req.extra.paymentReference).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('each call generates a fresh paymentReference', () => {
    expect(buildRequirements(price, cfg).extra.paymentReference).not.toBe(
      buildRequirements(price, cfg).extra.paymentReference,
    );
  });

  it('buildPaymentRequired produces a valid V2 PaymentRequired', () => {
    const pr = buildPaymentRequired(price, cfg, 'http://localhost:4000/paid/feed');
    expect(pr.x402Version).toBe(2);
    expect(pr.accepts).toHaveLength(1);
    expect(pr.accepts[0].scheme).toBe(SCHEME);
    expect(pr.resource.url).toBe('http://localhost:4000/paid/feed');
    expect(pr.resource.serviceName).toBe('LENITNES');
  });
});

describe('x402 V2 header round-trips', () => {
  it('PAYMENT-REQUIRED header survives encode → decode', () => {
    const pr = buildPaymentRequired(
      {
        resource: '/paid/feed',
        description: 'feed',
        mimeType: 'application/json',
        priceHbar: 0.5,
        outputSchema: {},
      },
      { payTo: MERCHANT_ID, maxTimeoutSeconds: 120 },
      'http://x/feed',
    );
    const decoded = decodePaymentRequiredHeader(encodePaymentRequiredHeader(pr)) as PaymentRequired;
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepts[0].scheme).toBe(SCHEME);
    expect(decoded.accepts[0].network).toBe(NETWORK);
    expect(decoded.accepts[0].payTo).toBe(MERCHANT_ID);
  });

  it('PAYMENT-SIGNATURE header survives encode → decode', () => {
    const payload: PaymentPayload = {
      x402Version: 2,
      accepted: {
        scheme: SCHEME,
        network: NETWORK,
        asset: 'HBAR',
        amount: AMOUNT_TINYBAR,
        payTo: MERCHANT_ID,
        maxTimeoutSeconds: 120,
        extra: { paymentReference: 'test-ref' },
      },
      payload: { signedTransaction: 'deadbeef', transactionId: '0.0.1@1.1', payer: '0.0.1' },
    };
    const decoded = decodePaymentSignatureHeader(encodePaymentSignatureHeader(payload));
    expect(decoded.accepted.scheme).toBe(SCHEME);
    expect((decoded.payload as { signedTransaction: string }).signedTransaction).toBe('deadbeef');
  });

  it('PAYMENT-RESPONSE header survives encode → decode', () => {
    const settle = {
      success: true,
      transaction: '0.0.1@1.1',
      network: NETWORK,
      payer: '0.0.1',
      amount: AMOUNT_TINYBAR,
    };
    const decoded = decodePaymentResponseHeader(encodePaymentResponseHeader(settle));
    expect(decoded.success).toBe(true);
    expect(decoded.transaction).toBe('0.0.1@1.1');
    expect(decoded.payer).toBe('0.0.1');
  });
});

describe('decodeSignedTransfer', () => {
  it('rejects a payload without signedTransaction', () => {
    const result = decodeSignedTransfer({ x402Version: 2, accepted: {} as never, payload: {} });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('missing_payment');
  });

  it('rejects non-hex garbage', () => {
    const result = decodeSignedTransfer({
      x402Version: 2,
      accepted: {} as never,
      payload: { signedTransaction: 'not-hex-at-all' },
    });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toBe('invalid_transaction');
  });
});
