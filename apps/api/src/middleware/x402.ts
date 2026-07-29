// ─────────────────────────────────────────────────────────────
// x402 V2 payment middleware (Express).
//
// Per-route usage:
//   paidRouter.get('/signals/:id', x402Payment(SIGNAL_PRICE), handler);
//
// Flow:
//   1. No PAYMENT-SIGNATURE header → 402 + PAYMENT-REQUIRED header
//      (base64 PaymentRequired V2) describing the exact-hedera scheme.
//   2. PAYMENT-SIGNATURE present → decode PaymentPayload, re-derive
//      the requirements from OUR price (so the client can't lower the
//      amount by tampering with `accepted`), verify, settle on Hedera.
//   3. Success → PAYMENT-RESPONSE header + req.x402 set, next().
//      Failure → 402 again with a fresh PAYMENT-REQUIRED.
//
// The amount is always taken from the route's ResourcePrice, never
// from the client's echoed `accepted` — only the paymentReference is
// sourced from the payload (and matched against the on-chain memo).
// ─────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http';
import type { PaymentPayload, SettleResponse, PaymentRequirements } from '@x402/core/types';
import { buildPaymentRequired, buildRequirements } from '../services/x402/payment-requirements.js';
import {
  getX402Facilitator,
  getX402RequirementsConfig,
  isX402MerchantEnabled,
} from '../services/x402/config.js';
import { SCHEME, NETWORK, type ResourcePrice } from '../services/x402/types.js';
import { logger } from '../logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    x402?: { settlement: SettleResponse; requirements: PaymentRequirements };
  }
}

/** Build the requirements we verify/settle against, using OUR price. */
function deriveRequirements(
  price: ResourcePrice,
  payload: PaymentPayload,
): PaymentRequirements | null {
  const accepted = payload.accepted as PaymentRequirements | undefined;
  const ref = accepted?.extra?.paymentReference as string | undefined;
  if (!ref) return null;
  // Build from our price, then graft the client's paymentReference.
  const mine = buildRequirements(price, getX402RequirementsConfig());
  mine.extra.paymentReference = ref;
  return mine as PaymentRequirements;
}

/** Send a 402 with the PAYMENT-REQUIRED header + a human-readable body. */
function sendPaymentRequired(
  res: Response,
  price: ResourcePrice,
  resourceUrl: string,
  error?: string,
): void {
  const cfg = getX402RequirementsConfig();
  const paymentRequired = buildPaymentRequired(price, cfg, resourceUrl);
  res.setHeader('PAYMENT-REQUIRED', encodePaymentRequiredHeader(paymentRequired));
  res.status(402).json({
    error: 'payment_required',
    x402Version: paymentRequired.x402Version,
    resource: paymentRequired.resource,
    accepts: paymentRequired.accepts,
    ...(error ? { payment_error: error } : {}),
  });
}

/**
 * Express middleware that gates a route behind an x402 HBAR payment.
 * Returns 402 until a valid PAYMENT-SIGNATURE header settles on Hedera.
 */
export function x402Payment(price: ResourcePrice): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!isX402MerchantEnabled()) {
      // Merchant disabled — fall through (unpaid) so the feature is
      // safely off by default and can't accidentally block traffic.
      return next();
    }

    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const sigHeader = req.headers['payment-signature'] as string | undefined;

    // ── No payment → challenge ────────────────────────────────
    if (!sigHeader) {
      sendPaymentRequired(res, price, resourceUrl);
      return;
    }

    // ── Payment present → verify + settle ─────────────────────
    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(sigHeader);
    } catch {
      sendPaymentRequired(res, price, resourceUrl, 'invalid PAYMENT-SIGNATURE header');
      return;
    }

    // Scheme gate — we only speak exact-hedera.
    if (payload.accepted?.scheme !== SCHEME || payload.accepted?.network !== NETWORK) {
      sendPaymentRequired(
        res,
        price,
        resourceUrl,
        `unsupported scheme/network; expected ${SCHEME} on ${NETWORK}`,
      );
      return;
    }

    const requirements = deriveRequirements(price, payload);
    if (!requirements) {
      sendPaymentRequired(
        res,
        price,
        resourceUrl,
        'paymentReference missing from accepted requirements',
      );
      return;
    }

    const facilitator = getX402Facilitator();
    const verifyResp = await facilitator.verify(payload, requirements);
    if (!verifyResp.isValid) {
      logger.warn(
        { reason: verifyResp.invalidReason, msg: verifyResp.invalidMessage },
        'x402 verify failed',
      );
      sendPaymentRequired(
        res,
        price,
        resourceUrl,
        `${verifyResp.invalidReason}: ${verifyResp.invalidMessage}`,
      );
      return;
    }

    const settleResp = await facilitator.settle(payload, requirements);
    if (!settleResp.success) {
      logger.warn(
        { reason: settleResp.errorReason, msg: settleResp.errorMessage },
        'x402 settle failed',
      );
      sendPaymentRequired(
        res,
        price,
        resourceUrl,
        `${settleResp.errorReason}: ${settleResp.errorMessage}`,
      );
      return;
    }

    // Success — attach settlement + emit the PAYMENT-RESPONSE header.
    res.setHeader('PAYMENT-RESPONSE', encodePaymentResponseHeader(settleResp));
    req.x402 = { settlement: settleResp, requirements };
    logger.info(
      { txId: settleResp.transaction, payer: settleResp.payer, resource: price.resource },
      'x402 payment settled ✓',
    );
    next();
  };
}
