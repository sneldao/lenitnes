// ─────────────────────────────────────────────────────────────
// Public payments feed — every settled x402 micropayment, with
// both HashScan links (HBAR transfer + HCS notarization).
// Free, no auth. This is the audit surface for the bounty submission.
// ─────────────────────────────────────────────────────────────

import { Router, type Request, type Response } from 'express';
import { listRecentPayments, paymentStats } from '../services/x402/payments-store.js';

export const paymentsRouter = Router();

// GET /payments — recent settled payments + aggregate stats.
paymentsRouter.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const [payments, stats] = await Promise.all([listRecentPayments(limit), paymentStats()]);
  res.json({ stats, payments });
});

// GET /payments/:ref — not needed yet; the list is small.
