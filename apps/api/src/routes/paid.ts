// ─────────────────────────────────────────────────────────────
// Paid routes — x402-gated endpoints that settle in HBAR on Hedera.
//
// Each route is protected by the x402Payment middleware. An
// autonomous agent pays per query; on success the handler serves
// the real data and echoes the on-chain settlement in the response.
//
//   GET /paid/signals/:id  — full signal proof package (0.5 HBAR)
//   GET /paid/feed         — recent high-conviction signals (0.25 HBAR)
//   GET /paid/scorecard    — live public track record (0.5 HBAR)
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from 'express';
import { query } from '../db/pool.js';
import { x402Payment } from '../middleware/x402.js';
import { getSignalWithProof } from './signals.js';
import * as scorecard from '../services/scorecard.js';
import { config } from '../config.js';
import { type ResourcePrice } from '../services/x402/types.js';

export const paidRouter = Router();

const PRICE = config.x402Merchant.priceHbar;

const SIGNAL_PRICE: ResourcePrice = {
  resource: '/paid/signals/:id',
  description:
    'LENITNES signal — full proof package (HCS-anchored thesis, detector classifications, outcome verdict)',
  mimeType: 'application/json',
  priceHbar: PRICE,
  outputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      direction: { type: 'string' },
      hedera_tx_id: { type: 'string' },
    },
  },
};

const FEED_PRICE: ResourcePrice = {
  resource: '/paid/feed',
  description:
    'LENITNES recent signals feed — latest high-conviction calls with detector consensus',
  mimeType: 'application/json',
  priceHbar: Math.max(PRICE / 2, 0.05),
  outputSchema: { type: 'array' },
};

const SCORECARD_PRICE: ResourcePrice = {
  resource: '/paid/scorecard',
  description: 'LENITNES live scorecard — hit ratio, Sharpe, drawdown, per-detector outcomes',
  mimeType: 'application/json',
  priceHbar: PRICE,
  outputSchema: { type: 'object' },
};

/** Attach the settlement receipt to the JSON response body. */
function withSettlement(req: Request, body: unknown): unknown {
  if (!req.x402) return body;
  const s = req.x402.settlement;
  return {
    ...(typeof body === 'object' && body !== null ? body : { data: body }),
    x402_settlement: {
      success: s.success,
      transaction: s.transaction,
      network: s.network,
      payer: s.payer,
      amount_tinybar: s.amount,
      hashscan_url: `https://hashscan.io/testnet/transaction/${s.transaction}`,
      hcs_tx_id: s.extra?.hcsTxId ?? null,
      hcs_hashscan_url: s.extra?.hcsTxId
        ? `https://hashscan.io/testnet/transaction/${s.extra.hcsTxId}`
        : null,
    },
  };
}

// GET /paid/signals/:id — full proof package behind a paywall.
paidRouter.get('/signals/:id', x402Payment(SIGNAL_PRICE), async (req: Request, res: Response) => {
  const pkg = await getSignalWithProof(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'not_found' });
  res.json(withSettlement(req, pkg.signal));
});

// GET /paid/feed — recent high-conviction signals.
paidRouter.get('/feed', x402Payment(FEED_PRICE), async (_req: Request, res: Response) => {
  const { rows } = await query(
    `SELECT s.id, s.detected_at, s.condition_summary, s.evidence_text,
            s.hedera_tx_id, s.hedera_hcs_message_id, m.url AS monitor_url
       FROM signals s
       JOIN monitors m ON m.id = s.monitor_id
      WHERE s.is_heartbeat = false
      ORDER BY s.detected_at DESC
      LIMIT 20`,
  );
  res.json(withSettlement(_req, rows));
});

// GET /paid/scorecard — live track record.
paidRouter.get('/scorecard', x402Payment(SCORECARD_PRICE), async (req: Request, res: Response) => {
  try {
    const data = await scorecard.overall();
    res.json(withSettlement(req, data));
  } catch {
    res.status(500).json({ error: 'scorecard_unavailable' });
  }
});

// GET /paid — directory of paid endpoints (free; shows prices).
paidRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    scheme: 'exact-hedera',
    network: config.x402Merchant.network,
    asset: 'HBAR',
    payee: config.x402Merchant.payee,
    endpoints: [
      {
        path: '/paid/signals/:id',
        priceHbar: SIGNAL_PRICE.priceHbar,
        description: SIGNAL_PRICE.description,
      },
      { path: '/paid/feed', priceHbar: FEED_PRICE.priceHbar, description: FEED_PRICE.description },
      {
        path: '/paid/scorecard',
        priceHbar: SCORECARD_PRICE.priceHbar,
        description: SCORECARD_PRICE.description,
      },
    ],
    instructions:
      'Send a GET request; you will receive 402 with a PAYMENT-REQUIRED header. Sign an HBAR TransferTransaction (payer→payee, memo=paymentReference) and retry with a PAYMENT-SIGNATURE header.',
  });
});
